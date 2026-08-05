/**
 * Magic-byte format detection.
 *
 * `file.type` is unreliable: Windows frequently hands back an empty string for
 * HEIC, AVIF and TIFF, and mislabels `.jfif` / `.jpe`. So the bytes decide, and
 * the MIME type and the extension are only consulted when the bytes say nothing.
 *
 * Browser-only module, but it touches nothing beyond `Blob` and `TextDecoder`.
 */

export const sourceFormats = [
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'heic',
  'bmp',
  'ico',
  'tiff',
  'svg',
  'unknown',
] as const;

export type SourceFormat = (typeof sourceFormats)[number];

export const sourceFormatLabels: Record<SourceFormat, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  gif: 'GIF',
  webp: 'WebP',
  avif: 'AVIF',
  heic: 'HEIC / HEIF',
  bmp: 'BMP',
  ico: 'ICO',
  tiff: 'TIFF',
  svg: 'SVG',
  unknown: 'unrecognised format',
};

export const sourceFormatMimeTypes: Record<SourceFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  heic: 'image/heic',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  unknown: 'application/octet-stream',
};

/**
 * Extensions worth listing on a file input. TIFF and AVIF often carry no MIME
 * type, so an `accept` of `image/*` alone greys them out in the OS picker.
 */
export const sourceFormatExtensions: Record<SourceFormat, readonly string[]> = {
  jpeg: ['.jpg', '.jpeg', '.jfif', '.jpe', '.pjpeg'],
  png: ['.png', '.apng'],
  gif: ['.gif'],
  webp: ['.webp'],
  avif: ['.avif'],
  heic: ['.heic', '.heif'],
  bmp: ['.bmp', '.dib'],
  ico: ['.ico', '.cur'],
  tiff: ['.tif', '.tiff'],
  svg: ['.svg'],
  unknown: [],
};

/** Ready-made `accept` value for `<input type="file">`. */
export const fileInputAccept = [
  'image/*',
  ...sourceFormats.flatMap((format) => sourceFormatExtensions[format]),
].join(',');

/** SVG is the only resolution-independent input the pipeline accepts. */
export const isVectorFormat = (format: SourceFormat): boolean => format === 'svg';

/** Whether the container can carry an alpha channel at all. */
export const formatSupportsAlpha = (format: SourceFormat): boolean =>
  format === 'png' ||
  format === 'gif' ||
  format === 'webp' ||
  format === 'avif' ||
  format === 'heic' ||
  format === 'tiff' ||
  format === 'ico' ||
  format === 'svg';

/**
 * Whether the container has anywhere to put EXIF / XMP / IPTC. BMP, ICO, GIF
 * and SVG do not, so the panel can show an explicit "no embedded metadata"
 * state instead of an empty grid.
 */
export const formatSupportsEmbeddedMetadata = (format: SourceFormat): boolean =>
  format === 'jpeg' ||
  format === 'png' ||
  format === 'webp' ||
  format === 'avif' ||
  format === 'heic' ||
  format === 'tiff';

/** How much of the file the sniffer reads. Generous enough for an SVG prologue. */
const SNIFF_BYTE_COUNT = 4096;

/** `<svg` can sit behind an XML declaration, a DOCTYPE and licence comments. */
const SVG_TEXT_SCAN_BYTES = 2048;

const AVIF_BRANDS = new Set(['avif', 'avis', 'av01', 'avio']);

const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

const matchesAt = (bytes: Uint8Array, offset: number, signature: readonly number[]): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte);

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

/**
 * ISO base media files (HEIC, AVIF, and the odd MP4-ish sibling) all start with
 * an `ftyp` box. Only the brand list distinguishes them.
 */
const sniffIsoBaseMedia = (bytes: Uint8Array): SourceFormat => {
  const majorBrand = asciiAt(bytes, 8, 4);
  if (AVIF_BRANDS.has(majorBrand)) return 'avif';

  const boxSize = readUint32(bytes, 0);
  const brandsEnd = Math.min(boxSize > 0 ? boxSize : bytes.length, bytes.length);
  for (let offset = 16; offset + 4 <= brandsEnd; offset += 4) {
    if (AVIF_BRANDS.has(asciiAt(bytes, offset, 4))) return 'avif';
  }

  if (HEIF_BRANDS.has(majorBrand)) return 'heic';
  return 'unknown';
};

const looksLikeSvg = (bytes: Uint8Array): boolean => {
  const prefix = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, SVG_TEXT_SCAN_BYTES))
    .toLowerCase();
  return prefix.includes('<svg');
};

/** Returns `'unknown'` when the bytes are inconclusive rather than guessing. */
export const sniffFormatFromBytes = (bytes: Uint8Array): SourceFormat => {
  if (matchesAt(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (matchesAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (asciiAt(bytes, 0, 3) === 'GIF') return 'gif';
  if (asciiAt(bytes, 0, 4) === 'RIFF' && asciiAt(bytes, 8, 4) === 'WEBP') return 'webp';
  if (asciiAt(bytes, 4, 4) === 'ftyp') return sniffIsoBaseMedia(bytes);
  if (asciiAt(bytes, 0, 2) === 'BM') return 'bmp';
  if (matchesAt(bytes, 0, [0x00, 0x00, 0x01, 0x00])) return 'ico';
  if (matchesAt(bytes, 0, [0x00, 0x00, 0x02, 0x00])) return 'ico';
  // Little-endian and big-endian TIFF, classic (42) and BigTIFF (43).
  if (matchesAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00])) return 'tiff';
  if (matchesAt(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (matchesAt(bytes, 0, [0x49, 0x49, 0x2b, 0x00])) return 'tiff';
  if (matchesAt(bytes, 0, [0x4d, 0x4d, 0x00, 0x2b])) return 'tiff';
  if (looksLikeSvg(bytes)) return 'svg';
  return 'unknown';
};

export const formatFromMimeType = (mimeType: string): SourceFormat => {
  const normalized = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!normalized) return 'unknown';
  if (normalized === 'image/jpg' || normalized === 'image/pjpeg') return 'jpeg';
  if (normalized === 'image/vnd.microsoft.icon') return 'ico';
  if (normalized === 'image/heif' || normalized === 'image/heic-sequence') return 'heic';
  if (normalized === 'image/x-tiff') return 'tiff';
  const match = sourceFormats.find((format) => sourceFormatMimeTypes[format] === normalized);
  return match ?? 'unknown';
};

export const formatFromFileName = (fileName: string): SourceFormat => {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 0) return 'unknown';
  const extension = fileName.slice(lastDot).toLowerCase();
  const match = sourceFormats.find((format) =>
    sourceFormatExtensions[format].includes(extension),
  );
  return match ?? 'unknown';
};

/**
 * Bytes first, then `file.type`, then the extension. Returns `'unknown'` when
 * every signal fails; `decodeToBitmap` still attempts a native decode in that
 * case rather than rejecting up front.
 */
export const sniffFormat = async (file: File | Blob): Promise<SourceFormat> => {
  const bytes = new Uint8Array(await file.slice(0, SNIFF_BYTE_COUNT).arrayBuffer());

  const fromBytes = sniffFormatFromBytes(bytes);
  if (fromBytes !== 'unknown') return fromBytes;

  const fromMimeType = formatFromMimeType(file.type);
  if (fromMimeType !== 'unknown') return fromMimeType;

  if ('name' in file) return formatFromFileName(file.name);
  return 'unknown';
};
