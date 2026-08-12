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
