# Frame outline component

## Problem

Several places in the UI (the logo, buttons, panels) could use a consistent decorative border. Rather than repeating border markup, we want one reusable component that draws a continuous outline with angled (chamfered) corners around whatever content is placed inside it.

## Design

### `src/lib/components/Frame.svelte`

A wrapper component that:
- Sizes itself to its content (`display: inline-block`), not a fixed box.
- Renders its `children` snippet, padded by a `padding` prop (default `1rem`).
- Draws one continuous outline around the padded content, with all four corners cut at a 45° angle instead of square or rounded, and a filled interior behind the content.

**Revision:** the first implementation used a plain CSS `border` combined with `clip-path: polygon(...)` on a single element. That doesn't work in general: `border` only paints thin strips along the box's four straight edges, with no awareness of `clip-path` — when `cornerSize` is meaningfully larger than `borderWidth` (true of the defaults), the diagonal cut passes through a region neither strip reaches, leaving a visible gap where the two straight border segments don't connect. Fixed by switching to two nested elements, each independently clipped to a chamfered-octagon `clip-path`: an outer element filled with `color` (the ring), and an inner element — inset by `borderWidth` via margin, and using a proportionally smaller `cornerSize - borderWidth` chamfer — filled with a new `background` prop and holding the actual content. The visible ring is a real filled shape, not a border trying to trace a clip boundary it can't see.

**Props:**
- `color?: string` — any valid CSS color, applied to the outline. Defaults to `var(--color-indigo-400)`, the same indigo accent already used for the rim glow and focus rings elsewhere in the app.
- `background?: string` — any valid CSS color, fills the interior behind the content. Defaults to `var(--color-my-blue)`, the app's existing dark background token. A fully see-through hole isn't achievable with this technique without much heavier CSS (SVG evenodd clip-path or a hand-built self-intersecting polygon), which isn't worth the risk/complexity for this component.
- `padding?: string` — CSS padding value between the content and the outline. Defaults to `1rem`.
- `cornerSize?: string` — default size of the angled cut at each corner (CSS length). Defaults to `0.75rem`.
- `topLeftCorner? / topRightCorner? / bottomRightCorner? / bottomLeftCorner?: string` — per-corner override of `cornerSize`. Each defaults to `cornerSize`; passing `'0'` makes that specific corner square instead of angled, and any other length gives that corner its own chamfer size independent of the rest.
- `borderWidth?: string` — thickness of the outline. Defaults to `2px`.
- `children: Snippet` — the wrapped content.

**Known quirk:** the inner chamfer is approximated as `cornerSize - borderWidth` (a direct absolute-unit reduction) rather than a precise mitered offset, so the ring can render very slightly thicker along the diagonal than along the straight edges. Accepted as-is — it fully connects (the actual bug), and the remaining unevenness is subtle at the default sizes.

## Out of scope

- Not wired into any existing UI (logo, "Feed the cube" button, panels) as part of this change — just the standalone component.
- No fixed-size/contain mode — content-hugging only.
- No pixel-perfect mitered border at the cut corners (see the known quirk above).
- No true transparent-hole interior — the `background` prop fills it instead (see Props above).

## Testing

Manual verification (no test suite in this repo):
- Wrapping arbitrary content (e.g. a short line of text) in `<Frame>` in a scratch usage renders one continuous, fully connected outline with all four corners visibly cut at an angle (no gaps at the diagonals), in the default indigo color, over the default dark interior fill, sized to the content plus `1rem` padding.
- Passing `color` changes the outline color; `background` changes the interior fill; `padding` changes the gap between content and the outline; `cornerSize` changes how big the angled cut is; `borderWidth` changes the outline's thickness.
- Setting one of `topLeftCorner`/`topRightCorner`/`bottomRightCorner`/`bottomLeftCorner` to `'0'` makes just that corner square while the other three stay chamfered at `cornerSize`, with no gap at that corner either.
- `npm run check` passes.
