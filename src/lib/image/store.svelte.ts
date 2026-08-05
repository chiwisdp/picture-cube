/**
 * The one piece of app state: an unlimited queue of dropped images, the cube's
 * current page of six, and the current selection.
 *
 * The store owns the whole per-image pipeline — sniff, decode, measure,
 * thumbnail, analyse — so components never touch the image modules or the
 * network. Nothing is persisted; a refresh clears everything.
 *
 * Analysis runs behind a small concurrency gate. Dropping thirty images should
 * queue thirty analyses, not fire thirty simultaneous model calls.
 */

import type { ImageAnalysis } from '../analysis/schema';
import { requestAnalysis } from '../analyzeClient';
import { decodeToBitmap, UnsupportedFormatError } from './decode';
import { downscaleToBase64 } from './downscale';
import { canvasToBlob, createCanvas2D, getEncodeSupport } from './encodeSupport';
import type { ImageMetadata } from './extractMetadata';
import { extractMetadata } from './extractMetadata';
import type { SourceFormat } from './sniffFormat';
import { sniffFormat } from './sniffFormat';

/** A cube has six faces, so a page is six images. */
export const FACES_PER_PAGE = 6;

/** How many analyses may be in flight at once. The rest wait as `queued`. */
export const ANALYSIS_CONCURRENCY = 3;

/** Long edge of the tray thumbnail. Large enough for a 2x 128px card. */
const THUMBNAIL_MAX_EDGE = 512;

const THUMBNAIL_QUALITY = 0.82;

export type ImageStatus = 'decoding' | 'queued' | 'analyzing' | 'done' | 'error';

export const imageStatusLabels: Record<ImageStatus, string> = {
  decoding: 'Decoding',
  queued: 'Queued',
  analyzing: 'Analysing',
  done: 'Analysed',
  error: 'Failed',
};

export type DroppedImage = {
  id: string;
  file: File;
  fileName: string;
  sourceFormat: SourceFormat;
  /**
   * A re-encoded WebP blob URL, never the original file's object URL: an
   * `<img>` cannot paint a TIFF, so the tray would show a broken thumbnail for
   * every format the browser has no native decoder for.
   */
  displayUrl: string | null;
  bitmap: ImageBitmap | null;
  metadata: ImageMetadata | null;
  status: ImageStatus;
  analysis: ImageAnalysis | null;
  /** Set for a decode failure or a failed analysis. Written for display. */
  error: string | null;
};

let idCounter = 0;

const createPendingImage = (file: File): DroppedImage => {
  idCounter += 1;
  return {
    id: `image-${idCounter}`,
    file,
    fileName: file.name || 'pasted image',
    sourceFormat: 'unknown',
    displayUrl: null,
    bitmap: null,
    metadata: null,
    status: 'decoding',
    analysis: null,
    error: null,
  };
};

/**
 * `UnsupportedFormatError.hint` is written as advice for the person looking at
 * the tray, so it beats the technical message every time.
 */
const describeFailure = (error: unknown): string => {
  if (error instanceof UnsupportedFormatError) return error.hint;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return 'This file could not be processed.';
};

/** Re-encodes the decoded bitmap so every input format displays uniformly. */
const createDisplayUrl = async (bitmap: ImageBitmap): Promise<string> => {
  const support = await getEncodeSupport();
  const mimeType = support.webp ? 'image/webp' : 'image/png';

  const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const { canvas, context } = createCanvas2D(bitmap.width * scale, bitmap.height * scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await canvasToBlob(canvas, mimeType, THUMBNAIL_QUALITY);
  return URL.createObjectURL(blob);
};

const releaseImage = (image: DroppedImage): void => {
  if (image.displayUrl) URL.revokeObjectURL(image.displayUrl);
  image.bitmap?.close();
};

class ImageStore {
  images = $state<DroppedImage[]>([]);
  selectedId = $state<string | null>(null);
  page = $state(0);

  /** Ids waiting for an analysis slot. Plain, not reactive: internal plumbing. */
  private queue: string[] = [];
  private activeAnalyses = 0;

  hasImages = $derived(this.images.length > 0);
  pageCount = $derived(Math.max(1, Math.ceil(this.images.length / FACES_PER_PAGE)));
  pageImages = $derived(
    this.images.slice(this.page * FACES_PER_PAGE, this.page * FACES_PER_PAGE + FACES_PER_PAGE),
  );
  selected = $derived(this.images.find((image) => image.id === this.selectedId) ?? null);
  pendingCount = $derived(
    this.images.filter((image) => image.status === 'queued' || image.status === 'analyzing').length,
  );

  /**
   * Queues files, jumps to the page holding the first of them, and prepares
   * them one at a time so the tray fills in progressively rather than freezing
   * on a batch of large decodes.
   */
  addFiles = async (files: readonly File[]): Promise<void> => {
    const accepted = files.filter((file) => file.size > 0);
    if (accepted.length === 0) return;

    const firstIndex = this.images.length;
    const added = accepted.map(createPendingImage);
    this.images.push(...added);

    this.page = Math.floor(firstIndex / FACES_PER_PAGE);
    this.selectedId = added[0].id;

    for (const image of added) {
      await this.prepare(image.id);
    }
  };

  select = (id: string): void => {
    const index = this.images.findIndex((image) => image.id === id);
    if (index < 0) return;

    this.page = Math.floor(index / FACES_PER_PAGE);
    this.selectedId = id;
  };

  deselect = (): void => {
    this.selectedId = null;
  };

  remove = (id: string): void => {
    const index = this.images.findIndex((image) => image.id === id);
    if (index < 0) return;

    const [removed] = this.images.splice(index, 1);
    releaseImage(removed);
    this.queue = this.queue.filter((queuedId) => queuedId !== id);

    if (this.selectedId === id) {
      const next = this.images[index] ?? this.images[index - 1] ?? null;
      this.selectedId = next?.id ?? null;
    }
    this.clampPage();
  };

  clear = (): void => {
    for (const image of this.images) releaseImage(image);
    this.images = [];
    this.queue = [];
    this.selectedId = null;
    this.page = 0;
  };

  goToPage = (page: number): void => {
    this.page = Math.min(Math.max(page, 0), this.pageCount - 1);
  };

  nextPage = (): void => {
    this.goToPage(this.page + 1);
  };

  prevPage = (): void => {
    this.goToPage(this.page - 1);
  };

  /** Re-runs a failed analysis. The decode result is reused as-is. */
  retryAnalysis = (id: string): void => {
    const image = this.find(id);
    if (!image?.bitmap || !image.metadata) return;

    this.patch(id, { status: 'queued', error: null });
    this.enqueue(id);
  };

  private find = (id: string): DroppedImage | undefined =>
    this.images.find((image) => image.id === id);

  /** Looks the item up again so mutations always land on the reactive proxy. */
  private patch = (id: string, changes: Partial<DroppedImage>): void => {
    const image = this.find(id);
    if (!image) return;
    Object.assign(image, changes);
  };

  /** Keeps the cube on a real page, and on the one holding the selection. */
  private clampPage = (): void => {
    const selectedIndex = this.images.findIndex((image) => image.id === this.selectedId);
    if (selectedIndex >= 0) {
      this.page = Math.floor(selectedIndex / FACES_PER_PAGE);
      return;
    }

    const lastPage = Math.max(0, Math.ceil(this.images.length / FACES_PER_PAGE) - 1);
    if (this.page > lastPage) this.page = lastPage;
  };

  private prepare = async (id: string): Promise<void> => {
    const image = this.find(id);
    if (!image) return;

    const { file } = image;
    this.patch(id, { status: 'decoding', error: null });

    try {
      const sourceFormat = await sniffFormat(file);
      // Recorded before the decode, so a file that fails to decode can still
      // say what it was detected as instead of staying 'unknown'.
      this.patch(id, { sourceFormat });

      const decoded = await decodeToBitmap(file, sourceFormat);
      const metadata = await extractMetadata({
        file,
        format: sourceFormat,
        decoded,
        fileName: image.fileName,
      });
      const displayUrl = await createDisplayUrl(decoded.bitmap);

      // The item can be removed while its decode is still running.
      if (!this.find(id)) {
        decoded.bitmap.close();
        URL.revokeObjectURL(displayUrl);
        return;
      }

      this.patch(id, {
        bitmap: decoded.bitmap,
        metadata,
        displayUrl,
        status: 'queued',
      });
      this.enqueue(id);
    } catch (error) {
      this.patch(id, { status: 'error', error: describeFailure(error) });
    }
  };

  private enqueue = (id: string): void => {
    if (this.queue.includes(id)) return;
    this.queue.push(id);
    this.pump();
  };

  private pump = (): void => {
    while (this.activeAnalyses < ANALYSIS_CONCURRENCY && this.queue.length > 0) {
      const id = this.queue.shift();
      if (!id) return;

      this.activeAnalyses += 1;
      void this.analyze(id)
        .catch((error: unknown) => {
          this.patch(id, { status: 'error', error: describeFailure(error) });
        })
        .finally(() => {
          this.activeAnalyses -= 1;
          this.pump();
        });
    }
  };

  private analyze = async (id: string): Promise<void> => {
    const image = this.find(id);
    if (!image?.bitmap || !image.metadata) return;

    this.patch(id, { status: 'analyzing', error: null });

    const downscaled = downscaleToBase64(image.bitmap);
    const result = await requestAnalysis({
      base64: downscaled.base64,
      mediaType: downscaled.mediaType,
      metadata: image.metadata,
    });

    // Removed while the request was in flight.
    if (!this.find(id)) return;

    if (!result.ok) {
      this.patch(id, { status: 'error', error: result.error });
      return;
    }

    this.patch(id, { status: 'done', analysis: result.analysis, error: null });
  };
}

export const imageStore = new ImageStore();
