# Plain metallic cube (decouple faces from images)

## Problem

The cube's faces currently render the dropped images as textures (`PictureCube.svelte`), and clicking a face selects that image for the analysis panel. We want the cube to become a plain polished-chrome object with no image textures, while the rest of the drop → decode → analyze → tray/panel pipeline keeps working exactly as it does today.

## Scope

Only the cube's visual/material layer and its face-click interaction change. The image pipeline itself — `DropLayer`, `ImageTray`, `AnalysisPanel`, `RolePreview`, `imageStore`, `analysis/`, `analyzeClient.ts`, `server/` — is untouched. `dragActive` continues to flow `App → Scene → PictureCube` unchanged, since it's local UI state, not image data.

## Design

### `src/lib/PictureCube.svelte`

Remove everything that exists to put an image on a face:
- `faceTextures`, `createBitmapTexture`, `createPlaceholderTexture`, `attachFace`
- `pageBitmaps`, `cachedSignature`, `cachedBitmaps`
- `handleFaceClick`, `selectedFaceIndex`, and the effect that rotates the group to face the selected image
- The per-selected-face emissive highlight
- The `imageStore` and `FACES_PER_PAGE` imports

Replace the `{#each faceTextures as texture, index}` block (six `MeshStandardMaterial` instances wired to `attach`) with a single `T.MeshStandardMaterial`:
- `metalness={1}`
- `roughness={0.1}`
- no `map`

Applied directly as a child of the box mesh — no per-face array or `attach` callback needed once every face looks identical.

Keep unchanged: the `group` ref, entrance spin, idle auto-spin, hover scale-up (`hovered` + pointer handlers), the drag-driven rim-glow mesh and its effect, and all gsap tweens. The mesh's `onclick` handler is removed (no more face selection); `onpointerenter`/`onpointerleave` stay.

### `src/lib/Scene.svelte`

Add `<Environment>` from `@threlte/extras` (already a dependency), e.g. `preset="city"`, so the polished-chrome material has something to reflect. Without it, `metalness=1, roughness=0.1` under only two directional lights reads as flat black.

### `src/App.svelte`

Update the subtitle copy, since "click a face to analyse it" is no longer true:

> Drop images to analyse them

No other changes to `App.svelte`.

## Out of scope

- Any change to the image pipeline, tray, or analysis panel.
- Any change to how images are selected (still tray-only).
- Removing or renaming dependencies — none become unused by this change.

## Testing

Manual verification (per project convention — no test suite exists yet):
- Cube renders as a single reflective chrome material on all six faces, no placeholder/image textures.
- Dropping/selecting images in the tray still triggers analysis and opens the panel; cube no longer reacts to or reflects the selection.
- Idle spin, entrance spin, hover scale-up, and drag rim-glow still behave as before.
- Clicking the cube does nothing (no face-select behavior, no console errors).
