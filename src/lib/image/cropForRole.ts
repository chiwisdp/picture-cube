/**
 * Turns a focal point into a real, downloadable crop.
 *
 * The model's `focalPoint` is the only judgment involved; everything else here
 * is arithmetic against the role spec in `webRoles.ts`. The crop is the largest
 * rectangle of the role's aspect ratio that fits inside the source, slid to
 * centre on the focal point and clamped so it never leaves the image.
 */

import type { FocalPoint } from '../analysis/schema';
import type { RoleOutputFormat, WebRole } from '../analysis/webRoles';
import { roleOutputMimeTypes } from '../analysis/webRoles';
import {
  canvasToBlob,
  createCanvas2D,
  getEncodeSupport,
  resolveOutputFormat,
} from './encodeSupport';

/** The crop only needs the coordinates, so a full `FocalPoint` is optional. */
export type CropFocalPoint = Pick<FocalPoint, 'x' | 'y'>;

/** Region of the source, in source pixels. */
export type CropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RoleCrop = {
  blob: Blob;
  /** Object URL for preview and download. Call `releaseRoleCrop` when done. */
  url: string;
  /** What was cut from the source, for drawing an overlay on the original. */
  cropRect: CropRect;
  /** Encoded output size in pixels. */
  width: number;
  height: number;
  bytes: number;
  /** What was actually encoded, which may differ from `role.preferredFormat`. */
  format: RoleOutputFormat;
  mimeType: string;
  quality: number;
  /** True when the source is too small to fill the role at its target size. */
  upscaleNeeded: boolean;
  maxWeightKb: number;
  withinWeightBudget: boolean;
};

export type CropForRoleOptions = {
  /** Encoder quality, 0..1. Ignored for PNG. Defaults to 0.85. */
  quality?: number;
  /** From `ImageMetadata.hasTransparency`. Forces a format that keeps alpha. */
  hasAlpha?: boolean;
  /** Render at the role's full target size even when the source is smaller. */
  allowUpscale?: boolean;
};

export const DEFAULT_CROP_QUALITY = 0.85;

/** Used when no analysis has come back yet. */
export const DEFAULT_FOCAL_POINT: CropFocalPoint = { x: 0.5, y: 0.5 };

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * Largest rectangle of `aspectRatio` that fits inside the source, centred on
 * the normalised focal point and clamped to the image bounds. Clamping means an
 * off-centre focal point pulls the crop as far as it can go and then stops,
 * rather than sliding off the edge and leaving blank pixels.
 */
export const computeCropRect = (
  source: { width: number; height: number },
  aspectRatio: number,
  focalPoint: CropFocalPoint = DEFAULT_FOCAL_POINT,
): CropRect => {
  const sourceRatio = source.width / source.height;

  const width =
    sourceRatio > aspectRatio
      ? clamp(Math.round(source.height * aspectRatio), 1, source.width)
      : source.width;
  const height =
    sourceRatio > aspectRatio
      ? source.height
      : clamp(Math.round(source.width / aspectRatio), 1, source.height);

  const x = Math.round(
    clamp(focalPoint.x * source.width - width / 2, 0, source.width - width),
  );
  const y = Math.round(
    clamp(focalPoint.y * source.height - height / 2, 0, source.height - height),
  );

  return { x, y, width, height };
};

/** Frees the object URL held by a crop. Safe to call more than once. */
export const releaseRoleCrop = (crop: RoleCrop): void => {
  URL.revokeObjectURL(crop.url);
};

/** Filename for the download link, e.g. `sunset-hero-1920x800.webp`. */
export const roleCropFileName = (
  role: WebRole,
  crop: Pick<RoleCrop, 'format' | 'width' | 'height'>,
  sourceName = 'image',
): string => {
  const stem = sourceName.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const base = stem.length > 0 ? stem : 'image';
  return `${base}-${role.id}-${crop.width}x${crop.height}.${crop.format}`;
};

/**
 * Generates the crop for one role. Resolves with the encoded blob plus enough
 * context for the panel to explain the result: the rect that was cut, whether
 * the source was too small, and whether the output fits the role's weight
 * budget.
 *
 * The caller owns `url` and must pass the result to `releaseRoleCrop`.
 */
export const cropForRole = async (
  bitmap: ImageBitmap,
  role: WebRole,
  focalPoint: CropFocalPoint = DEFAULT_FOCAL_POINT,
  options: CropForRoleOptions = {},
): Promise<RoleCrop> => {
  const { quality = DEFAULT_CROP_QUALITY, hasAlpha = false, allowUpscale = false } = options;

  const cropRect = computeCropRect(bitmap, role.aspectRatio, focalPoint);
  const upscaleNeeded = cropRect.width < role.width;

  // Never upscale by default: enlarging past the source invents detail and
  // inflates the file for nothing.
  const scale = allowUpscale
    ? role.width / cropRect.width
    : Math.min(1, role.width / cropRect.width);
  const width = Math.max(1, Math.round(cropRect.width * scale));
  const height = Math.max(1, Math.round(width / role.aspectRatio));

  const support = await getEncodeSupport();
  const format = resolveOutputFormat(role.preferredFormat, { hasAlpha, support });
  const mimeType = roleOutputMimeTypes[format];

  const { canvas, context } = createCanvas2D(width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  if (format === 'jpeg') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(
    bitmap,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    width,
    height,
  );

  const blob = await canvasToBlob(canvas, mimeType, format === 'png' ? undefined : quality);

  return {
    blob,
    url: URL.createObjectURL(blob),
    cropRect,
    width,
    height,
    bytes: blob.size,
    format,
    mimeType: blob.type || mimeType,
    quality,
    upscaleNeeded,
    maxWeightKb: role.maxWeightKb,
    withinWeightBudget: blob.size <= role.maxWeightKb * 1024,
  };
};
