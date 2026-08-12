# Frame Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable `Frame.svelte` component that draws a corner-bracket outline around whatever content is placed inside it.

**Architecture:** A single new Svelte component, content-sized, with no dependency on any existing component and no changes to any existing file. It renders its `children` snippet plus four absolutely-positioned `<span>` corner brackets (two adjacent borders each) inside a `position: relative` wrapper.

**Tech Stack:** Svelte 5 (runes, snippets), Tailwind v4 utility classes for border width, inline `style:` directives for the caller-controlled color/padding/size values Tailwind can't generate at runtime. No test runner in this repo — verification is `npm run check` plus a temporary manual visual check via `npm run dev`.

## Global Constraints

- New file only: `src/lib/components/Frame.svelte`. No existing file is modified as part of this plan.
- Props: `color?: string` (default `'var(--color-indigo-400)'`), `padding?: string` (default `'1rem'`), `children: Snippet`.
- Corner bracket length is fixed at `1.25rem`, thickness fixed at `2px` (via Tailwind's `border-*-2` utilities) — not exposed as props.
- Component sizes itself to its content (`inline-block`), not a fixed box.

---

### Task 1: Create the Frame component

**Files:**
- Create: `src/lib/components/Frame.svelte`

**Interfaces:**
- Consumes: nothing from elsewhere in the codebase.
- Produces: a default-exported Svelte component usable as `<Frame color="..." padding="...">...</Frame>`, for any future caller to import from `./lib/components/Frame.svelte`.

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    /** Any valid CSS color for the corner brackets. */
    color?: string
    /** Space between the content and the corner brackets. */
    padding?: string
    children: Snippet
  }

  let { color = 'var(--color-indigo-400)', padding = '1rem', children }: Props = $props()

  // Fixed corner size — promote to a prop later if a real use case needs to vary it.
  const CORNER_LENGTH = '1.25rem'
</script>

<div class="relative inline-block" style:padding>
  {@render children()}

  <span
    class="pointer-events-none absolute top-0 left-0 border-t-2 border-l-2"
    style:width={CORNER_LENGTH}
    style:height={CORNER_LENGTH}
    style:border-color={color}
  ></span>
  <span
    class="pointer-events-none absolute top-0 right-0 border-t-2 border-r-2"
    style:width={CORNER_LENGTH}
    style:height={CORNER_LENGTH}
    style:border-color={color}
  ></span>
  <span
    class="pointer-events-none absolute bottom-0 left-0 border-b-2 border-l-2"
    style:width={CORNER_LENGTH}
    style:height={CORNER_LENGTH}
    style:border-color={color}
  ></span>
  <span
    class="pointer-events-none absolute bottom-0 right-0 border-b-2 border-r-2"
    style:width={CORNER_LENGTH}
    style:height={CORNER_LENGTH}
    style:border-color={color}
  ></span>
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

Run `npm run dev` (or use the already-running dev server) and open the local URL. Expected: a box with "Frame test" inside it, with four indigo corner brackets (top-left, top-right, bottom-left, bottom-right) around it — no continuous border on the sides, just the four corners.

Then revert both edits to `src/App.svelte` (the import and the temporary `<Frame>` usage) — this plan only adds the standalone component, not any wiring into the app.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Frame.svelte
git commit -m "Add reusable corner-bracket Frame component"
```
