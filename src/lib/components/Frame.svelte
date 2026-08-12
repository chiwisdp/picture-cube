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
