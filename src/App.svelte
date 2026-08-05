<script lang="ts">
  import { Canvas } from '@threlte/core'
  import { Motion } from 'svelte-motion'
  import AnalysisPanel from './lib/AnalysisPanel.svelte'
  import DropLayer from './lib/DropLayer.svelte'
  import ImageTray from './lib/ImageTray.svelte'
  import Scene from './lib/Scene.svelte'
  import { imageStore } from './lib/image/store.svelte'

  let dragActive = $state(false)

  const handleFiles = (files: File[]): void => {
    void imageStore.addFiles(files)
  }

  const handlePrevPage = (): void => {
    imageStore.prevPage()
  }

  const handleNextPage = (): void => {
    imageStore.nextPage()
  }
</script>

<main class="relative h-screen w-screen overflow-hidden bg-[#0f0f14] text-neutral-100">
  <div class="absolute inset-0">
    <Canvas>
      <Scene {dragActive} />
    </Canvas>
  </div>

  <Motion
    let:motion
    initial={{ opacity: 0, y: -12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.6, ease: 'easeOut' }}
  >
    <div use:motion class="pointer-events-none absolute top-0 left-0 px-8 py-6">
      <h1 class="m-0 text-2xl font-semibold tracking-tight">Picture Cube</h1>
      <p class="mt-1 text-sm text-neutral-400">
        Drop images to texture the cube &middot; click a face to analyse it
      </p>
    </div>
  </Motion>

  <DropLayer bind:active={dragActive} hasImages={imageStore.hasImages} onFiles={handleFiles} />

  {#if imageStore.pageCount > 1}
    <Motion
      let:motion
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <nav
        use:motion
        aria-label="Cube pages"
        class="absolute bottom-32 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-[#101018]/85 px-2 py-1.5 backdrop-blur-xl"
      >
        <button
          type="button"
          tabindex="0"
          aria-label="Show the previous six images"
          disabled={imageStore.page === 0}
          class="rounded-full px-3 py-1 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-neutral-50 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"
          onclick={handlePrevPage}
        >
          &larr;
        </button>
        <span class="px-2 text-xs tracking-[0.12em] text-neutral-400 uppercase tabular-nums">
          Page {imageStore.page + 1} of {imageStore.pageCount}
        </span>
        <button
          type="button"
          tabindex="0"
          aria-label="Show the next six images"
          disabled={imageStore.page >= imageStore.pageCount - 1}
          class="rounded-full px-3 py-1 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-neutral-50 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-30"
          onclick={handleNextPage}
        >
          &rarr;
        </button>
      </nav>
    </Motion>
  {/if}

  <AnalysisPanel />
  <ImageTray />
</main>
