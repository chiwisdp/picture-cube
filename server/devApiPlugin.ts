/**
 * Dev-only `POST /api/analyze` route, mounted on the Vite dev server.
 *
 * This exists so `OPENROUTER_API_KEY` never reaches the browser bundle. It is
 * deliberately not deployed: `apply: 'serve'` keeps it out of `vite build`
 * entirely, and all the real work lives in `analyzeImage.ts` so a production
 * handler can reuse it untouched.
 */

import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
  analyzeImage,
  AnalyzeError,
  analyzeRequestSchema,
  DEFAULT_ANALYZE_MODEL,
  toAnalyzeError,
  type AnalyzeErrorBody,
} from './analyzeImage.ts';

export const ANALYZE_ROUTE = '/api/analyze';

/**
 * Generous ceiling for `{ base64, mediaType, metadata }`: the client sends a
 * 1024px JPEG, so a body anywhere near this is a bug or an attack rather than
 * a legitimate upload.
 */
export const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

const ENV_KEY = 'OPENROUTER_API_KEY';
const ENV_MODEL = 'OPENROUTER_MODEL';

const sendJson = (res: ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
};

const sendError = (res: ServerResponse, error: AnalyzeError): void => {
  const body: AnalyzeErrorBody = error.toBody();
  sendJson(res, error.status, body);
};

/**
 * Connect hands us the raw stream, so the body is accumulated by hand and the
 * limit is enforced while it arrives rather than after, to avoid buffering an
 * oversized payload just to reject it.
 */
const readBody = (req: IncomingMessage, limit: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    /**
     * Pauses rather than destroys: tearing the socket down here would race the
     * error response and surface to the browser as a network failure instead
     * of the 413 that explains what went wrong.
     */
    const fail = (error: AnalyzeError): void => {
      if (settled) return;
      settled = true;
      req.pause();
      reject(error);
    };

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      received += chunk.length;
      if (received > limit) {
        fail(
          new AnalyzeError(
            413,
            'payload_too_large',
            `The request body exceeds the ${Math.round(limit / 1024 / 1024)}MB limit.`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });

    req.on('error', () => {
      fail(new AnalyzeError(400, 'invalid_request', 'The request body could not be read.'));
    });
  });

const parseRequest = (raw: string) => {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AnalyzeError(400, 'invalid_json', 'The request body is not valid JSON.');
  }

  const parsed = analyzeRequestSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new AnalyzeError(
      400,
      'invalid_request',
      'The request body is not a valid analyze request.',
      details,
    );
  }

  return parsed.data;
};

/**
 * A missing key disables analysis and nothing else. Drop, decode, metadata,
 * the cube, thumbnails and crop generation all work without one, so the dev
 * server has to keep serving; only this route goes dark.
 */
const MISSING_KEY_MESSAGE =
  `${ENV_KEY} is not set on the dev server, so AI analysis is unavailable. ` +
  `Copy .env.example to .env, set ${ENV_KEY}=your-key, and restart the dev server. ` +
  'Everything else — decoding, metadata and crop generation — works without it.';

export const devApiPlugin = (): Plugin => {
  let apiKey = '';
  let model = DEFAULT_ANALYZE_MODEL;

  return {
    name: 'picture-cube:dev-api',
    apply: 'serve',

    config(config, env) {
      const envDir = config.envDir ?? config.root ?? process.cwd();
      const loaded = loadEnv(env.mode, envDir, 'OPENROUTER_');
      apiKey = loaded[ENV_KEY] ?? '';
      const fromEnv = loaded[ENV_MODEL]?.trim();
      if (fromEnv) model = fromEnv;
    },

    configureServer(server) {
      if (!apiKey) {
        // `warn` rather than `error`: this is a degraded mode, not a failure.
        // It also sets the logger's warned flag, which stops Vite clearing the
        // screen when it prints the ready banner, so the notice survives.
        server.config.logger.warn(`[picture-cube] ${MISSING_KEY_MESSAGE}`);
      } else {
        server.config.logger.info(
          `[picture-cube] AI analysis enabled via OpenRouter (model: ${model}).`,
        );
      }

      server.middlewares.use(ANALYZE_ROUTE, (req, res, next) => {
        if (req.method !== 'POST') {
          if (req.method === 'GET' || req.method === 'HEAD') {
            next();
            return;
          }
          res.setHeader('Allow', 'POST');
          sendError(
            res,
            new AnalyzeError(405, 'method_not_allowed', `${ANALYZE_ROUTE} only accepts POST.`),
          );
          return;
        }

        const contentType = req.headers['content-type'] ?? '';
        if (!contentType.toLowerCase().includes('application/json')) {
          sendError(
            res,
            new AnalyzeError(
              415,
              'unsupported_media_type',
              'Send the request with Content-Type: application/json.',
            ),
          );
          return;
        }

        if (!apiKey) {
          sendError(res, new AnalyzeError(503, 'analysis_disabled', MISSING_KEY_MESSAGE));
          return;
        }

        void (async () => {
          try {
            const request = parseRequest(await readBody(req, MAX_REQUEST_BYTES));
            const result = await analyzeImage(request, { apiKey, model });
            sendJson(res, 200, result);
          } catch (cause) {
            const error = toAnalyzeError(cause);
            // Only the code and message: never the key, never the base64 body.
            server.config.logger.error(
              `[picture-cube] ${ANALYZE_ROUTE} ${error.status} ${error.code}: ${error.message}`,
            );
            if (res.writableEnded) return;
            sendError(res, error);
          }
        })();
      });
    },
  };
};
