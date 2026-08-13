<script lang="ts">
  import { Motion } from 'svelte-motion';
  import type { DroppedImage } from './image/store.svelte';
  import { FACES_PER_PAGE, imageStatusLabels, imageStore } from './image/store.svelte';

  const statusDotClasses: Record<DroppedImage['status'], string> = {
    decoding: 'bg-amber-400',
    queued: 'bg-neutral-500',
    analyzing: 'bg-indigo-400 animate-pulse',
    done: 'bg-emerald-400',
    error: 'bg-rose-500',
  };

  let itemElements = $state<Record<string, HTMLButtonElement | undefined>>({});

  /** The failure reason is part of the label, so a screen reader hears why. */
  const describeItem = (image: DroppedImage, index: number): string => {
    const base = `${image.fileName}, image ${index + 1} of ${imageStore.images.length}, ${imageStatusLabels[image.status]}`;
    return image.error ? `${base}. ${image.error}` : base;
  };

  const handleSelect = (id: string): void => {
    imageStore.select(id);
  };

  const handleRemove = (event: MouseEvent, id: string): void => {
    event.stopPropagation();
    imageStore.remove(id);
  };

  const handleClearAll = (): void => {
    imageStore.clear();
  };

  // Keeps the selected thumbnail in view when the selection came from the cube.
  $effect(() => {
    const id = imageStore.selectedId;
    if (!id) return;
    itemElements[id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  });
</script>

{#if imageStore.hasImages}
  <Motion
    let:motion
    initial={{ opacity: 0, y: 40 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.45, ease: 'easeOut' }}
  >
    <section
      use:motion
      aria-label="Dropped images"
      class="absolute inset-x-0 bottom-0 z-30 flex h-28 items-stretch gap-4 border-t border-white/10 bg-[#0f0f14]/85 px-5 py-3 backdrop-blur-xl"
    >
      <div class="flex shrink-0 flex-col justify-center gap-0.5 pr-4">
        <p class="text-xs font-semibold tracking-[0.14em] text-neutral-400 uppercase">
          {imageStore.images.length}
          {imageStore.images.length === 1 ? 'image' : 'images'}
        </p>
        {#if imageStore.pendingCount > 0}
          <p class="text-xs text-indigo-300">{imageStore.pendingCount} in the analysis queue</p>
        {:else}
          <p class="text-xs text-neutral-500">Queue idle</p>
        {/if}
        <button
          type="button"
          tabindex="0"
          aria-label="Remove every image from the queue"
          class="mt-0.5 w-fit rounded-sm text-xs text-neutral-500 underline decoration-dotted underline-offset-4 transition hover:text-rose-300 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
          onclick={handleClearAll}
        >
          Clear all
        </button>
      </div>

      <ul class="flex flex-1 items-center gap-2 overflow-x-auto overflow-y-hidden pb-1">
        {#each imageStore.images as image, index (image.id)}
          {@const isSelected = imageStore.selectedId === image.id}

          {#if index % FACES_PER_PAGE === 0}
            <li class="flex h-full shrink-0 items-center gap-2 pr-1 pl-2" aria-hidden="true">
              <span class="h-12 w-px bg-white/10"></span>
              <span class="text-[10px] font-semibold tracking-[0.16em] text-neutral-600 uppercase">
                p{index / FACES_PER_PAGE + 1}
              </span>
            </li>
          {/if}

          <li class="shrink-0">
            <button
              bind:this={itemElements[image.id]}
              type="button"
              tabindex="0"
              aria-label={describeItem(image, index)}
              title={image.error ?? image.fileName}
              aria-current={isSelected}
              class={[
                'group relative flex w-18 flex-col gap-1 rounded-lg border p-1 text-left transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none',
                isSelected
                  ? 'border-indigo-400/80 bg-indigo-500/10'
                  : 'border-white/10 hover:border-white/25',
              ]}
              onclick={() => handleSelect(image.id)}
            >
              <span
                class="relative flex h-12 w-full items-center justify-center overflow-hidden rounded-md bg-[#1a1a24]"
              >
                {#if image.displayUrl}
                  <img
                    src={image.displayUrl}
                    alt=""
                    class="h-full w-full object-cover transition group-hover:scale-105"
                  />
                {:else if image.status === 'error'}
                  <span class="text-sm font-bold text-rose-400" aria-hidden="true">!</span>
                {:else}
                  <span
                    class="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400"
                    aria-hidden="true"
                  ></span>
                {/if}
                <span
                  class={[
                    'absolute top-1 right-1 h-1.5 w-1.5 rounded-full',
                    statusDotClasses[image.status],
                  ]}
                  aria-hidden="true"
                ></span>
              </span>
              <span class="block truncate text-[10px] text-neutral-400">{image.fileName}</span>
            </button>

            <button
              type="button"
              tabindex="0"
              aria-label={`Remove ${image.fileName}`}
              class="mt-0.5 block w-full rounded-sm text-center text-[10px] text-neutral-600 transition hover:text-rose-300 focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:outline-none"
              onclick={(event) => handleRemove(event, image.id)}
            >
              remove
            </button>
          </li>
        {/each}
      </ul>
    </section>
  </Motion>
{/if}
