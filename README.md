# Picture Cube

Drop images onto a rotating 3D cube and get a web-usage report for each one.

Every image is decoded in the browser, measured for real (dimensions, DPI, byte
weight, actual alpha usage, dominant palette, EXIF), and textured onto a face of
a Threlte cube. Those measurements are then sent to a vision model via
[OpenRouter](https://openrouter.ai/) alongside a downscaled preview, and the
model scores the image against eight concrete web slots — hero, header banner,
card thumbnail, page background, avatar, Open Graph image, inline article
image, gallery tile — and picks a focal point. That focal point drives real,
downloadable crops generated on a canvas at each slot's exact target ratio and
size.

The split is deliberate: the browser measures, the model judges. The model is
never asked for a number that could be measured, so it cannot invent one.

## Quick start

```bash
npm install
cp .env.example .env   # then paste your key into OPENROUTER_API_KEY
npm run dev
```

Open http://localhost:5173 and drop some images on the page.

### The API key is optional

`OPENROUTER_API_KEY` is read server-side by the dev server and never reaches the
browser bundle. Without it the app still runs and the dev server prints a
warning at startup; only AI analysis is unavailable. Drag and drop, format
detection, decoding, the full metadata panel, cube texturing, thumbnails, and
crop generation and download all work. Crops just centre on the middle of the
image instead of on a model-chosen focal point, and each image ends in a
`Failed` state whose message explains that the key is missing.

Get a key at https://openrouter.ai/keys. `.env` is git-ignored; `.env.example`
is the committed template.

Optional: set `OPENROUTER_MODEL` to override the default
(`anthropic/claude-sonnet-5`, vision + structured JSON). Any OpenRouter vision
model that supports `response_format` / `json_schema` will work.

> Migrating from the previous Anthropic-direct setup: replace
> `ANTHROPIC_API_KEY` with `OPENROUTER_API_KEY` in `.env`. The client contract
> for `POST /api/analyze` is unchanged.

### The analysis route is dev-only

`POST /api/analyze` is a Vite dev-server middleware (`server/devApiPlugin.ts`),
registered with `apply: 'serve'` so it is excluded from `vite build` entirely. A
production build of this app has no backend and no analysis. The actual
OpenRouter call lives in `server/analyzeImage.ts`, which knows nothing about
Vite, Connect or `node:http`, so a real production handler can reuse it
untouched.

Analysis runs behind a concurrency gate of **3 requests in flight at a time**.
Dropping thirty images queues thirty analyses rather than firing thirty
simultaneous model calls; the rest sit in a `Queued` state and the tray shows
the backlog.

## Scripts

```bash
npm run dev      # dev server, including the /api/analyze route
npm run build    # production build (no server, no analysis)
npm run preview  # serve the production build
npm run check    # svelte-check over src/, then tsc over vite.config.ts and server/
```

## Format support

Format is detected from magic bytes, not from `file.type` or the extension.
Windows routinely reports an empty MIME type for HEIC, AVIF and TIFF, and
mislabels `.jfif` and `.jpe`. The MIME type and extension are consulted only
when the bytes are inconclusive.

Everything is decoded to an `ImageBitmap` and re-encoded from a canvas, so no
later stage sees the original format. That also means the model call is
unaffected by input format: the preview is always a canvas-derived JPEG capped
at 1024px on the long edge, sent to OpenRouter as a `data:image/jpeg;base64,…`
image URL.

| Format | Decode path | Verified |
| --- | --- | --- |
| JPEG | `createImageBitmap` | yes, including JFIF DPI |
| PNG | `createImageBitmap` | yes, including `pHYs` DPI and real alpha |
| GIF | `createImageBitmap` | yes, static and animated |
| WebP | `createImageBitmap` | yes |
| BMP | `createImageBitmap` | yes |
| ICO | `createImageBitmap` | yes |
| TIFF | `utif2`, lazy-imported | yes |
| SVG | rasterised through an `<img>` | yes, with and without intrinsic size |
| AVIF | `createImageBitmap` | not tested — see below |
| HEIC / HEIF | none; native attempt only | yes, the rejection message |

AVIF is untested only because there was no way to produce an AVIF file on the
test machine: Chrome decodes AVIF but cannot encode it, and no encoder was
available. It goes down the same native path as JPEG and PNG.

### Format-specific handling

- **SVG** needs its own path. `createImageBitmap` on an SVG blob is unreliable,
  so the markup is loaded through an `<img>` with a blob URL and drawn to a
  canvas. An SVG with a `viewBox` but no `width`/`height` reports
  `naturalWidth === 0` in some browsers, so the size is parsed out of the
  `viewBox` and written back onto the root element before rasterising at 1024px
  on the long edge. Because vector art has no true pixel size, the panel hides
  DPI and megapixels and labels the image as vector, and the prompt is told so
  it can recommend keeping a logo vector rather than raster-exporting it.
- **Animated GIF, APNG, animated WebP and AVIF sequences** are detected by
  walking the container (GIF blocks, the PNG `acTL` chunk, the WebP `ANIM`
  chunk, the AVIF `avis` brand) rather than by counting bytes. Only frame one is
  decoded, and the panel and the prompt both say so.
- **PNG DPI** lives in the `pHYs` chunk, which `exifr` does not expose, so the
  chunk stream is walked by hand. `pHYs` stores pixels per metre; a DPI is only
  reported when the unit specifier says metres, since an unspecified unit
  carries a ratio and no real-world scale.
- **Transparency** is measured, not inferred from the container. A PNG whose
  every pixel is opaque reports "None used", not "supports alpha".
- **BMP, ICO, GIF and SVG** have no container for EXIF, IPTC or XMP, so the
  panel shows an explicit "no metadata container" state rather than an empty
  grid.

### Why HEIC is excluded

HEIC and HEIF are deliberately not given a decoder. The only practical option is
an LGPL `libheif` wasm build, and that licence is not worth taking on for one
input format. Recent Safari decodes HEIC natively, so the file is still handed
to `createImageBitmap` rather than blocked up front; everywhere that fails, the
tray and panel show a specific message telling you to convert to JPEG or WebP,
instead of a generic decode error.

Anything that fails every path surfaces a readable, per-item reason in the tray
and the panel rather than failing silently.

## How it works

```
drop / paste / picker
  -> sniffFormat        magic bytes -> SourceFormat
  -> decodeToBitmap     native | SVG raster | utif2
  -> extractMetadata    exifr + pHYs reader + canvas alpha scan + palette
  -> imageStore         unlimited queue, 6-per-page cube window
       |-> PictureCube  one THREE.Texture per face, disposed on page change
       |-> downscale    max 1024px JPEG, base64
             -> POST /api/analyze
                  -> server/analyzeImage.ts -> OpenRouter (anthropic/claude-sonnet-5)
                       -> imageAnalysisSchema (zod, shared client and server)
                            -> AnalysisPanel -> cropForRole -> preview + download
```

The queue is unlimited and nothing is ever evicted. The cube renders six images
at a time with prev/next controls; only those six textures are live, and
`THREE.Texture.dispose()` runs on every page change so a long session does not
leak GPU memory. Decoded bitmaps and thumbnails are kept for the whole queue and
released only when an image is removed.

Clicking a face selects it and opens the panel; the tray at the bottom scrolls
through the entire queue, mirrors the selection for keyboard access, and jumps
the cube to the right page when you pick something off-page.

State is entirely ephemeral. A refresh clears everything; there is no
persistence layer.

## Project structure

```
server/
  analyzeImage.ts        framework-agnostic OpenRouter call, prompt, error mapping
  devApiPlugin.ts        Vite plugin registering POST /api/analyze (serve only)
src/
  App.svelte             page shell: canvas, drop layer, tray, panel, paging
  lib/
    Scene.svelte         camera, lights, orbit controls
    PictureCube.svelte   the cube: per-face textures, selection, GSAP motion
    DropLayer.svelte     window drag/drop/paste, file picker, drag overlay
    ImageTray.svelte     the whole queue as thumbnails, with page markers
    AnalysisPanel.svelte metadata / uses / edits, sliding in from the right
    RolePreview.svelte   generated crop, crop-rect overlay, quality, download
    analyzeClient.ts     the only module that knows the HTTP contract
    analysis/
      schema.ts          zod ImageAnalysis, shared by client and server
      webRoles.ts        the eight web slots, their ratios, sizes and budgets
    image/
      sniffFormat.ts     magic-byte format detection
      decode.ts          native / SVG / TIFF paths, UnsupportedFormatError
      extractMetadata.ts exifr, pHYs DPI, alpha scan, palette quantisation
      downscale.ts       the max-1024px base64 JPEG sent to the model
      encodeSupport.ts   canvas encode probing and the shared canvas helper
      cropForRole.ts     focal-point crop arithmetic and encoding
      store.svelte.ts    the queue, paging, selection and the analysis gate
```

`webRoles.ts` is the single source of truth for the slot specs. The same numbers
are injected into the prompt, rendered in the panel, and used by the crop
generator, so a recommendation and the crop it produces can never disagree.

## Stack

- [Vite](https://vitejs.dev/) 8 — build tool and dev server
- [Svelte 5](https://svelte.dev/) — UI framework, runes throughout
- [Threlte](https://threlte.xyz/) 8 (`@threlte/core`, `@threlte/extras`) and
  [Three.js](https://threejs.org/) — the cube
- [Tailwind CSS](https://tailwindcss.com/) 4 — styling
- [GSAP](https://gsap.com/) — cube rotation, entrance and idle spin
- [svelte-motion](https://svelte-motion.gradientdescent.de/) — DOM overlay animation
- [OpenRouter](https://openrouter.ai/) — vision analysis via Chat Completions
  (`fetch`, no SDK); default model `anthropic/claude-sonnet-5`
- [zod](https://zod.dev/) — the analysis schema, shared by both sides
- [exifr](https://github.com/MikeKovarik/exifr) — EXIF, IPTC, XMP and JFIF
- [utif2](https://github.com/image-js/utif) — TIFF decoding, lazy-imported

No wasm image decoders and nothing copyleft.
