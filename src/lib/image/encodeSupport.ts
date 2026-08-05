/**
 * Canvas output: capability probing, encoding, and the shared 2D canvas helper
 * every other module in this folder draws on.
 *
 * A canvas asked for an encoding it does not support silently returns a PNG
 * with `image/png` in `blob.type` instead of throwing, so the only honest test
 * is to encode something and inspect the type that comes back. Firefox, for
 * instance, decodes AVIF but cannot encode it.
 */

import type { RoleOutputFormat } from '../analysis/webRoles';
import { roleOutputMimeTypes } from '../analysis/webRoles';

export type EncodeSupport = Record<RoleOutputFormat, boolean>;

export type Canvas2D = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
};

/**
 * `HTMLCanvasElement` rather than `OffscreenCanvas`: the two have incompatible
 * overloads on `drawImage`, so a union of them cannot be called without casts,
 * and `OffscreenCanvas` buys nothing while we stay on the main thread.
 */
export const createCanvas2D = (width: number, height: number): Canvas2D => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));

  const context = canvas.getContext('2d', { willReadFrequently: false });
  if (!context) throw new Error('This browser refused to create a 2D canvas context.');

  return { canvas, context };
};

export const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`The canvas could not be encoded as ${mimeType}.`));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });

const probeFormat = async (format: RoleOutputFormat): Promise<boolean> => {
  const mimeType = roleOutputMimeTypes[format];
  try {
    const { canvas } = createCanvas2D(1, 1);
    const blob = await canvasToBlob(canvas, mimeType, 0.8);
    return blob.type === mimeType;
  } catch {
    return false;
  }
};

/** Runs the probe unconditionally. Prefer `getEncodeSupport` in app code. */
export const probeEncodeSupport = async (): Promise<EncodeSupport> => {
  const formats: RoleOutputFormat[] = ['webp', 'avif', 'jpeg', 'png'];
  const results = await Promise.all(formats.map(probeFormat));

  return {
    webp: results[0] ?? false,
    avif: results[1] ?? false,
    jpeg: results[2] ?? false,
    // PNG is the universal canvas fallback, so it is available by definition.
    png: true,
  };
};

let encodeSupportPromise: Promise<EncodeSupport> | null = null;

/** Memoised across the session; the answer cannot change at runtime. */
export const getEncodeSupport = (): Promise<EncodeSupport> => {
  encodeSupportPromise ??= probeEncodeSupport();
  return encodeSupportPromise;
};

/**
 * Formats to fall back through when the preferred one is unavailable. Ordered
 * best-quality-per-byte first, always ending at PNG.
 */
const fallbackChains: Record<RoleOutputFormat, readonly RoleOutputFormat[]> = {
  avif: ['avif', 'webp', 'jpeg', 'png'],
  webp: ['webp', 'jpeg', 'png'],
  jpeg: ['jpeg', 'webp', 'png'],
  png: ['png'],
};

/**
 * Picks the encoding a crop should actually ship as: the role's preference
 * where the browser can produce it, dropping JPEG whenever the source has real
 * transparency to lose.
 *
 * A JPEG-preferring role that hits alpha goes straight to PNG rather than
 * WebP. JPEG is only preferred where maximum decoder compatibility matters
 * (the social-share slot), and swapping in WebP would give that away.
 */
export const resolveOutputFormat = (
  preferred: RoleOutputFormat,
  options: { hasAlpha: boolean; support: EncodeSupport },
): RoleOutputFormat => {
  const { hasAlpha, support } = options;
  if (hasAlpha && preferred === 'jpeg') return 'png';

  const candidates = fallbackChains[preferred].filter(
    (format) => support[format] && !(hasAlpha && format === 'jpeg'),
  );
  return candidates[0] ?? 'png';
};
