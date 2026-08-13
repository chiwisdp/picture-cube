/**
 * Ambient declaration for `utif2`.
 *
 * The package does ship a `UTIF.d.ts`, but it is the DefinitelyTyped file for
 * the Node build: it declares only named exports and types its buffers as
 * Node `Buffer`. `utif2` is CommonJS (`module.exports = UTIF`) built up
 * dynamically, so a bundler cannot statically detect those named exports and
 * the lazy `await import('utif2')` in `decode.ts` only ever gets a `default`.
 *
 * This declaration models the shape the browser actually receives, and drops
 * the `Buffer` overloads we cannot use anyway.
 */

declare module 'utif2' {
  /**
   * A TIFF image file directory. Keys like `t256` are raw TIFF tags; `width`,
   * `height` and `data` only exist after `decodeImage` has run.
   */
  export interface UtifImageFileDirectory {
    [tag: string]: unknown;
    width: number;
    height: number;
    data: Uint8Array;
  }

  /** Reads the directory structure without decompressing any pixels. */
  export function decode(buffer: ArrayBuffer | Uint8Array): UtifImageFileDirectory[];

  /** Decompresses one page in place, populating `width`, `height` and `data`. */
  export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: UtifImageFileDirectory): void;

  /** Converts a decoded page to 8-bit RGBA, ready for `ImageData`. */
  export function toRGBA8(ifd: UtifImageFileDirectory): Uint8Array;

  const UTIF: {
    decode: typeof decode;
    decodeImage: typeof decodeImage;
    toRGBA8: typeof toRGBA8;
  };

  export default UTIF;
}
