<script lang="ts">
  import { Motion } from 'svelte-motion'
  import { blink } from './motion/presets';// my animations
  type Props = {
    /** True while a file drag is over the window. Bindable so the cube can react. */
    active?: boolean
    /** Hides the empty-state hint once the queue has something in it. */
    hasImages?: boolean
    onFiles: (files: File[]) => void
    /** Opens the shared file picker (owned by App.svelte, since the cube triggers it too). */
    onBrowse: () => void
  }

  let { active = $bindable(false), hasImages = false, onFiles, onBrowse }: Props = $props()

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

<Motion
  let:motion
  initial={{ opacity: 0 }}
  animate={{ opacity: active ? 1 : 0 }}
  transition={{ duration: 0.18, ease: 'easeOut' }}
>
  <div
    use:motion
    aria-hidden={!active}
    class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-abyss/70 p-6 backdrop-blur-[2px]"
  >
    <div
      class="flex h-full w-full items-center justify-center rounded-3xl border-2 border-dashed border-indigo-400/70"
    >
      <p class="text-lg font-medium tracking-tight text-indigo-100">Drop to add to the cube</p>
    </div>
  </div>
</Motion>


<!-- this is the text  at bottom of the screen use blink-->
{#if !hasImages}
  <Motion
    let:motion {...blink}
  >
    <div
      use:motion
      class="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex flex-col items-center gap-2 text-center"
    >
    <p class="text-4xl font-headers text-white tracking-widest">[ FEED ME ]</p>
      <p class="text-xs font-body text-white tracking-widest mt-8">
       (+) Feed the cube images, paste, drag/drop,or
        <button
          type="button"
          tabindex="0"
          aria-label="Browse for images"
          class="pointer-events-auto rounded-sm text-my-red underline  underline-offset-4 transition hover:text-indigo-200 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
          onclick={onBrowse}
        >
          browse
        </button>
        (+)
      </p>
      
    </div>
  </Motion>
{/if}
