/**
 * Everything becomes an `ImageBitmap` here, so no later stage has to care what
 * was dropped. Three paths: native `createImageBitmap`, a rasterising path for
 * SVG, and `utif2` for TIFF.
 *
 * HEIC is deliberately not given a decoder — that would mean shipping an LGPL
 * libheif wasm build — but recent Safari decodes it natively, so it still goes
 * down the native path and only fails with a specific hint where that does not
 * work.
 */

import type { SourceFormat } from './sniffFormat';
import { isVectorFormat, sniffFormat, sourceFormatLabels } from './sniffFormat';
import { createCanvas2D } from './encodeSupport';

export type DecodedVia = 'native' | 'svg' | 'tiff';

export type DecodedImage = {
  bitmap: ImageBitmap;
  /** True for SVG, where pixel dimensions and DPI are meaningless. */
  isVector: boolean;
  /** True when the file holds more than one frame. Only frame one is decoded. */
  isAnimated: boolean;
  decodedVia: DecodedVia;
};

/**
 * Thrown when no path could produce a bitmap. `hint` is written for the tray:
 * it says what to do about it rather than restating the failure.
 */
export class UnsupportedFormatError extends Error {
  readonly format: SourceFormat;
  readonly hint: string;

  constructor(format: SourceFormat, hint: string, options?: { cause?: unknown }) {
    super(`${sourceFormatLabels[format]} could not be decoded. ${hint}`, options);
    this.name = 'UnsupportedFormatError';
    this.format = format;
    this.hint = hint;
  }
}

const decodeHints: Record<SourceFormat, string> = {
  jpeg: 'The file looks like a JPEG but the browser rejected it, so it is probably truncated or corrupt.',
  png: 'The file looks like a PNG but the browser rejected it, so it is probably truncated or corrupt.',
  gif: 'The file looks like a GIF but the browser rejected it, so it is probably truncated or corrupt.',
  webp: 'This browser could not decode the WebP. Try converting it to PNG or JPEG.',
  avif: 'This browser cannot decode AVIF. Try Chrome or Firefox, or convert the file to WebP.',
  heic: 'HEIC is only decodable in recent Safari. Convert it to JPEG or WebP and drop it again.',
  bmp: 'The file looks like a BMP but the browser rejected it, so the variant is probably unsupported.',
  ico: 'The file looks like an ICO but the browser rejected it, so the variant is probably unsupported.',
  tiff: 'The TIFF could not be decoded. Compressed or layered TIFF variants are not all supported; export a flattened copy.',
  svg: 'The SVG could not be rasterised, which usually means the markup is malformed or references external resources.',
  unknown:
    'This file is not an image format the app recognises. Supported inputs are JPEG, PNG, GIF, WebP, AVIF, BMP, ICO, TIFF and SVG.',
};

/** How far into the file the animation probe reads before giving up. */
const ANIMATION_SCAN_BYTES = 512 * 1024;

/**
 * Long edge every SVG is rasterised at. Vector input has no true pixel size,
 * so a fixed target keeps memory bounded and guarantees a usable resolution
 * even for markup that declares no intrinsic width or height.
 */
const SVG_RASTER_LONG_EDGE = 1024;

const asciiAt = (bytes: Uint8Array, offset: number, length: number): string => {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return text;
};

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  (((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)) >>>
  0;

/** Skips a GIF sub-block chain, returning the offset just past the terminator. */
const skipGifSubBlocks = (bytes: Uint8Array, start: number): number => {
  let offset = start;
  while (offset < bytes.length) {
    const size = bytes[offset] ?? 0;
    offset += 1;
    if (size === 0) return offset;
    offset += size;
  }
  return offset;
};

/**
 * Walks GIF blocks properly rather than counting `0x2C` bytes, which appear
 * inside compressed data all the time. Stops as soon as a second frame is seen.
 */
const gifIsAnimated = (bytes: Uint8Array): boolean => {
  const packedScreenFields = bytes[10] ?? 0;
  let offset = 13;
  if ((packedScreenFields & 0x80) !== 0) {
    offset += 3 * 2 ** ((packedScreenFields & 0x07) + 1);
  }

  let frames = 0;
  while (offset < bytes.length) {
    const marker = bytes[offset] ?? 0;
    offset += 1;

    if (marker === 0x21) {
      offset += 1;
      offset = skipGifSubBlocks(bytes, offset);
      continue;
    }

    if (marker === 0x2c) {
      frames += 1;
      if (frames > 1) return true;
      const packedImageFields = bytes[offset + 8] ?? 0;
      offset += 9;
      if ((packedImageFields & 0x80) !== 0) {
        offset += 3 * 2 ** ((packedImageFields & 0x07) + 1);
      }
      offset += 1;
      offset = skipGifSubBlocks(bytes, offset);
      continue;
    }

    return false;
  }

  return false;
};

/** Walks the PNG chunk stream looking for `acTL`, which marks an APNG. */
const pngIsAnimated = (bytes: Uint8Array): boolean => {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = asciiAt(bytes, offset + 4, 4);
    if (type === 'acTL') return true;
    if (type === 'IDAT' || type === 'IEND') return false;
    offset += 12 + length;
  }
  return false;
};

/** An animated WebP carries an `ANIM` chunk right after the `VP8X` header. */
const webpIsAnimated = (bytes: Uint8Array): boolean => {
  const scanEnd = Math.min(bytes.length, 256);
  for (let offset = 12; offset + 4 <= scanEnd; offset += 1) {
    if (asciiAt(bytes, offset, 4) === 'ANIM') return true;
  }
  return false;
};

/** An AVIF image sequence declares the `avis` brand in its `ftyp` box. */
const avifIsAnimated = (bytes: Uint8Array): boolean => {
  const boxSize = readUint32(bytes, 0);
  const brandsEnd = Math.min(boxSize > 0 ? boxSize : bytes.length, bytes.length);
  for (let offset = 8; offset + 4 <= brandsEnd; offset += 4) {
    if (asciiAt(bytes, offset, 4) === 'avis') return true;
  }
  return false;
};

const detectAnimation = async (file: Blob, format: SourceFormat): Promise<boolean> => {
  if (format !== 'gif' && format !== 'png' && format !== 'webp' && format !== 'avif') {
    return false;
  }

  const bytes = new Uint8Array(await file.slice(0, ANIMATION_SCAN_BYTES).arrayBuffer());
  if (format === 'gif') return gifIsAnimated(bytes);
  if (format === 'png') return pngIsAnimated(bytes);
  if (format === 'webp') return webpIsAnimated(bytes);
  return avifIsAnimated(bytes);
};

const loadImageElement = (url: string, failureMessage: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(failureMessage));
    image.src = url;
  });

const parseLength = (value: string | null): number | null => {
  if (!value) return null;
  // Percentages and other relative units say nothing about intrinsic size.
  if (value.trim().endsWith('%')) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const parseViewBoxSize = (value: string | null): { width: number; height: number } | null => {
  if (!value) return null;
  const parts = value.split(/[\s,]+/).map(Number.parseFloat);
  if (parts.length < 4) return null;
  const [, , width, height] = parts;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
};

/**
 * Firefox reports `naturalWidth === 0` for an SVG with no intrinsic width or
 * height, so the size is resolved from the markup and written back onto the
 * root element before rasterising.
 */
const prepareSvg = (markup: string): { markup: string; width: number; height: number } => {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;

  if (!root || root.nodeName === 'parsererror' || parsed.querySelector('parsererror')) {
    throw new UnsupportedFormatError('svg', decodeHints.svg);
  }

  const viewBox = parseViewBoxSize(root.getAttribute('viewBox'));
  const intrinsicWidth = parseLength(root.getAttribute('width')) ?? viewBox?.width ?? null;
  const intrinsicHeight = parseLength(root.getAttribute('height')) ?? viewBox?.height ?? null;

  const sourceWidth = intrinsicWidth ?? SVG_RASTER_LONG_EDGE;
  const sourceHeight = intrinsicHeight ?? SVG_RASTER_LONG_EDGE;

  const scale = SVG_RASTER_LONG_EDGE / Math.max(sourceWidth, sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  if (!root.getAttribute('viewBox')) {
    root.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`);
  }
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));

  return { markup: new XMLSerializer().serializeToString(root), width, height };
};

const decodeSvg = async (file: Blob): Promise<DecodedImage> => {
  const source = await file.text();
  const prepared = prepareSvg(source);
  const blob = new Blob([prepared.markup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await loadImageElement(url, decodeHints.svg);
    const { canvas, context } = createCanvas2D(prepared.width, prepared.height);
    context.drawImage(image, 0, 0, prepared.width, prepared.height);
    const bitmap = await createImageBitmap(canvas);
    return { bitmap, isVector: true, isAnimated: false, decodedVia: 'svg' };
  } catch (cause) {
    if (cause instanceof UnsupportedFormatError) throw cause;
    throw new UnsupportedFormatError('svg', decodeHints.svg, { cause });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const decodeTiff = async (file: Blob): Promise<DecodedImage> => {
  try {
    const buffer = await file.arrayBuffer();
    const { default: UTIF } = await import('utif2');

    const pages = UTIF.decode(buffer);
    const page = pages[0];
    if (!page) throw new Error('The TIFF contains no image pages.');

    UTIF.decodeImage(buffer, page);
    const rgba = UTIF.toRGBA8(page);
    const { width, height } = page;
    if (!width || !height) throw new Error('The TIFF page reported no dimensions.');

    // Copy rather than aliasing the buffer: `ImageData` requires a plain
    // `ArrayBuffer`-backed clamped array.
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    const bitmap = await createImageBitmap(imageData);
    return { bitmap, isVector: false, isAnimated: false, decodedVia: 'tiff' };
  } catch (cause) {
    throw new UnsupportedFormatError('tiff', decodeHints.tiff, { cause });
  }
};

const decodeNative = async (file: Blob, format: SourceFormat): Promise<DecodedImage> => {
  const isAnimated = await detectAnimation(file, format);

  try {
    const bitmap = await createImageBitmap(file);
    return { bitmap, isVector: false, isAnimated, decodedVia: 'native' };
  } catch (cause) {
    throw new UnsupportedFormatError(format, decodeHints[format], { cause });
  }
};

/**
 * Decodes any supported input to a bitmap. `format` comes from `sniffFormat`;
 * omit it and the file is sniffed here instead.
 *
 * Throws `UnsupportedFormatError` when every path fails.
 */
export const decodeToBitmap = async (
  file: File | Blob,
  format?: SourceFormat,
): Promise<DecodedImage> => {
  const resolvedFormat = format ?? (await sniffFormat(file));

  if (isVectorFormat(resolvedFormat)) return decodeSvg(file);
  if (resolvedFormat === 'tiff') return decodeTiff(file);
  return decodeNative(file, resolvedFormat);
};
