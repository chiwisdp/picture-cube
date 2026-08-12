# Frame Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `Frame.svelte` component that draws a continuous outline with angled (chamfered) corners around whatever content is placed inside it.

**Architecture:** A single new Svelte component, content-sized, with no dependency on any existing component and no changes to any existing file.

**Revision (Task 2):** Task 1's single-`<div>` `border` + `clip-path` technique shipped with a real bug — `border` only paints thin strips along the box's straight edges, with no awareness of `clip-path`, so the diagonal cut left a visible gap where the two straight border segments didn't connect (found via manual visual testing after Task 1). Task 2 replaces it with two nested elements, each independently clipped to a chamfered-octagon `clip-path`: an outer element filled with `color` (the ring), and an inner element — inset by `borderWidth` via margin, with a proportionally smaller `cornerSize - borderWidth` chamfer — filled with a new `background` prop and holding the content.

**Revision (Task 4):** replaces the clip-path/nested-div technique entirely with the `@toolwind/corner-shape` Tailwind plugin, which exposes the CSS `corner-shape` property (`bevel` reshapes how `border-radius` rounds a corner into a 45° cut). Frame goes back to one element with a real `border` and per-corner `border-*-radius`, sidestepping the gap problem at its root — the browser renders the border along the shaped corner natively.

**Tech Stack:** Svelte 5 (runes, snippets), Tailwind v4 (`@plugin` directive in `app.css`) plus `@toolwind/corner-shape`, inline `style:` directives for the caller-controlled color/padding/size values (Tailwind can't generate classes from runtime prop values). No test runner in this repo — verification is `npm run check` plus a temporary manual visual check via `npm run dev`.

## Global Constraints

- `src/lib/components/Frame.svelte` plus, as of Task 4, two supporting changes: `@toolwind/corner-shape` added to `package.json` dependencies, and `@plugin '@toolwind/corner-shape';` added to `src/app.css` right after `@import 'tailwindcss';`. No other existing file is modified as part of this plan (any temporary visual-check edit to `App.svelte` must be reverted before committing).
- Props (final, after Task 4): `color?: string` (default `'var(--color-indigo-400)'`), `background?: string` (default `'var(--color-my-blue)'`), `padding?: string` (default `'1rem'`), `cornerSize?: string` (default `'0.75rem'`), `borderWidth?: string` (default `'2px'`), `topLeftCorner? / topRightCorner? / bottomRightCorner? / bottomLeftCorner?: string` (each defaults to `cornerSize`; `'0'` makes that one corner square), `children: Snippet`.
- Component sizes itself to its content (`inline-block`), not a fixed box.
- The outline must be a single continuous, fully connected ring (no gaps at the diagonal cuts) with each corner cut at a 45° angle by its own size (globally `cornerSize`, or overridden per corner). As of Task 4 this is a property of native border rendering, not something the component needs to approximate.

---

### Task 1: Create the Frame component

**Files:**
- Create: `src/lib/components/Frame.svelte`

**Interfaces:**
- Consumes: nothing from elsewhere in the codebase.
- Produces: a default-exported Svelte component usable as `<Frame color="..." padding="..." cornerSize="..." borderWidth="...">...</Frame>`, for any future caller to import from `./lib/components/Frame.svelte`.

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    /** Any valid CSS color for the outline. */
    color?: string
    /** Space between the content and the outline. */
    padding?: string
    /** Size of the angled cut at each corner (CSS length). */
    cornerSize?: string
    /** Thickness of the outline. */
    borderWidth?: string
    children: Snippet
  }

  let {
    color = 'var(--color-indigo-400)',
    padding = '1rem',
    cornerSize = '0.75rem',
    borderWidth = '2px',
    children
  }: Props = $props()

  // Chamfers all four corners by `cornerSize`. Percentages/calc() are relative
  // to this element's own box, so the same polygon works at any size.
  let clipPath = $derived(
    `polygon(${cornerSize} 0, calc(100% - ${cornerSize}) 0, 100% ${cornerSize}, 100% calc(100% - ${cornerSize}), calc(100% - ${cornerSize}) 100%, ${cornerSize} 100%, 0 calc(100% - ${cornerSize}), 0 ${cornerSize})`
  )
</script>

<div
  class="inline-block"
  style:padding
  style:border-width={borderWidth}
  style:border-color={color}
  style:border-style="solid"
  style:clip-path={clipPath}
>
  {@render children()}
</div>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Temporary manual visual check**

Temporarily add this line inside `<main>` in `src/App.svelte` (e.g. right after the opening `<main ...>` tag):

```svelte
<Frame><p class="p-4 text-white">Frame test</p></Frame>
```

with the import added to the `<script>` block:

```ts
import Frame from './lib/components/Frame.svelte'
```

Run `npm run dev` (or use the already-running dev server) and open the local URL. Expected: a box with "Frame test" inside it, with one continuous indigo outline around it whose four corners are visibly cut at a 45° angle (not square, not rounded).

Then revert both edits to `src/App.svelte` (the import and the temporary `<Frame>` usage) — this plan only adds the standalone component, not any wiring into the app.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Frame.svelte
git commit -m "Add reusable chamfered-corner Frame component"
```

---

### Task 2: Fix disconnected corners with a two-layer ring

**Files:**
- Modify: `src/lib/components/Frame.svelte` (full rewrite of the file)

**Interfaces:**
- Consumes: nothing new.
- Produces: same component name/usage as Task 1, plus a new `background?: string` prop. Existing callers (there are none yet) passing `color`, `padding`, `cornerSize`, `borderWidth` continue to work unchanged.

- [ ] **Step 1: Replace the full contents of `src/lib/components/Frame.svelte`**

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    /** Any valid CSS color for the outline. */
    color?: string
    /** Any valid CSS color for the interior, behind the content. */
    background?: string
    /** Space between the content and the outline. */
    padding?: string
    /** Size of the angled cut at each corner (CSS length). */
    cornerSize?: string
    /** Thickness of the outline. */
    borderWidth?: string
    children: Snippet
  }

  let {
    color = 'var(--color-indigo-400)',
    background = 'var(--color-my-blue)',
    padding = '1rem',
    cornerSize = '0.75rem',
    borderWidth = '2px',
    children
  }: Props = $props()

  // Builds a chamfered-octagon polygon for a box of the given corner-cut
  // size. Percentages/calc() are relative to the element's own box, so the
  // same formula works at any size.
  const chamfer = (size: string) =>
    `polygon(${size} 0, calc(100% - ${size}) 0, 100% ${size}, 100% calc(100% - ${size}), calc(100% - ${size}) 100%, ${size} 100%, 0 calc(100% - ${size}), 0 ${size})`

  // Outer layer is the ring color, clipped to the full chamfer.
  let outerClip = $derived(chamfer(cornerSize))
  // Inner layer sits inset by borderWidth (via margin, below), so its own
  // corner cut is approximated as cornerSize minus that inset — this keeps
  // the ring a roughly even width all the way round, including the
  // diagonals, without needing a pixel-perfect mitered offset.
  let innerClip = $derived(chamfer(`calc(${cornerSize} - ${borderWidth})`))
</script>

<div class="inline-block" style:clip-path={outerClip} style:background={color}>
  <div
    style:margin={borderWidth}
    style:padding
    style:clip-path={innerClip}
    style:background
  >
    {@render children()}
  </div>
</div>
```

This replaces the single-element `border` + `clip-path` from Task 1 (which left a gap at each diagonal — see Architecture above) with two nested, independently clipped elements, so the ring is an actual filled shape rather than a border trying to trace a boundary it isn't aware of.

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Temporary manual visual check**

Temporarily add this line inside `<main>` in `src/App.svelte` (e.g. right after the opening `<main ...>` tag), with the same import as Task 1's check:

```svelte
<Frame><p class="p-4 text-white">Frame test</p></Frame>
```

```ts
import Frame from './lib/components/Frame.svelte'
```

Run `npm run dev` (or use the already-running dev server) and open the local URL. Expected: a box with "Frame test" inside it, with one continuous indigo outline around it whose four corners are visibly cut at a 45° angle — critically, **the outline must be fully connected all the way around, with no gap or break at any of the four diagonal cuts** (this is the bug this task fixes). The interior behind "Frame test" should show the dark `background` fill color, not the page's own background bleeding through.

Then revert both edits to `src/App.svelte`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Frame.svelte
git commit -m "Fix Frame outline gaps at chamfered corners with a two-layer ring"
```

---

### Task 3: Per-corner control

**Files:**
- Modify: `src/lib/components/Frame.svelte` (full rewrite of the file)

**Interfaces:**
- Consumes: nothing new.
- Produces: same component name/usage as Task 2, plus four new optional props (`topLeftCorner`, `topRightCorner`, `bottomRightCorner`, `bottomLeftCorner`). Existing callers passing only `cornerSize` continue to work unchanged — each new prop defaults to `cornerSize`.

- [ ] **Step 1: Replace the full contents of `src/lib/components/Frame.svelte`**

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    /** Any valid CSS color for the outline. */
    color?: string
    /** Any valid CSS color for the interior, behind the content. */
    background?: string
    /** Space between the content and the outline. */
    padding?: string
    /** Default size of the angled cut at each corner (CSS length). */
    cornerSize?: string
    /** Thickness of the outline. */
    borderWidth?: string
    /** Overrides `cornerSize` for just the top-left corner. Use '0' for a square (non-angled) corner. */
    topLeftCorner?: string
    /** Overrides `cornerSize` for just the top-right corner. Use '0' for a square (non-angled) corner. */
    topRightCorner?: string
    /** Overrides `cornerSize` for just the bottom-right corner. Use '0' for a square (non-angled) corner. */
    bottomRightCorner?: string
    /** Overrides `cornerSize` for just the bottom-left corner. Use '0' for a square (non-angled) corner. */
    bottomLeftCorner?: string
    children: Snippet
  }

  let {
    color = 'var(--color-indigo-400)',
    background = 'var(--color-my-blue)',
    padding = '1rem',
    cornerSize = '0.75rem',
    borderWidth = '2px',
    topLeftCorner = cornerSize,
    topRightCorner = cornerSize,
    bottomRightCorner = cornerSize,
    bottomLeftCorner = cornerSize,
    children
  }: Props = $props()

  // Builds a chamfered-octagon polygon from each corner's own cut size.
  // Percentages/calc() are relative to the element's own box, so the same
  // formula works at any size. A corner size of 0 collapses that corner's
  // two vertices onto one point — i.e. a plain square corner.
  const chamfer = (tl: string, tr: string, br: string, bl: string) =>
    `polygon(${tl} 0, calc(100% - ${tr}) 0, 100% ${tr}, 100% calc(100% - ${br}), calc(100% - ${br}) 100%, ${bl} 100%, 0 calc(100% - ${bl}), 0 ${tl})`

  // Outer layer is the ring color, clipped to the full chamfer.
  let outerClip = $derived(chamfer(topLeftCorner, topRightCorner, bottomRightCorner, bottomLeftCorner))

  // Inner layer sits inset by borderWidth (via margin, below), so each of its
  // own corner cuts is approximated as that corner's size minus the inset —
  // this keeps the ring a roughly even width all the way round, including
  // the diagonals, without needing a pixel-perfect mitered offset. Clamped
  // to 0 (via max()) so a corner already at or near 0 doesn't go negative,
  // which would self-intersect the polygon. A plain border can't do any of
  // this: it only paints axis-aligned strips along the box's straight edges
  // with no awareness of clip-path, so when a corner's cut is bigger than
  // borderWidth the diagonal passes through an area neither strip reaches,
  // leaving a gap. Two independently clipped filled layers don't have that
  // problem — the ring is a real shape, not a border trying to trace a
  // boundary it can't see.
  const inset = (size: string) => `max(0px, calc(${size} - ${borderWidth}))`
  let innerClip = $derived(
    chamfer(inset(topLeftCorner), inset(topRightCorner), inset(bottomRightCorner), inset(bottomLeftCorner))
  )
</script>

<div class="inline-block" style:clip-path={outerClip} style:background={color}>
  <div
    style:margin={borderWidth}
    style:padding
    style:clip-path={innerClip}
    style:background
  >
    {@render children()}
  </div>
</div>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Manual visual check**

Using the same temporary `App.svelte` scratch usage pattern as Tasks 1-2, try e.g.:

```svelte
<Frame topLeftCorner="0" bottomRightCorner="0"><p class="p-4 text-white">Frame test</p></Frame>
```

Expected: top-left and bottom-right corners render square (no angled cut), top-right and bottom-left still render chamfered at the default `cornerSize`, and the outline stays fully connected all the way around — including at the two square corners (no gap there either). Revert the temporary edit afterward.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Frame.svelte
git commit -m "Add per-corner control to Frame, so each corner can be square or angled independently"
```

---

### Task 4: Switch to the corner-shape CSS property via @toolwind/corner-shape

**Files:**
- Modify: `package.json` (new dependency, via `npm install`)
- Modify: `src/app.css` (add the plugin directive)
- Modify: `src/lib/components/Frame.svelte` (full rewrite of the file)

**Interfaces:**
- Consumes: the `@toolwind/corner-shape` Tailwind plugin, which must be registered in `app.css` before Frame's `corner-bevel` class has any effect.
- Produces: same component name/props as Task 3 — no prop changes, just an internal rewrite. Existing/future callers are unaffected.

- [ ] **Step 1: Install the plugin**

```bash
npm install @toolwind/corner-shape
```

- [ ] **Step 2: Register the plugin in `src/app.css`**

Add the `@plugin` line immediately after the existing `@import 'tailwindcss';` (before the `@theme` block):

```css
@import 'tailwindcss';
@plugin '@toolwind/corner-shape';

@theme {
  ...
```

- [ ] **Step 3: Replace the full contents of `src/lib/components/Frame.svelte`**

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    /** Any valid CSS color for the outline. */
    color?: string
    /** Any valid CSS color for the interior, behind the content. */
    background?: string
    /** Space between the content and the outline. */
    padding?: string
    /** Default size of the angled cut at each corner (CSS length). */
    cornerSize?: string
    /** Thickness of the outline. */
    borderWidth?: string
    /** Overrides `cornerSize` for just the top-left corner. Use '0' for a square (non-angled) corner. */
    topLeftCorner?: string
    /** Overrides `cornerSize` for just the top-right corner. Use '0' for a square (non-angled) corner. */
    topRightCorner?: string
    /** Overrides `cornerSize` for just the bottom-right corner. Use '0' for a square (non-angled) corner. */
    bottomRightCorner?: string
    /** Overrides `cornerSize` for just the bottom-left corner. Use '0' for a square (non-angled) corner. */
    bottomLeftCorner?: string
    children: Snippet
  }

  let {
    color = 'var(--color-indigo-400)',
    background = 'var(--color-my-blue)',
    padding = '1rem',
    cornerSize = '0.75rem',
    borderWidth = '2px',
    topLeftCorner = cornerSize,
    topRightCorner = cornerSize,
    bottomRightCorner = cornerSize,
    bottomLeftCorner = cornerSize,
    children
  }: Props = $props()
</script>

<!--
  `corner-shape: bevel` (from the @toolwind/corner-shape plugin, see
  app.css) reshapes how border-radius rounds each corner into a 45° cut
  instead of a curve. Each corner's own `border-*-radius` controls that
  cut's size. Because this is a real border and border-radius — not a
  clip-path layered on top of a rectangular border — the browser renders
  the border correctly along the shaped edge with no gaps at the corners.

  corner-shape is a very new CSS property: browsers that don't support it
  yet just ignore it, so the fallback is a normal rounded-corner border at
  the same radius, not a broken/square one.
-->
<div
  class="corner-bevel inline-block"
  style:padding
  style:border-width={borderWidth}
  style:border-color={color}
  style:border-style="solid"
  style:background
  style:border-top-left-radius={topLeftCorner}
  style:border-top-right-radius={topRightCorner}
  style:border-bottom-right-radius={bottomRightCorner}
  style:border-bottom-left-radius={bottomLeftCorner}
>
  {@render children()}
</div>
```

This deletes the `chamfer`/`inset` helper functions, the `outerClip`/`innerClip` `$derived` values, and the nested-div structure entirely — the corner-shape approach doesn't need any of it.

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 5: Verify the CSS actually compiled**

Confirm the dev server (or a fresh `npm run dev`) hot-reloads without error, and that the compiled CSS contains the `corner-bevel` utility — e.g. `curl -s http://localhost:<port>/src/app.css | grep corner-bevel` should find a match. This confirms the `@plugin` directive resolved correctly, independent of whether the current browser renders the bevel visually.

- [ ] **Step 6: Manual visual check**

Using the same temporary `App.svelte` scratch usage pattern as earlier tasks, confirm the frame still renders with angled corners (in a `corner-shape`-supporting browser) and no gaps, and that per-corner overrides (e.g. `topLeftCorner="0"`) still work. Revert the temporary edit afterward.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/app.css src/lib/components/Frame.svelte
git commit -m "Switch Frame to the corner-shape CSS property via @toolwind/corner-shape"
```
