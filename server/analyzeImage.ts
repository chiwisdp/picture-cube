/**
 * Framework-agnostic OpenRouter call behind `POST /api/analyze`.
 *
 * Nothing in here knows about Vite, Connect or `http`, so the dev-server
 * plugin can be swapped for a real production handler without touching this
 * file. It owns the request contract, the prompt, and the mapping from
 * upstream failures to HTTP statuses; the transport layer only has to read
 * `AnalyzeError.status` and serialise `toBody()`.
 *
 * Uses OpenRouter's OpenAI-compatible Chat Completions API over plain `fetch`
 * — no SDK — so deps stay light.
 */

import { z } from 'zod';

import { imageAnalysisSchema, type ImageAnalysis } from '../src/lib/analysis/schema.ts';
import { formatWebRolesForPrompt } from '../src/lib/analysis/webRoles.ts';

/** OpenRouter Chat Completions endpoint. */
export const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Default vision model on OpenRouter. Claude Sonnet 5 supports image input and
 * structured JSON; override with `OPENROUTER_MODEL` (via the Vite plugin).
 */
export const DEFAULT_ANALYZE_MODEL = 'anthropic/claude-sonnet-5';

/** Alias kept for callers that still import `ANALYZE_MODEL`. */
export const ANALYZE_MODEL = DEFAULT_ANALYZE_MODEL;

export const MAX_OUTPUT_TOKENS = 8192;

/** Upstream call timeout. */
export const ANALYZE_TIMEOUT_MS = 120_000;

/** Attribution headers OpenRouter asks for (ranking / analytics). */
export const OPENROUTER_HTTP_REFERER = 'http://localhost:5173';
export const OPENROUTER_APP_TITLE = 'Picture Cube';

/** Media types accepted for the preview image (OpenAI vision data URLs). */
export const supportedMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export type SupportedMediaType = (typeof supportedMediaTypes)[number];

/**
 * Bounding the base64 string at 5MB caps the decoded image at roughly 3.75MB.
 * The client sends a 1024px JPEG and should never come close.
 */
export const MAX_IMAGE_BASE64_LENGTH = 5 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Request contract                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Facts measured in the browser from the *original* upload, not from the
 * downscaled JPEG preview that is actually sent. Passing them as ground truth
 * is what stops the model inventing dimensions, weights and DPI.
 */
export const imageMetadataSchema = z.object({
  /** Detected from magic bytes, e.g. `jpeg`, `png`, `svg`, `tiff`. */
  sourceFormat: z.string().min(1),
  /** Intrinsic width of the original in pixels. */
  width: z.number().int().positive(),
  /** Intrinsic height of the original in pixels. */
  height: z.number().int().positive(),
  /** Size of the original file on disk, in bytes. */
  byteSize: z.number().int().nonnegative(),
  fileName: z.string().nullish(),
  isVector: z.boolean().default(false),
  isAnimated: z.boolean().default(false),
  megapixels: z.number().nonnegative().nullish(),
  aspectRatio: z.number().positive().nullish(),
  /** Display form of the ratio, e.g. `3:2`. */
  aspectRatioLabel: z.string().nullish(),
  bytesPerPixel: z.number().nonnegative().nullish(),
  dpi: z.number().positive().nullish(),
  /** Result of a real alpha scan, not just "the format supports alpha". */
  hasAlpha: z.boolean().nullish(),
  colorSpace: z.string().nullish(),
  /** Dominant colours as hex strings, most prominent first. */
  palette: z.array(z.string()).nullish(),
  /** Flattened EXIF/IPTC/XMP pairs, e.g. `{ Make: 'Fujifilm', ISO: 400 }`. */
  exif: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullish(),
  /** Free-form extra context for the model, one sentence per entry. */
  notes: z.array(z.string()).nullish(),
});

export const analyzeRequestSchema = z.object({
  /** Raw base64 of a downscaled preview. No `data:` URL prefix. */
  base64: z.string().min(1),
  mediaType: z.enum(supportedMediaTypes),
  metadata: imageMetadataSchema,
});

export type ImageMetadataInput = z.infer<typeof imageMetadataSchema>;
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export type AnalyzeUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AnalyzeResult = {
  analysis: ImageAnalysis;
  model: string;
  usage: AnalyzeUsage;
};

export type AnalyzeOptions = {
  apiKey: string;
  /** OpenRouter model id; defaults to `DEFAULT_ANALYZE_MODEL`. */
  model?: string;
  signal?: AbortSignal;
};

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

export type AnalyzeErrorCode =
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'invalid_json'
  | 'invalid_request'
  | 'image_too_large'
  /** No `OPENROUTER_API_KEY` on the server, so the route is deliberately off. */
  | 'analysis_disabled'
  | 'upstream_auth'
  | 'upstream_rate_limited'
  | 'upstream_rejected_request'
  | 'upstream_model_not_found'
  | 'upstream_timeout'
  | 'upstream_unreachable'
  | 'upstream_error'
  | 'empty_response'
  | 'response_truncated'
  | 'request_aborted'
  | 'internal_error';

export type AnalyzeErrorBody = {
  error: {
    code: AnalyzeErrorCode;
    message: string;
    /** Per-field validation messages. Present only for `invalid_request`. */
    details?: string[];
  };
};

/** Every failure a caller can observe, carrying the status it should become. */
export class AnalyzeError extends Error {
  declare status: number;
  declare code: AnalyzeErrorCode;
  declare details: string[] | undefined;

  constructor(status: number, code: AnalyzeErrorCode, message: string, details?: string[]) {
    super(message);
    this.name = 'AnalyzeError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toBody(): AnalyzeErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

/**
 * Collapses anything thrown during a call into an `AnalyzeError`. Upstream
 * failures keep their identity; nothing from the upstream body is copied into
 * the message, so a key or a payload can never leak through here.
 */
export const toAnalyzeError = (cause: unknown): AnalyzeError => {
  if (cause instanceof AnalyzeError) return cause;

  if (cause instanceof Error && cause.name === 'AbortError') {
    return new AnalyzeError(499, 'request_aborted', 'The analysis request was cancelled.');
  }

  if (cause instanceof Error && cause.name === 'TimeoutError') {
    return new AnalyzeError(504, 'upstream_timeout', 'OpenRouter did not respond in time.');
  }

  if (cause instanceof TypeError) {
    return new AnalyzeError(502, 'upstream_unreachable', 'Could not reach OpenRouter.');
  }

  return new AnalyzeError(500, 'internal_error', 'Image analysis failed unexpectedly.');
};

/**
 * Pull a short, user-safe reason out of an OpenRouter error body without
 * echoing keys, base64 payloads, or giant metadata blobs.
 */
const extractUpstreamMessage = (body: unknown): string | null => {
  if (!body || typeof body !== 'object') return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === 'string' && error.trim()) return error.trim().slice(0, 280);
  if (!error || typeof error !== 'object') return null;

  const record = error as {
    message?: unknown;
    metadata?: { raw?: unknown };
  };

  if (typeof record.metadata?.raw === 'string') {
    try {
      const nested = JSON.parse(record.metadata.raw) as {
        error?: { message?: unknown };
        message?: unknown;
      };
      const nestedMessage =
        (typeof nested.error?.message === 'string' && nested.error.message) ||
        (typeof nested.message === 'string' && nested.message) ||
        null;
      if (nestedMessage) return nestedMessage.trim().slice(0, 280);
    } catch {
      // fall through to the top-level message
    }
  }

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim().slice(0, 280);
  }

  return null;
};

const mapUpstreamHttpError = (status: number, model: string, body?: unknown): AnalyzeError => {
  const upstream = extractUpstreamMessage(body);

  if (status === 401 || status === 403) {
    return new AnalyzeError(
      502,
      'upstream_auth',
      'OpenRouter rejected the server credentials. Check OPENROUTER_API_KEY in .env.',
    );
  }

  if (status === 429) {
    return new AnalyzeError(
      429,
      'upstream_rate_limited',
      'OpenRouter is rate limiting this key. Wait a moment and analyze again.',
    );
  }

  if (status === 404) {
    return new AnalyzeError(
      502,
      'upstream_model_not_found',
      `OpenRouter does not recognise the model "${model}".`,
    );
  }

  if (status === 400 || status === 422) {
    const detail = upstream ? ` (${upstream})` : '';
    return new AnalyzeError(
      400,
      'upstream_rejected_request',
      `OpenRouter rejected the request${detail}.`,
    );
  }

  if (status === 408 || status === 504) {
    return new AnalyzeError(504, 'upstream_timeout', 'OpenRouter did not respond in time.');
  }

  return new AnalyzeError(
    502,
    'upstream_error',
    upstream ? `OpenRouter returned an error: ${upstream}` : 'OpenRouter returned an error.',
  );
};

/* -------------------------------------------------------------------------- */
/* Prompt                                                                      */
/* -------------------------------------------------------------------------- */

const buildSystemPrompt = (): string =>
  [
    'You are a senior art director and web performance engineer reviewing an image for use on a website.',
    '',
    'The image attached to this conversation is a downscaled JPEG preview rendered in the browser, at most 1024px on its long edge. Read composition, subject, colour and mood from it, but treat the MEASURED FILE FACTS in the user message as the only truth about the real file: they describe the original upload, which may be a different format, a different size and a different weight. Never state a number that was not measured for you, and never guess at dimensions, file size, DPI or colour values.',
    '',
    'Score the image against every one of these web slots. The pixel targets are the exact ones a crop generator will use, so judge each slot against the crop its ratio would actually force on this composition:',
    '',
    formatWebRolesForPrompt(),
    '',
    'Rules:',
    '- Return one roleFits entry for every role id listed above, including the ones that fit badly. A low score with a clear reason is useful.',
    '- Spread fitScore across the range. If everything lands between 60 and 80 you are not discriminating.',
    '- focalPoint drives real crop rectangles. Place it on the actual centre of interest, to two decimal places, not at 0.5, 0.5 by default.',
    '- Judge technicalIssues, optimization and targetMaxWeightKb against the measured facts, not against the preview you can see.',
    '- If the source is vector, say so in formatAdvice and prefer keeping it vector for logo and icon work rather than recommending a raster export.',
    '- If the source is animated, remember you are only seeing the first frame and factor that into role fit.',
    '- The measured palette is given to you as hex. Interpret it in paletteDescription; do not list the hex codes back.',
    '- Respond with a single JSON object that matches the provided schema. No markdown, no commentary outside the JSON.',
  ].join('\n');

const formatBoolean = (value: boolean): string => (value ? 'yes' : 'no');

const formatNumber = (value: number, fractionDigits: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(fractionDigits);

/** Renders only what was actually measured, so absent fields read as absent. */
const formatMetadataForPrompt = (metadata: ImageMetadataInput): string => {
  const lines: string[] = [
    `- source format: ${metadata.sourceFormat}`,
    `- intrinsic dimensions: ${metadata.width} x ${metadata.height} px`,
    `- file size: ${formatNumber(metadata.byteSize / 1024, 1)} KB (${metadata.byteSize} bytes)`,
    `- vector: ${formatBoolean(metadata.isVector)}`,
    `- animated: ${formatBoolean(metadata.isAnimated)}`,
  ];

  if (metadata.fileName) lines.push(`- file name: ${metadata.fileName}`);
  if (metadata.aspectRatioLabel) lines.push(`- aspect ratio: ${metadata.aspectRatioLabel}`);
  else if (metadata.aspectRatio)
    lines.push(`- aspect ratio: ${formatNumber(metadata.aspectRatio, 3)}`);
  if (metadata.megapixels) lines.push(`- megapixels: ${formatNumber(metadata.megapixels, 2)} MP`);
  if (metadata.dpi) lines.push(`- DPI: ${formatNumber(metadata.dpi, 1)}`);
  if (metadata.bytesPerPixel) {
    lines.push(`- bytes per pixel: ${formatNumber(metadata.bytesPerPixel, 3)}`);
  }
  if (typeof metadata.hasAlpha === 'boolean') {
    lines.push(`- uses real transparency: ${formatBoolean(metadata.hasAlpha)}`);
  }
  if (metadata.colorSpace) lines.push(`- colour space: ${metadata.colorSpace}`);
  if (metadata.palette && metadata.palette.length > 0) {
    lines.push(`- measured palette, most dominant first: ${metadata.palette.join(', ')}`);
  }

  const exifEntries = Object.entries(metadata.exif ?? {});
  if (exifEntries.length > 0) {
    lines.push('- embedded metadata:');
    for (const [key, value] of exifEntries) lines.push(`  - ${key}: ${String(value)}`);
  } else {
    lines.push('- embedded metadata: none present');
  }

  if (metadata.notes && metadata.notes.length > 0) {
    lines.push('- extra context:');
    for (const note of metadata.notes) lines.push(`  - ${note}`);
  }

  return lines.join('\n');
};

const buildUserPrompt = (metadata: ImageMetadataInput): string =>
  [
    'MEASURED FILE FACTS (ground truth, measured in the browser from the original upload):',
    formatMetadataForPrompt(metadata),
    '',
    'Analyse the attached preview against these facts and return the structured analysis.',
  ].join('\n');

/* -------------------------------------------------------------------------- */
/* JSON schema for OpenRouter structured outputs                               */
/* -------------------------------------------------------------------------- */

/**
 * Anthropic (via OpenRouter) rejects numeric/string/array constraint keywords
 * in `json_schema`. Zod emits several of them — e.g. `.min(0).max(1)` and the
 * safe-integer bounds on `.int()` — so they have to be stripped before the
 * request. Post-response `safeParse` still enforces the real bounds.
 *
 * Meaningful ranges are folded into `description` so the model still sees them.
 */
const UNSUPPORTED_SCHEMA_KEYS = new Set([
  '$schema',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
]);

/** Zod's `.int()` emits ±Number.MAX_SAFE_INTEGER; skip those in descriptions. */
const isNoiseBound = (value: unknown): boolean =>
  typeof value === 'number' && Math.abs(value) >= Number.MAX_SAFE_INTEGER;

const constraintHints = (node: Record<string, unknown>): string[] => {
  const hints: string[] = [];
  const min = node.minimum;
  const max = node.maximum;
  if (typeof min === 'number' && !isNoiseBound(min)) hints.push(`min ${min}`);
  if (typeof max === 'number' && !isNoiseBound(max)) hints.push(`max ${max}`);
  if (typeof node.minLength === 'number') hints.push(`minLength ${node.minLength}`);
  if (typeof node.maxLength === 'number') hints.push(`maxLength ${node.maxLength}`);
  if (typeof node.minItems === 'number' && node.minItems > 1) {
    hints.push(`at least ${node.minItems} items`);
  }
  if (typeof node.maxItems === 'number') hints.push(`at most ${node.maxItems} items`);
  return hints;
};

const sanitizeSchemaForOpenRouter = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSchemaForOpenRouter(item));
  }

  if (!value || typeof value !== 'object') return value;

  const node = value as Record<string, unknown>;
  const hints = constraintHints(node);
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(node)) {
    if (UNSUPPORTED_SCHEMA_KEYS.has(key)) continue;
    next[key] = sanitizeSchemaForOpenRouter(child);
  }

  if (hints.length > 0) {
    const existing = typeof next.description === 'string' ? next.description.trim() : '';
    const hintText = `Constraint: ${hints.join(', ')}.`;
    next.description = existing ? `${existing} ${hintText}` : hintText;
  }

  return next;
};

const toOpenRouterJsonSchema = (schema: Record<string, unknown>): Record<string, unknown> =>
  sanitizeSchemaForOpenRouter(schema) as Record<string, unknown>;

const imageAnalysisJsonSchema = toOpenRouterJsonSchema(
  z.toJSONSchema(imageAnalysisSchema) as Record<string, unknown>,
);

/* -------------------------------------------------------------------------- */
/* OpenRouter response helpers                                                 */
/* -------------------------------------------------------------------------- */

type OpenRouterUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
};

type OpenRouterChoice = {
  finish_reason?: string | null;
  message?: {
    content?: string | null;
    refusal?: string | null;
  };
};

type OpenRouterSuccessBody = {
  model?: string;
  choices?: OpenRouterChoice[];
  usage?: OpenRouterUsage;
};

const extractContent = (
  body: OpenRouterSuccessBody,
): {
  content: string | null;
  finishReason: string | null;
  refusal: string | null;
} => {
  const choice = body.choices?.[0];
  const content = choice?.message?.content ?? null;
  const finishReason = choice?.finish_reason ?? null;
  const refusal = choice?.message?.refusal ?? null;
  return {
    content: typeof content === 'string' ? content : null,
    finishReason: typeof finishReason === 'string' ? finishReason : null,
    refusal: typeof refusal === 'string' ? refusal : null,
  };
};

/**
 * Models occasionally wrap JSON in fences even with `response_format`. Strip
 * a single fenced block when present; otherwise return the trimmed string.
 */
const unwrapJsonText = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
};

const parseAnalysisContent = (raw: string): ImageAnalysis => {
  let json: unknown;
  try {
    json = JSON.parse(unwrapJsonText(raw));
  } catch {
    throw new AnalyzeError(
      502,
      'response_truncated',
      'The model returned something that was not valid JSON.',
    );
  }

  const parsed = imageAnalysisSchema.safeParse(json);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new AnalyzeError(
      502,
      'response_truncated',
      'The model returned JSON that did not match the analysis schema.',
      details,
    );
  }

  return parsed.data;
};

const combineSignals = (userSignal: AbortSignal | undefined): AbortSignal => {
  const timeoutSignal = AbortSignal.timeout(ANALYZE_TIMEOUT_MS);
  if (!userSignal) return timeoutSignal;
  return AbortSignal.any([userSignal, timeoutSignal]);
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Sends one image plus its measured metadata to OpenRouter and returns the
 * parsed `ImageAnalysis`. Throws `AnalyzeError` for every failure mode.
 */
export const analyzeImage = async (
  request: AnalyzeRequest,
  options: AnalyzeOptions,
): Promise<AnalyzeResult> => {
  if (!options.apiKey) {
    throw new AnalyzeError(
      502,
      'upstream_auth',
      'No OpenRouter API key is configured on the server.',
    );
  }

  if (request.base64.startsWith('data:')) {
    throw new AnalyzeError(
      400,
      'invalid_request',
      'base64 must be the raw base64 payload, without a "data:" URL prefix.',
    );
  }

  if (request.base64.length > MAX_IMAGE_BASE64_LENGTH) {
    throw new AnalyzeError(
      413,
      'image_too_large',
      `The base64 image is ${Math.round(request.base64.length / 1024)}KB, over the ${MAX_IMAGE_BASE64_LENGTH / 1024}KB limit. Downscale it further before sending.`,
    );
  }

  const model = options.model?.trim() || DEFAULT_ANALYZE_MODEL;
  const dataUrl = `data:${request.mediaType};base64,${request.base64}`;
  const signal = combineSignals(options.signal);

  try {
    let response: Response;
    try {
      response = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': OPENROUTER_HTTP_REFERER,
          'X-Title': OPENROUTER_APP_TITLE,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: dataUrl },
                },
                { type: 'text', text: buildUserPrompt(request.metadata) },
              ],
            },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'image_analysis',
              strict: true,
              schema: imageAnalysisJsonSchema,
            },
          },
          provider: {
            require_parameters: true,
          },
        }),
        signal,
      });
    } catch (cause) {
      if (options.signal?.aborted) {
        throw new AnalyzeError(499, 'request_aborted', 'The analysis request was cancelled.');
      }
      if (
        cause instanceof Error &&
        (cause.name === 'TimeoutError' || cause.name === 'AbortError')
      ) {
        throw new AnalyzeError(504, 'upstream_timeout', 'OpenRouter did not respond in time.');
      }
      throw cause;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      if (!response.ok) throw mapUpstreamHttpError(response.status, model);
      throw new AnalyzeError(502, 'empty_response', 'OpenRouter returned a non-JSON response.');
    }

    if (!response.ok) {
      throw mapUpstreamHttpError(response.status, model, body);
    }

    const success = body as OpenRouterSuccessBody;
    const { content, finishReason, refusal } = extractContent(success);

    if (refusal) {
      throw new AnalyzeError(
        502,
        'upstream_rejected_request',
        'The model refused to analyse this image.',
      );
    }

    if (!content || content.trim().length === 0) {
      if (finishReason === 'length') {
        throw new AnalyzeError(
          502,
          'response_truncated',
          'The model ran out of output tokens before completing the analysis.',
        );
      }
      throw new AnalyzeError(
        502,
        'empty_response',
        `OpenRouter returned no analysis content (finish reason: ${finishReason ?? 'unknown'}).`,
      );
    }

    let analysis: ImageAnalysis;
    try {
      analysis = parseAnalysisContent(content);
    } catch (cause) {
      if (
        finishReason === 'length' &&
        cause instanceof AnalyzeError &&
        cause.code === 'response_truncated'
      ) {
        throw new AnalyzeError(
          502,
          'response_truncated',
          'The model ran out of output tokens before completing the analysis.',
        );
      }
      throw cause;
    }

    return {
      analysis,
      model: typeof success.model === 'string' && success.model.length > 0 ? success.model : model,
      usage: {
        inputTokens: success.usage?.prompt_tokens ?? 0,
        outputTokens: success.usage?.completion_tokens ?? 0,
      },
    };
  } catch (cause) {
    throw toAnalyzeError(cause);
  }
};
