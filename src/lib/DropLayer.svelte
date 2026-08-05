<script lang="ts">
  import { Motion } from 'svelte-motion'
  import { fileInputAccept } from './image/sniffFormat'

  type Props = {
    /** True while a file drag is over the window. Bindable so the cube can react. */
    active?: boolean
    /** Hides the empty-state hint once the queue has something in it. */
    hasImages?: boolean
    onFiles: (files: File[]) => void
  }

  let { active = $bindable(false), hasImages = false, onFiles }: Props = $props()

  let fileInput = $state<HTMLInputElement>()

  /**
   * `dragleave` fires every time the pointer crosses a child element, so the
   * overlay is driven by a depth counter rather than the raw events.
   */
  let dragDepth = 0

  const carriesFiles = (transfer: DataTransfer | null): boolean =>
    transfer ? Array.from(transfer.types).includes('Files') : false

  const emitFiles = (list: FileList | null | undefined): void => {
    if (!list || list.length === 0) return
    onFiles(Array.from(list))
  }

  const handleDragEnter = (event: DragEvent): void => {
    if (!carriesFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepth += 1
    active = true
  }

  const handleDragOver = (event: DragEvent): void => {
    if (!carriesFiles(event.dataTransfer)) return
    // Without this the browser refuses the drop and opens the file instead.
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (event: DragEvent): void => {
    if (!carriesFiles(event.dataTransfer)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) active = false
  }

  const handleDrop = (event: DragEvent): void => {
    if (!carriesFiles(event.dataTransfer)) return
    event.preventDefault()
    dragDepth = 0
    active = false
    emitFiles(event.dataTransfer?.files)
  }

  /** A drag abandoned outside the window never sends a matching `dragleave`. */
  const handleDragEnd = (): void => {
    dragDepth = 0
    active = false
  }

  const handlePaste = (event: ClipboardEvent): void => {
    emitFiles(event.clipboardData?.files)
  }

  const handleBrowse = (): void => {
    fileInput?.click()
  }

  const handleInputChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement
    emitFiles(input.files)
    // Reset so re-picking the same file fires `change` again.
    input.value = ''
  }
</script>

<svelte:window
  ondragenter={handleDragEnter}
  ondragover={handleDragOver}
  ondragleave={handleDragLeave}
  ondrop={handleDrop}
  ondragend={handleDragEnd}
  onblur={handleDragEnd}
  onpaste={handlePaste}
/>

<input
  bind:this={fileInput}
  type="file"
  multiple
  accept={fileInputAccept}
  aria-hidden="true"
  tabindex="-1"
  class="sr-only"
  onchange={handleInputChange}
/>

<Motion
  let:motion
  initial={{ opacity: 0 }}
  animate={{ opacity: active ? 1 : 0 }}
  transition={{ duration: 0.18, ease: 'easeOut' }}
>
  <div
    use:motion
    aria-hidden={!active}
    class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0f0f14]/70 p-6 backdrop-blur-[2px]"
  >
    <div
      class="flex h-full w-full items-center justify-center rounded-3xl border-2 border-dashed border-indigo-400/70"
    >
      <p class="text-lg font-medium tracking-tight text-indigo-100">Drop to add to the cube</p>
    </div>
  </div>
</Motion>

<!-- Anchored under the title, clear of the analysis panel on the right. -->
<div class="absolute top-28 left-8 z-30">
  <button
    type="button"
    tabindex="0"
    aria-label="Add images from your computer"
    class="rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-medium text-neutral-100 shadow-lg shadow-black/30 backdrop-blur transition hover:border-indigo-400/60 hover:bg-indigo-500/20 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
    onclick={handleBrowse}
  >
    Add images
  </button>
</div>

{#if !hasImages}
  <Motion
    let:motion
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
  >
    <div
      use:motion
      class="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-2 text-center"
    >
      <p class="text-sm font-medium text-neutral-300">
        Drop images anywhere, paste from the clipboard, or
        <button
          type="button"
          tabindex="0"
          aria-label="Browse for images"
          class="pointer-events-auto rounded-sm text-indigo-300 underline decoration-dotted underline-offset-4 transition hover:text-indigo-200 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
          onclick={handleBrowse}
        >
          browse
        </button>
      </p>
      <p class="text-xs text-neutral-500">
        JPEG, PNG, GIF, WebP, AVIF, BMP, ICO, TIFF and SVG
      </p>
    </div>
  </Motion>
{/if}
