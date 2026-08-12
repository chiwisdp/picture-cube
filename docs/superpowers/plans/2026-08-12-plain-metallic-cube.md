# Plain Metallic Cube Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cube render as a single polished-chrome material on all six faces instead of texturing faces with dropped images, without touching the drop/decode/analyze/tray/panel pipeline.

**Architecture:** `PictureCube.svelte` currently reads `imageStore.pageImages` to build six `THREE.Texture`s and attach one material per box face, and lets a face click select an image. That entire image-to-face path is deleted; the box gets one uniform `MeshStandardMaterial` (metalness 1, roughness 0.1) and drops its click handler. `Scene.svelte` gets a `<Environment>` so the chrome has something to reflect (a metal material with no environment map reads as flat black under point/directional lights only). `App.svelte` gets a one-line copy fix since the subtitle currently promises "click a face to analyse it," which will no longer be true.

**Tech Stack:** Svelte 5 (runes), Threlte (`@threlte/core`, `@threlte/extras`), Three.js, GSAP. No test runner in this repo — verification is `npm run check` (svelte-check + tsc) plus manual confirmation in the browser via `npm run dev`.

## Global Constraints

- Only these three files change: `src/lib/PictureCube.svelte`, `src/lib/Scene.svelte`, `src/App.svelte`. Nothing else in the image pipeline (`DropLayer`, `ImageTray`, `AnalysisPanel`, `RolePreview`, `imageStore`, `analysis/`, `analyzeClient.ts`, `server/`) is touched.
- No dependencies are added or removed from `package.json` — `@threlte/extras` (which provides `Environment`) is already a dependency.
- The `dragActive` prop keeps flowing `App → Scene → PictureCube` with the same name and type (`boolean`, default `false`).
- Cube material: `metalness={1}`, `roughness={0.1}`, no `map`.
- Environment: `<Environment preset="city" />` in `Scene.svelte`.
- New subtitle copy in `App.svelte`: `Drop images to analyse them`.

---

### Task 1: Strip image texturing and face-click out of PictureCube

**Files:**
- Modify: `src/lib/PictureCube.svelte` (full rewrite of the `<script>` block and template)

**Interfaces:**
- Consumes: nothing new — keeps its existing `Props = { dragActive?: boolean }` signature, unchanged from today.
- Produces: a `PictureCube` component with the same public prop (`dragActive`) but no more `imageStore` dependency. `Scene.svelte` (Task 2) continues to render it as `<PictureCube {dragActive} />` with no interface change.

- [ ] **Step 1: Replace the full contents of `src/lib/PictureCube.svelte`**

```svelte
<script lang="ts">
  import { T } from '@threlte/core'
  import gsap from 'gsap'
  import { untrack } from 'svelte'
  import * as THREE from 'three'

  type Props = {
    /** True while a file drag is over the window. Scales the cube and lights the rim. */
    dragActive?: boolean
  }

  let { dragActive = false }: Props = $props()

  const TWO_PI = Math.PI * 2

  let group = $state<THREE.Group>()
  let idleSpin = $state<gsap.core.Tween>()
  let hovered = $state(false)
  let rimGlow = $state(0)

  const handlePointerEnter = (): void => {
    hovered = true
  }

  const handlePointerLeave = (): void => {
    hovered = false
  }

  $effect(() => {
    if (!group) return

    const entrance = gsap.from(group.rotation, {
      y: TWO_PI,
      x: Math.PI * 0.4,
      duration: 1.6,
      ease: 'power3.out'
    })
    const spin = gsap.to(group.rotation, {
      y: '+=' + TWO_PI,
      duration: 26,
      repeat: -1,
      ease: 'none'
    })
    idleSpin = spin

    return () => {
      entrance.kill()
      spin.kill()
    }
  })

  $effect(() => {
    if (!idleSpin) return
    const shouldSpin = !dragActive && !hovered
    if (shouldSpin) {
      idleSpin.play()
      return
    }
    idleSpin.pause()
  })

  $effect(() => {
    if (!group) return
    const scale = dragActive ? 1.16 : hovered ? 1.06 : 1
    const tween = gsap.to(group.scale, { x: scale, y: scale, z: scale, duration: 0.35, ease: 'power2.out' })
    return () => tween.kill()
  })

  $effect(() => {
    const target = dragActive ? 0.4 : 0
    const value = { opacity: untrack(() => rimGlow) }
    const tween = gsap.to(value, {
      opacity: target,
      duration: 0.35,
      ease: 'power2.out',
      onUpdate: () => {
        rimGlow = value.opacity
      }
    })
    return () => tween.kill()
  })
</script>

<T.Group bind:ref={group}>
  <T.Mesh
    onpointerenter={handlePointerEnter}
    onpointerleave={handlePointerLeave}
  >
    <T.BoxGeometry args={[2, 2, 2]} />
    <T.MeshStandardMaterial metalness={1} roughness={0.1} />
  </T.Mesh>

  <T.Mesh scale={1.14}>
    <T.BoxGeometry args={[2, 2, 2]} />
    <T.MeshBasicMaterial
      color="#818cf8"
      transparent
      opacity={rimGlow}
      side={THREE.BackSide}
      depthWrite={false}
      blending={THREE.AdditiveBlending}
    />
  </T.Mesh>
</T.Group>
```

This removes `faceTextures`, `createBitmapTexture`, `createPlaceholderTexture`, `attachFace`, `pageBitmaps`, `cachedSignature`, `cachedBitmaps`, `handleFaceClick`, `selectedFaceIndex`, the rotate-to-selected-face effect, the per-face emissive highlight, and the `imageStore`/`FACES_PER_PAGE`/`IntersectionEvent`/`createCanvas2D` imports. It keeps the `group` ref, entrance spin, idle auto-spin (now gated only on `dragActive`/`hovered`, since there's no selection to pause for), hover scale-up, and the drag rim-glow mesh, all unchanged in behavior.

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no errors. (This will surface any leftover reference to a removed symbol, e.g. `imageStore`, `IntersectionEvent`, or `FACES_PER_PAGE`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/PictureCube.svelte
git commit -m "Replace per-face image textures with a single polished-chrome material"
```

---

### Task 2: Add an Environment so the chrome has reflections

**Files:**
- Modify: `src/lib/Scene.svelte:1-14` (import line and script body), `src/lib/Scene.svelte` (template, add one line)

**Interfaces:**
- Consumes: `PictureCube` from Task 1 (same `{ dragActive }` usage as before — no change to how `Scene.svelte` invokes it).
- Produces: nothing new consumed by other tasks.

- [ ] **Step 1: Add the `Environment` import**

In `src/lib/Scene.svelte`, change:

```svelte
  import { OrbitControls, interactivity } from '@threlte/extras'
```

to:

```svelte
  import { Environment, OrbitControls, interactivity } from '@threlte/extras'
```

- [ ] **Step 2: Render the Environment**

In the template, after the two `T.DirectionalLight` elements and before `<PictureCube {dragActive} />`, add:

```svelte
<Environment preset="city" />
```

So the tail of the template reads:

```svelte
<T.DirectionalLight
  position={[-4, -2, -3]}
  intensity={0.3}
/>

<Environment preset="city" />

<PictureCube {dragActive} />
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Manual visual check**

Run: `npm run dev`, open the printed local URL in a browser.
Expected: the cube is a single reflective chrome material on all six faces (no placeholder texture, no per-face images), and you can see soft environment reflections moving across it as it idle-spins — it should not look flat black. Hovering scales it up slightly; dragging a file over the window (from the OS file explorer) scales it further and adds the indigo rim glow.

- [ ] **Step 5: Commit**

```bash
git add src/lib/Scene.svelte
git commit -m "Add Environment preset so the cube's chrome material has reflections"
```

---

### Task 3: Fix the subtitle copy

**Files:**
- Modify: `src/App.svelte:50`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Update the subtitle text**

In `src/App.svelte`, change:

```svelte
      <p class="mt-1 text-sm text-neutral-400">
        Drop images to texture the cube &middot; click a face to analyse it
      </p>
```

to:

```svelte
      <p class="mt-1 text-sm text-neutral-400">
        Drop images to analyse them
      </p>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Manual visual check**

Run: `npm run dev` (if not already running), open the browser.
Expected: header reads "Drop images to analyse them" instead of the old copy.

- [ ] **Step 4: Commit**

```bash
git add src/App.svelte
git commit -m "Update header copy to drop the no-longer-true face-click hint"
```
