# Frame outline component

## Problem

Several places in the UI (the logo, buttons, panels) could use a consistent decorative border. Rather than repeating border markup, we want one reusable component that draws a continuous outline with angled (chamfered) corners around whatever content is placed inside it.

## Design

### `src/lib/components/Frame.svelte`

A wrapper component that:
- Sizes itself to its content (`display: inline-block`), not a fixed box.
- Renders its `children` snippet, padded by a `padding` prop (default `1rem`).
- Draws one continuous outline around the padded content, with all four corners cut at a 45° angle instead of square or rounded. Implemented as a solid CSS `border` combined with a `clip-path: polygon(...)` that chamfers the corners — the polygon is built from the `cornerSize` prop via `calc()`, so it works at any element size.

**Props:**
- `color?: string` — any valid CSS color, applied to the outline. Defaults to `var(--color-indigo-400)`, the same indigo accent already used for the rim glow and focus rings elsewhere in the app.
- `padding?: string` — CSS padding value between the content and the outline. Defaults to `1rem`.
- `cornerSize?: string` — size of the angled cut at each corner (CSS length). Defaults to `0.75rem`.
- `borderWidth?: string` — thickness of the outline. Defaults to `2px`.
- `children: Snippet` — the wrapped content.

**Known quirk:** `clip-path` clips a rectangular border, so the line at each diagonal cut can render very slightly thicker than on the straight edges — a known limitation of this single-element technique versus a pixel-perfect double-layered miter. Accepted as-is; not worth the added complexity unless it's visibly a problem at actual use sizes.

## Out of scope

- Not wired into any existing UI (logo, "Feed the cube" button, panels) as part of this change — just the standalone component.
- No fixed-size/contain mode — content-hugging only.
- No pixel-perfect mitered border at the cut corners (see the known quirk above) — a single bordered, clipped element is enough for this component's purpose.

## Testing

Manual verification (no test suite in this repo):
- Wrapping arbitrary content (e.g. a short line of text) in `<Frame>` in a scratch usage renders one continuous outline with all four corners visibly cut at an angle, in the default indigo color, sized to the content plus `1rem` padding.
- Passing a `color` prop changes the outline color; `padding` changes the gap between content and the outline; `cornerSize` changes how big the angled cut is; `borderWidth` changes the outline's thickness.
- `npm run check` passes.
