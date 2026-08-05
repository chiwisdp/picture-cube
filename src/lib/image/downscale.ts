/**
 * Produces the JPEG that actually goes to the vision model via OpenRouter.
 *
 * Because this always runs off the decoded bitmap, a TIFF, an AVIF and an SVG
 * all reach the API as the same kind of JPEG, which matters: the OpenAI-style
 * image_url data URL path is used with jpeg (also fine as png/gif/webp).
 */

import { createCanvas2D } from './encodeSupport';

/** Long edge sent to the model. Beyond this the extra detail buys nothing. */
export const ANALYSIS_MAX_EDGE = 1024;

export const ANALYSIS_JPEG_QUALITY = 0.85;

export type DownscaledImage = {
  /** Raw base64 payload with no `data:` prefix, ready for an image block. */
  base64: string;
  /** The same bytes as a `data:` URL, for previewing without a blob URL. */
  dataUrl: string;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
  /** Decoded size of the base64 payload in bytes. */
  bytes: number;
};

export type DownscaleOptions = {
  maxEdge?: number;
  quality?: number;
};

const decodedBase64Length = (base64: string): number => {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

/**
 * Downscales to `maxEdge` on the long side and encodes as JPEG. Never upscales.
 *
 * The canvas is filled white first: JPEG has no alpha, so a transparent source
 * would otherwise composite onto black and the model would read the padding as
 * part of the image.
 */
export const downscaleToBase64 = (
  bitmap: ImageBitmap,
  options: DownscaleOptions = {},
): DownscaledImage => {
  const { maxEdge = ANALYSIS_MAX_EDGE, quality = ANALYSIS_JPEG_QUALITY } = options;

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const { canvas, context } = createCanvas2D(width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);

  return {
    base64,
    dataUrl,
    mediaType: 'image/jpeg',
    width,
    height,
    bytes: decodedBase64Length(base64),
  };
};
