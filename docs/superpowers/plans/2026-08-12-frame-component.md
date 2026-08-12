# Frame Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `Frame.svelte` component that draws a continuous outline with angled (chamfered) corners around whatever content is placed inside it.

**Architecture:** A single new Svelte component, content-sized, with no dependency on any existing component and no changes to any existing file. It's a single `<div>` with a solid CSS `border` and a `clip-path: polygon(...)` that cuts all four corners at 45°, sized by a `cornerSize` prop.

**Tech Stack:** Svelte 5 (runes, snippets, `$derived`), inline `style:` directives for the caller-controlled color/padding/size values (Tailwind can't generate classes from runtime prop values). No test runner in this repo — verification is `npm run check` plus a temporary manual visual check via `npm run dev`.

## Global Constraints

- New file only: `src/lib/components/Frame.svelte`. No existing file is modified as part of this plan (the temporary visual-check edit to `App.svelte` in Task 1 Step 3 must be reverted before committing).
- Props: `color?: string` (default `'var(--color-indigo-400)'`), `padding?: string` (default `'1rem'`), `cornerSize?: string` (default `'0.75rem'`), `borderWidth?: string` (default `'2px'`), `children: Snippet`.
- Component sizes itself to its content (`inline-block`), not a fixed box.
- The border is a single continuous outline (not separate corner pieces) with all four corners cut at a 45° angle by `cornerSize`. A very slight extra thickness at the diagonal cuts (a known `clip-path`-on-a-bordered-box quirk) is accepted — no double-layered miter.

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
