# Frame Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `Frame.svelte` component that draws a continuous outline with angled (chamfered) corners around whatever content is placed inside it.

**Architecture:** A single new Svelte component, content-sized, with no dependency on any existing component and no changes to any existing file.

**Revision (Task 2):** Task 1's single-`<div>` `border` + `clip-path` technique shipped with a real bug — `border` only paints thin strips along the box's straight edges, with no awareness of `clip-path`, so the diagonal cut left a visible gap where the two straight border segments didn't connect (found via manual visual testing after Task 1). Task 2 replaces it with two nested elements, each independently clipped to a chamfered-octagon `clip-path`: an outer element filled with `color` (the ring), and an inner element — inset by `borderWidth` via margin, with a proportionally smaller `cornerSize - borderWidth` chamfer — filled with a new `background` prop and holding the content.

**Tech Stack:** Svelte 5 (runes, snippets, `$derived`), inline `style:` directives for the caller-controlled color/padding/size values (Tailwind can't generate classes from runtime prop values). No test runner in this repo — verification is `npm run check` plus a temporary manual visual check via `npm run dev`.

## Global Constraints

- New file only: `src/lib/components/Frame.svelte`. No existing file is modified as part of this plan (any temporary visual-check edit to `App.svelte` must be reverted before committing).
- Props (final, after Task 2): `color?: string` (default `'var(--color-indigo-400)'`), `background?: string` (default `'var(--color-my-blue)'`), `padding?: string` (default `'1rem'`), `cornerSize?: string` (default `'0.75rem'`), `borderWidth?: string` (default `'2px'`), `children: Snippet`.
- Component sizes itself to its content (`inline-block`), not a fixed box.
- The outline must be a single continuous, fully connected ring (no gaps at the diagonal cuts) with all four corners cut at a 45° angle by `cornerSize`. A very slight extra thickness at the diagonal cuts (from approximating the inner chamfer as `cornerSize - borderWidth` rather than a precise miter) is accepted — no pixel-perfect miter required.

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
