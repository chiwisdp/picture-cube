/**
 * The single place that knows an HTTP analysis endpoint exists.
 *
 * Everything about the wire format — the URL, the method, the request shape,
 * the error-body convention — is contained here and never leaks into the store
 * or a component. Callers only ever see a discriminated `AnalyzeResult`, so a
 * change to the server contract is a change to this file alone.
 *
 * The route takes a flatter, looser metadata shape than the browser's
 * `ImageMetadata`, so translating between the two is this module's other job.
 * Anything the route has no field for is folded into `notes`, which it feeds to
 * the model verbatim, rather than being dropped.
 *
 * The analysis itself is validated against the shared zod schema rather than
 * trusted, because a silently wrong shape would otherwise surface much later as
 * a blank panel or a crash inside a component.
 */

import type { ImageAnalysis } from './analysis/schema';
import { imageAnalysisSchema } from './analysis/schema';
import type { ExifSummary, ImageMetadata } from './image/extractMetadata';

/** Dev-only route registered by the Vite middleware plugin. */
const ANALYZE_ENDPOINT = '/api/analyze';

export type AnalyzeRequest = {
  /** Raw base64 JPEG payload from `downscaleToBase64`, with no `data:` prefix. */
  base64: string;
  /** Media type of `base64`. The route accepts jpeg, png, gif and webp only. */
  mediaType: string;
  /** Measured ground truth, so the model never has to invent a number. */
  metadata: ImageMetadata;
  signal?: AbortSignal;
};

export type AnalyzeResult =
  | { ok: true; analysis: ImageAnalysis }
  | { ok: false; error: string; aborted: boolean };

const UNREACHABLE_MESSAGE =
  'Could not reach the analysis service. Check that the dev server is running.';

const MALFORMED_MESSAGE =
  'The analysis service replied with something that was not a valid analysis.';

type ExifValue = string | number | boolean;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const failure = (error: string, aborted = false): AnalyzeResult => ({ ok: false, error, aborted });

/** Drops empty entries so the prompt is not padded with blank EXIF fields. */
const flattenExif = (exif: ExifSummary | null): Record<string, ExifValue> | null => {
  if (!exif) return null;

  const candidates: Record<string, ExifValue | null> = {
    Make: exif.make,
    Model: exif.model,
    Lens: exif.lens,
    ISO: exif.iso,
    FNumber: exif.fNumber,
    ExposureTime: exif.exposureTime,
    FocalLength: exif.focalLength,
    DateTaken: exif.dateTaken,
    Orientation: exif.orientation,
    Software: exif.software,
    ColorSpace: exif.colorSpace,
    Artist: exif.artist,
    Copyright: exif.copyright,
    Description: exif.description,
    Keywords: exif.keywords.length > 0 ? exif.keywords.join(', ') : null,
    HasGpsCoordinates: exif.hasGpsCoordinates ? true : null,
  };

  const flattened: Record<string, ExifValue> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (value !== null && value !== '') flattened[key] = value;
  }

  return Object.keys(flattened).length > 0 ? flattened : null;
};

/** Everything measured that the route has no dedicated field for. */
const buildNotes = (metadata: ImageMetadata): string[] => {
  const notes: string[] = [
    `Decoded via the ${metadata.decodedVia} path; the preview you are shown is a JPEG re-encode of the decoded ${metadata.sourceFormatLabel}.`,
    `Closest well-known aspect ratio: ${metadata.closestNamedRatio} (${metadata.orientationClass}).`,
    `Mean relative luminance of the opaque pixels is ${Math.round(metadata.averageLuminance * 100)}%.`,
  ];

  if (metadata.hasTransparency) {
    notes.push(
      `${Math.round(metadata.transparentPixelRatio * 100)}% of sampled pixels are not fully opaque, so the transparency is genuinely used.`,
    );
  } else if (metadata.supportsAlphaChannel) {
    notes.push('The container supports alpha but every sampled pixel is fully opaque.');
  }

  if (metadata.isVector) {
    notes.push('The source is vector artwork, so its pixel dimensions and DPI are arbitrary.');
  }
  if (metadata.isAnimated) {
    notes.push('The source is animated and only its first frame was decoded and measured.');
  }
  if (metadata.dpi && metadata.dpi.x !== metadata.dpi.y) {
    notes.push(
      `DPI is non-square: ${metadata.dpi.x} horizontal by ${metadata.dpi.y} vertical, from the ${metadata.dpi.source} container.`,
    );
  }
  if (!metadata.supportsEmbeddedMetadata) {
    notes.push(
      `${metadata.sourceFormatLabel} has no container for EXIF, IPTC or XMP, so the absence of camera metadata means nothing.`,
    );
  } else if (!metadata.hasEmbeddedMetadata) {
    notes.push('The format can carry embedded metadata but this file has none.');
  }

  return notes;
};

/**
 * `ImageMetadata` measures the original upload; the route wants a flat subset
 * of it. Notably its `dpi` is a single number and its `palette` is bare hex
 * strings, so both are reduced here.
 */
const toRequestMetadata = (metadata: ImageMetadata) => ({
  sourceFormat: metadata.sourceFormat,
  width: metadata.width,
  height: metadata.height,
  byteSize: metadata.fileSizeBytes,
  fileName: metadata.fileName,
  isVector: metadata.isVector,
  isAnimated: metadata.isAnimated,
  megapixels: metadata.megapixels,
  aspectRatio: metadata.aspectRatio,
  aspectRatioLabel: metadata.aspectRatioLabel,
  bytesPerPixel: metadata.bytesPerPixel,
  dpi: metadata.dpi ? Math.round((metadata.dpi.x + metadata.dpi.y) / 2) : null,
  hasAlpha: metadata.hasTransparency,
  colorSpace: metadata.exif?.colorSpace ?? null,
  palette: metadata.palette.map((color) => color.hex),
  exif: flattenExif(metadata.exif),
  notes: buildNotes(metadata),
});

/**
 * The route replies with `{ error: { code, message, details? } }`, but proxies
 * and framework layers return HTML or nothing at all, so the status line is the
 * fallback. A bare `{ error: string }` is accepted too.
 */
const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      const { error } = body;
      if (typeof error === 'string' && error.trim().length > 0) return error.trim();

      if (isRecord(error)) {
        const message = typeof error.message === 'string' ? error.message.trim() : '';
        const details = Array.isArray(error.details)
          ? error.details.filter((detail): detail is string => typeof detail === 'string')
          : [];

        if (message.length > 0) {
          return details.length > 0 ? `${message} (${details.join('; ')})` : message;
        }
      }
    }
  } catch {
    // A non-JSON error body is not itself worth reporting.
  }

  const status = `${response.status} ${response.statusText}`.trim();
  return `The analysis service returned ${status}.`;
};

/**
 * The route wraps the analysis as `{ analysis, model, usage }`. A bare analysis
 * is unwrapped too, so this keeps working if the envelope is ever dropped.
 */
const unwrapAnalysis = (body: unknown): unknown =>
  isRecord(body) && 'analysis' in body ? body.analysis : body;

/**
 * Sends one image for analysis. Never throws: transport failures, non-2xx
 * responses and contract mismatches all come back as `{ ok: false }`.
 */
export const requestAnalysis = async (request: AnalyzeRequest): Promise<AnalyzeResult> => {
  const { base64, mediaType, metadata, signal } = request;

  let response: Response;
  try {
    response = await fetch(ANALYZE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ base64, mediaType, metadata: toRequestMetadata(metadata) }),
      signal,
    });
  } catch {
    if (signal?.aborted) return failure('Analysis was cancelled.', true);
    return failure(UNREACHABLE_MESSAGE);
  }

  if (!response.ok) return failure(await readErrorMessage(response));

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failure(MALFORMED_MESSAGE);
  }

  const parsed = imageAnalysisSchema.safeParse(unwrapAnalysis(body));
  if (!parsed.success) return failure(MALFORMED_MESSAGE);

  return { ok: true, analysis: parsed.data };
};
