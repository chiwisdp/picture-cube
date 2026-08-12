# Frame outline component

## Problem

Several places in the UI (the logo, buttons, panels) could use a consistent decorative border. Rather than repeating bracket/border markup, we want one reusable component that draws a corner-bracket ("HUD") frame around whatever content is placed inside it.

## Design

### `src/lib/components/Frame.svelte`

A wrapper component that:
- Sizes itself to its content (`display: inline-block`), not a fixed box.
- Renders its `children` snippet, padded by a `padding` prop (default `1rem`).
- Draws four open corner brackets around the padded content — each corner is a small absolutely-positioned element with only two adjacent borders (e.g. top-left corner = `border-top` + `border-left`), not a continuous border on all four sides.

**Props:**
- `color?: string` — any valid CSS color, applied to the corner brackets. Defaults to `var(--color-indigo-400)`, the same indigo accent already used for the rim glow and focus rings elsewhere in the app.
- `padding?: string` — CSS padding value between the content and the brackets. Defaults to `1rem`.
- `children: Snippet` — the wrapped content.

**Fixed, not exposed as props:** corner bracket length (`1.25rem`) and thickness (`2px`, via Tailwind's `border-*-2` utilities). These can be promoted to props later if a real use case needs to vary them.

## Out of scope

- Not wired into any existing UI (logo, "Feed the cube" button, panels) as part of this change — just the standalone component.
- No fixed-size/contain mode — content-hugging only.

## Testing

Manual verification (no test suite in this repo):
- Wrapping arbitrary content (e.g. a short line of text) in `<Frame>` in a scratch usage renders four corner brackets in the default indigo color, sized to the content plus `1rem` padding.
- Passing a `color` prop changes the bracket color; passing a `padding` prop changes the gap between content and brackets.
- `npm run check` passes.
