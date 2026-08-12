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
