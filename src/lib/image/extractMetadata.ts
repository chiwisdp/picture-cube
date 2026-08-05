/**
 * Everything measurable about an image, measured rather than guessed.
 *
 * This is the ground truth handed to the vision model alongside the picture, so the model
 * never has to invent a number. Embedded metadata comes from `exifr`, PNG DPI
 * from a hand-rolled `pHYs` chunk reader (exifr does not surface that chunk),
 * and transparency and palette from actual canvas pixels.
 */

import exifr from 'exifr';
import type { SourceFormat } from './sniffFormat';
import {
  formatSupportsAlpha,
  formatSupportsEmbeddedMetadata,
  sourceFormatLabels,
  sourceFormatMimeTypes,
} from './sniffFormat';
import type { DecodedImage } from './decode';
import { createCanvas2D } from './encodeSupport';

export type DpiSource = 'jfif' | 'exif' | 'phys';

export type DpiReading = {
  x: number;
  y: number;
  /** Which container the figure came from, so the panel can say where. */
  source: DpiSource;
};

export type PaletteColor = {
  hex: string;
  rgb: [number, number, number];
  /** Fraction of sampled opaque pixels in this colour bucket, 0..1. */
  share: number;
};

export type ExifSummary = {
  make: string | null;
  model: string | null;
  lens: string | null;
  iso: number | null;
  fNumber: number | null;
  /** Formatted as a shutter speed, e.g. `1/250s`. */
  exposureTime: string | null;
  focalLength: number | null;
  /** ISO 8601, or the raw string when the value could not be revived. */
  dateTaken: string | null;
  orientation: number | null;
  software: string | null;
  colorSpace: string | null;
  artist: string | null;
  copyright: string | null;
  description: string | null;
  keywords: string[];
  hasGpsCoordinates: boolean;
};

export type ImageMetadata = {
  fileName: string;
  fileSizeBytes: number;
  /** Human-readable size, e.g. `2.4 MB`. */
  fileSizeLabel: string;
  sourceFormat: SourceFormat;
  sourceFormatLabel: string;
  mimeType: string;
  decodedVia: DecodedImage['decodedVia'];

  width: number;
  height: number;
  isVector: boolean;
  isAnimated: boolean;
  orientationClass: 'landscape' | 'portrait' | 'square';
  aspectRatio: number;
  /** Exact ratio, e.g. `16:9`, falling back to `1.78:1` when it does not reduce. */
  aspectRatioLabel: string;
  /** Nearest well-known ratio, e.g. `16:9 widescreen`. */
  closestNamedRatio: string;
  /** Null for vector sources, where pixel count is arbitrary. */
  megapixels: number | null;
  /** Null for vector sources. A rough compression signal. */
  bytesPerPixel: number | null;
  /** Null when no container reports one, which is the common case. */
  dpi: DpiReading | null;

  /** Whether the container can hold alpha at all. */
  supportsAlphaChannel: boolean;
  /** Whether any sampled pixel is actually not fully opaque. */
  hasTransparency: boolean;
  /** Fraction of sampled pixels below full opacity, 0..1. */
  transparentPixelRatio: number;

  palette: PaletteColor[];
  /** Mean relative luminance of the sampled opaque pixels, 0..1. */
  averageLuminance: number;

  /** False for BMP, ICO, GIF and SVG, which have no metadata container. */
  supportsEmbeddedMetadata: boolean;
  /** True only when something was actually found. */
  hasEmbeddedMetadata: boolean;
  exif: ExifSummary | null;
};

export type ExtractMetadataInput = {
  file: File | Blob;
  format: SourceFormat;
  decoded: DecodedImage;
  /** Overrides `file.name`; required when a bare `Blob` is passed. */
  fileName?: string;
};

/** Palette is quantised from a 32x32 downsample, per the plan. */
const PALETTE_SAMPLE_EDGE = 32;

/** Alpha and luminance get a denser sample; they are cheap and more sensitive. */
const PIXEL_SAMPLE_EDGE = 128;

/** 16 levels per channel. Coarse enough to merge gradients into one bucket. */
const PALETTE_BUCKET_SHIFT = 4;

const PALETTE_SIZE = 6;

/** Pixels this transparent contribute nothing meaningful to the palette. */
const PALETTE_MIN_ALPHA = 16;

/** `pHYs` always precedes `IDAT`, but colour profiles can sit in front of it. */
const PNG_CHUNK_SCAN_BYTES = 256 * 1024;

const namedAspectRatios: readonly { label: string; ratio: number }[] = [
  { label: '1:1 square', ratio: 1 },
  { label: '5:4', ratio: 5 / 4 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '3:2', ratio: 3 / 2 },
  { label: '16:10', ratio: 16 / 10 },
  { label: '16:9 widescreen', ratio: 16 / 9 },
  { label: '1.91:1 social', ratio: 1.91 },
  { label: '2:1', ratio: 2 },
  { label: '21:9 ultrawide', ratio: 21 / 9 },
  { label: '12:5 hero', ratio: 12 / 5 },
  { label: '3:1', ratio: 3 },
  { label: '4:1 banner', ratio: 4 },
];

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const greatestCommonDivisor = (a: number, b: number): number => (b === 0 ? a : greatestCommonDivisor(b, a % b));

const describeAspectRatio = (width: number, height: number): string => {
  const divisor = greatestCommonDivisor(width, height);
  const reducedWidth = width / divisor;
  const reducedHeight = height / divisor;
  if (reducedWidth <= 40 && reducedHeight <= 40) return `${reducedWidth}:${reducedHeight}`;
  return `${(width / height).toFixed(2)}:1`;
};

const describeClosestNamedRatio = (width: number, height: number): string => {
  const longEdge = Math.max(width, height);
  const shortEdge = Math.min(width, height);
  const normalized = shortEdge === 0 ? 1 : longEdge / shortEdge;

  let closest = namedAspectRatios[0];
  for (const candidate of namedAspectRatios) {
    if (Math.abs(candidate.ratio - normalized) < Math.abs(closest.ratio - normalized)) {
      closest = candidate;
    }
  }

  if (width === height) return closest.label;
  return height > width ? `${closest.label} (portrait)` : closest.label;
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const toText = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(toText).filter((entry): entry is string => entry !== null);
  const single = toText(value);
  return single ? [single] : [];
};

const toIsoDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return toText(value);
};

const describeExposureTime = (value: unknown): string | null => {
  const seconds = toNumber(value);
  if (seconds === null || seconds <= 0) return null;
  if (seconds >= 1) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `1/${Math.round(1 / seconds)}s`;
};

/**
 * JFIF and EXIF disagree on what the unit codes mean, so the caller says which
 * container the value came from. JFIF: 0 none, 1 inch, 2 cm.
 * EXIF: 1 none, 2 inch, 3 cm.
 */
const normalizeResolutionUnit = (value: unknown, scale: 'jfif' | 'exif'): 'inch' | 'cm' | null => {
  const text = typeof value === 'string' ? value.toLowerCase() : null;
  if (text) {
    if (text.startsWith('inch')) return 'inch';
    if (text.startsWith('cm') || text.startsWith('centimet')) return 'cm';
    if (text.startsWith('none') || text.startsWith('unspecified')) return null;
  }

  const code = toNumber(value);
  if (code === null) return null;
  if (scale === 'jfif') {
    if (code === 1) return 'inch';
    if (code === 2) return 'cm';
    return null;
  }
  if (code === 2) return 'inch';
  if (code === 3) return 'cm';
  return null;
};

const readResolutionPair = (
  segment: Record<string, unknown> | null,
  scale: 'jfif' | 'exif',
): DpiReading | null => {
  if (!segment) return null;

  const x = toNumber(segment.XResolution ?? segment.Xdensity ?? segment.XDensity);
  const y = toNumber(segment.YResolution ?? segment.Ydensity ?? segment.YDensity);
  if (x === null || y === null || x <= 0 || y <= 0) return null;

  const unit = normalizeResolutionUnit(
    segment.ResolutionUnit ?? segment.resolutionUnit ?? segment.densityUnits,
    scale,
  );
  if (!unit) return null;

  const perInch = unit === 'cm' ? 2.54 : 1;
  return {
    x: Math.round(x * perInch),
    y: Math.round(y * perInch),
    source: scale,
  };
};

const readUint32 = (bytes: Uint8Array, offset: number): number =>
  (((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)) >>>
  0;

const asciiAt = (bytes: Uint8Array, offset: number, length: number): string => {
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return text;
};

/**
 * PNG stores physical size in a `pHYs` chunk as pixels per unit, where unit 1
 * is the metre and 0 means "unspecified, ratio only". exifr does not expose the
 * chunk, so the stream is walked by hand. A DPI is only reported for unit 1;
 * an unspecified unit carries no real-world scale.
 */
export const readPngPhysDpi = async (file: Blob): Promise<DpiReading | null> => {
  const bytes = new Uint8Array(await file.slice(0, PNG_CHUNK_SCAN_BYTES).arrayBuffer());

  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = asciiAt(bytes, offset + 4, 4);

    if (type === 'IDAT' || type === 'IEND') return null;

    if (type === 'pHYs' && length === 9 && offset + 12 + 9 <= bytes.length) {
      const dataStart = offset + 8;
      const pixelsPerUnitX = readUint32(bytes, dataStart);
      const pixelsPerUnitY = readUint32(bytes, dataStart + 4);
      const unit = bytes[dataStart + 8] ?? 0;
      if (unit !== 1) return null;
      return {
        x: Math.round(pixelsPerUnitX * 0.0254),
        y: Math.round(pixelsPerUnitY * 0.0254),
        source: 'phys',
      };
    }

    offset += 12 + length;
  }

  return null;
};

/** Draws the bitmap into a small canvas and hands back its pixels. */
const sampleImage = (bitmap: ImageBitmap, maxEdge: number): ImageData => {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const { context } = createCanvas2D(width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
};

const measurePixels = (
  pixels: ImageData,
): { hasTransparency: boolean; transparentPixelRatio: number; averageLuminance: number } => {
  const { data } = pixels;
  const total = data.length / 4;

  let transparentCount = 0;
  let luminanceSum = 0;
  let opaqueCount = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < 255) transparentCount += 1;
    if (alpha < PALETTE_MIN_ALPHA) continue;

    opaqueCount += 1;
    luminanceSum += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
  }

  return {
    hasTransparency: transparentCount > 0,
    transparentPixelRatio: total === 0 ? 0 : transparentCount / total,
    averageLuminance: opaqueCount === 0 ? 0 : luminanceSum / opaqueCount,
  };
};

const toHex = (red: number, green: number, blue: number): string =>
  `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

/**
 * Buckets colours on the top 4 bits of each channel and averages within each
 * bucket, so the reported hex is a real colour from the image rather than the
 * corner of a quantisation cell.
 */
const quantizePalette = (pixels: ImageData): PaletteColor[] => {
  const { data } = pixels;
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();
  let counted = 0;

  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < PALETTE_MIN_ALPHA) continue;

    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const key =
      ((red >> PALETTE_BUCKET_SHIFT) << 8) |
      ((green >> PALETTE_BUCKET_SHIFT) << 4) |
      (blue >> PALETTE_BUCKET_SHIFT);

    const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    buckets.set(key, bucket);
    counted += 1;
  }

  if (counted === 0) return [];

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, PALETTE_SIZE)
    .map((bucket) => {
      const rgb: [number, number, number] = [
        Math.round(bucket.red / bucket.count),
        Math.round(bucket.green / bucket.count),
        Math.round(bucket.blue / bucket.count),
      ];
      return { hex: toHex(rgb[0], rgb[1], rgb[2]), rgb, share: bucket.count / counted };
    });
};

const parseEmbedded = async (
  file: File | Blob,
  format: SourceFormat,
): Promise<Record<string, unknown> | null> => {
  if (!formatSupportsEmbeddedMetadata(format)) return null;

  try {
    const parsed: unknown = await exifr.parse(file, {
      // Grouped rather than merged, so JFIF's XResolution cannot be shadowed by
      // EXIF's identically named tag.
      mergeOutput: false,
      translateKeys: true,
      translateValues: true,
      reviveValues: true,
      sanitize: true,
      tiff: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      jfif: true,
      ihdr: true,
    });
    return toRecord(parsed);
  } catch {
    // A missing or malformed metadata block is not a decode failure.
    return null;
  }
};

const summarizeExif = (segments: {
  ifd0: Record<string, unknown> | null;
  exif: Record<string, unknown> | null;
  gps: Record<string, unknown> | null;
  iptc: Record<string, unknown> | null;
  xmp: Record<string, unknown> | null;
}): ExifSummary => {
  const { ifd0, exif, gps, iptc, xmp } = segments;

  return {
    make: toText(ifd0?.Make),
    model: toText(ifd0?.Model),
    lens: toText(exif?.LensModel ?? exif?.LensMake),
    iso: toNumber(exif?.ISO ?? exif?.ISOSpeedRatings),
    fNumber: toNumber(exif?.FNumber),
    exposureTime: describeExposureTime(exif?.ExposureTime),
    focalLength: toNumber(exif?.FocalLength),
    dateTaken: toIsoDate(exif?.DateTimeOriginal ?? exif?.CreateDate ?? ifd0?.ModifyDate),
    orientation: toNumber(ifd0?.Orientation),
    software: toText(ifd0?.Software ?? xmp?.CreatorTool),
    colorSpace: toText(exif?.ColorSpace),
    artist: toText(ifd0?.Artist ?? iptc?.byline ?? xmp?.creator),
    copyright: toText(ifd0?.Copyright ?? iptc?.copyright ?? xmp?.rights),
    description: toText(ifd0?.ImageDescription ?? iptc?.caption ?? xmp?.description),
    keywords: toStringArray(iptc?.keywords ?? xmp?.subject),
    hasGpsCoordinates: toNumber(gps?.latitude) !== null && toNumber(gps?.longitude) !== null,
  };
};

/**
 * Measures a decoded image. `decoded.bitmap` supplies the intrinsic size, so
 * the file is never decoded twice.
 */
export const extractMetadata = async (input: ExtractMetadataInput): Promise<ImageMetadata> => {
  const { file, format, decoded } = input;
  const { bitmap, isVector, isAnimated, decodedVia } = decoded;

  const fileName = input.fileName ?? ('name' in file ? file.name : 'image');
  const width = bitmap.width;
  const height = bitmap.height;
  const pixelCount = width * height;

  const embedded = await parseEmbedded(file, format);
  const segments = {
    ifd0: toRecord(embedded?.ifd0),
    exif: toRecord(embedded?.exif),
    gps: toRecord(embedded?.gps),
    jfif: toRecord(embedded?.jfif),
    iptc: toRecord(embedded?.iptc),
    xmp: toRecord(embedded?.xmp),
  };
  const hasEmbeddedMetadata = Object.values(segments).some((segment) => segment !== null);

  const dpi = isVector
    ? null
    : (readResolutionPair(segments.jfif, 'jfif') ??
      readResolutionPair(segments.ifd0 ?? segments.exif, 'exif') ??
      (format === 'png' ? await readPngPhysDpi(file) : null));

  const supportsAlphaChannel = formatSupportsAlpha(format);
  const pixelStats = measurePixels(sampleImage(bitmap, PIXEL_SAMPLE_EDGE));
  const palette = quantizePalette(sampleImage(bitmap, PALETTE_SAMPLE_EDGE));

  return {
    fileName,
    fileSizeBytes: file.size,
    fileSizeLabel: formatFileSize(file.size),
    sourceFormat: format,
    sourceFormatLabel: sourceFormatLabels[format],
    mimeType: file.type || sourceFormatMimeTypes[format],
    decodedVia,

    width,
    height,
    isVector,
    isAnimated,
    orientationClass: width === height ? 'square' : width > height ? 'landscape' : 'portrait',
    aspectRatio: height === 0 ? 1 : width / height,
    aspectRatioLabel: describeAspectRatio(width, height),
    closestNamedRatio: describeClosestNamedRatio(width, height),
    megapixels: isVector ? null : Number((pixelCount / 1_000_000).toFixed(2)),
    bytesPerPixel: isVector || pixelCount === 0 ? null : Number((file.size / pixelCount).toFixed(3)),
    dpi,

    supportsAlphaChannel,
    hasTransparency: supportsAlphaChannel && pixelStats.hasTransparency,
    transparentPixelRatio: supportsAlphaChannel ? pixelStats.transparentPixelRatio : 0,

    palette,
    averageLuminance: pixelStats.averageLuminance,

    supportsEmbeddedMetadata: formatSupportsEmbeddedMetadata(format),
    hasEmbeddedMetadata,
    exif: hasEmbeddedMetadata ? summarizeExif(segments) : null,
  };
};
