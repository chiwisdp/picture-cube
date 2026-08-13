<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { Motion } from 'svelte-motion';
  import AnalysisPanel from './lib/AnalysisPanel.svelte';
  import DropLayer from './lib/DropLayer.svelte';
  import ImageTray from './lib/ImageTray.svelte';
  import Scene from './lib/Scene.svelte';
  import { imageStore } from './lib/image/store.svelte';
  import LogoOverlay from './lib/LogoOverlay.svelte';
  import { fileInputAccept } from './lib/image/sniffFormat';

  let dragActive = $state(false);
  // Owned here (not DropLayer) because both DropLayer's "browse" link and the
  // 3D cube's click need to open the same hidden file picker.
  let fileInput = $state<HTMLInputElement>();

  const handleFiles = (files: File[]): void => {
    void imageStore.addFiles(files);
  };

  const handleBrowse = (): void => {
    fileInput?.click();
  };

  const handleFileInputChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files && input.files.length > 0) handleFiles(Array.from(input.files));
    // Reset so re-picking the same file fires `change` again.
    input.value = '';
  };

  const handlePrevPage = (): void => {
    imageStore.prevPage();
  };

  const handleNextPage = (): void => {
    imageStore.nextPage();
  };
</script>

<main class="relative h-screen w-screen overflow-hidden bg-my-blue text-neutral-100">
  <input
    bind:this={fileInput}
    type="file"
    multiple
    accept={fileInputAccept}
    aria-hidden="true"
    tabindex="-1"
    class="sr-only"
    onchange={handleFileInputChange}
  />

  <div class="absolute inset-0">
    <Canvas>
      <Scene {dragActive} onCubeClick={handleBrowse} />
    </Canvas>
  </div>

  <LogoOverlay />

  <DropLayer
    bind:active={dragActive}
    hasImages={imageStore.hasImages}
    onFiles={handleFiles}
    onBrowse={handleBrowse}
  />

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
