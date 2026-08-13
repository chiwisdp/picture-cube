<script lang="ts">
  import { untrack } from 'svelte';
  import type { WebRole } from './analysis/webRoles';
  import type { CropFocalPoint, RoleCrop } from './image/cropForRole';
  import {
    DEFAULT_CROP_QUALITY,
    cropForRole,
    releaseRoleCrop,
    roleCropFileName,
  } from './image/cropForRole';
  import type { EncodeSupport } from './image/encodeSupport';
  import { getEncodeSupport } from './image/encodeSupport';
  import { formatFileSize } from './image/extractMetadata';

  type Props = {
    bitmap: ImageBitmap;
    /** Re-encoded thumbnail of the source, for the crop-rect overlay. */
    sourceUrl: string | null;
    sourceName: string;
    role: WebRole;
    focalPoint: CropFocalPoint;
    /** From `ImageMetadata.hasTransparency`; forces a format that keeps alpha. */
    hasAlpha: boolean;
  };

  let { bitmap, sourceUrl, sourceName, role, focalPoint, hasAlpha }: Props = $props();

  /** Long enough that dragging the quality slider does not re-encode per step. */
  const REENCODE_DEBOUNCE_MS = 140;

  let crop = $state<RoleCrop | null>(null);
  let quality = $state(DEFAULT_CROP_QUALITY);
  let allowUpscale = $state(false);
  let generating = $state(true);
  let failure = $state<string | null>(null);
  let encodeSupport = $state<EncodeSupport | null>(null);

  /** Every crop mints an object URL, so the outgoing one has to be revoked. */
  const replaceCrop = (next: RoleCrop | null): void => {
    const previous = untrack(() => crop);
    if (previous) releaseRoleCrop(previous);
    crop = next;
  };

  let weightPercent = $derived(
    crop ? Math.min(100, Math.round((crop.bytes / (crop.maxWeightKb * 1024)) * 100)) : 0,
  );

  let overlayRect = $derived.by(() => {
    if (!crop) return null;
    const { cropRect } = crop;
    return {
      left: `${(cropRect.x / bitmap.width) * 100}%`,
      top: `${(cropRect.y / bitmap.height) * 100}%`,
      width: `${(cropRect.width / bitmap.width) * 100}%`,
      height: `${(cropRect.height / bitmap.height) * 100}%`,
    };
  });

  let formatNote = $derived.by(() => {
    if (!crop || crop.format === role.preferredFormat) return null;

    const target = role.preferredFormat.toUpperCase();
    const actual = crop.format.toUpperCase();
    if (hasAlpha && role.preferredFormat === 'jpeg') {
      return `Exported as ${actual} instead of ${target} so the transparency survives.`;
    }
    if (encodeSupport && !encodeSupport[role.preferredFormat]) {
      return `This browser cannot encode ${target}, so the crop ships as ${actual}.`;
    }
    return `Exported as ${actual} rather than ${target}.`;
  });

  const handleQualityInput = (event: Event): void => {
    quality = Number((event.currentTarget as HTMLInputElement).value);
  };

  const handleUpscaleToggle = (event: Event): void => {
    allowUpscale = (event.currentTarget as HTMLInputElement).checked;
  };

  $effect(() => {
    void getEncodeSupport().then((support) => {
      encodeSupport = support;
    });
  });

  $effect(() => {
    const request = {
      bitmap,
      role,
      point: { x: focalPoint.x, y: focalPoint.y },
      quality,
      hasAlpha,
      allowUpscale,
    };

    let cancelled = false;
    generating = true;

    const timer = setTimeout(() => {
      void cropForRole(request.bitmap, request.role, request.point, {
        quality: request.quality,
        hasAlpha: request.hasAlpha,
        allowUpscale: request.allowUpscale,
      })
        .then((next) => {
          if (cancelled) {
            releaseRoleCrop(next);
            return;
          }
          replaceCrop(next);
          failure = null;
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          failure = error instanceof Error ? error.message : 'The crop could not be generated.';
        })
        .finally(() => {
          if (!cancelled) generating = false;
        });
    }, REENCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  });

  $effect(() => () => {
    const last = untrack(() => crop);
    if (last) releaseRoleCrop(last);
  });
</script>

<div class="mt-3 space-y-3 rounded-xl border border-white/10 bg-[#12121a] p-3">
  <div class="grid grid-cols-2 gap-3">
    <figure class="space-y-1.5">
      <figcaption class="text-[10px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
        Source &middot; crop area
      </figcaption>
      <div class="relative overflow-hidden rounded-lg bg-[#1a1a24]">
        {#if sourceUrl}
          <img src={sourceUrl} alt="" class="block w-full" />
        {:else}
          <div class="aspect-video w-full"></div>
        {/if}
        {#if overlayRect}
          <div
            class="pointer-events-none absolute rounded-xs border-2 border-indigo-400"
            style:left={overlayRect.left}
            style:top={overlayRect.top}
            style:width={overlayRect.width}
            style:height={overlayRect.height}
            style:box-shadow="0 0 0 9999px rgba(10, 10, 16, 0.62)"
          ></div>
        {/if}
      </div>
    </figure>

    <figure class="space-y-1.5">
      <figcaption class="text-[10px] font-semibold tracking-[0.16em] text-neutral-500 uppercase">
        Generated crop
      </figcaption>
      <div
        class="relative flex min-h-18 items-center justify-center overflow-hidden rounded-lg bg-[#1a1a24]"
      >
        {#if crop}
          <img src={crop.url} alt={`${role.label} crop of ${sourceName}`} class="block w-full" />
        {/if}
        {#if generating}
          <span
            class="absolute h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-indigo-400"
            aria-hidden="true"
          ></span>
        {/if}
      </div>
    </figure>
  </div>

  {#if failure}
    <p class="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300" role="alert">{failure}</p>
  {/if}

  {#if crop}
    <dl class="grid grid-cols-3 gap-2 text-xs">
      <div>
        <dt class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">Output</dt>
        <dd class="mt-0.5 font-medium text-neutral-100">{crop.width} &times; {crop.height}</dd>
      </div>
      <div>
        <dt class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">Format</dt>
        <dd class="mt-0.5 font-medium text-neutral-100 uppercase">{crop.format}</dd>
      </div>
      <div>
        <dt class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">Weight</dt>
        <dd
          class={[
            'mt-0.5 font-medium',
            crop.withinWeightBudget ? 'text-emerald-300' : 'text-amber-300',
          ]}
        >
          {formatFileSize(crop.bytes)}
        </dd>
      </div>
    </dl>

    <div class="space-y-1">
      <div class="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          class={[
            'h-full rounded-full',
            crop.withinWeightBudget ? 'bg-emerald-400' : 'bg-amber-400',
          ]}
          style:width={`${weightPercent}%`}
        ></div>
      </div>
      <p class="text-[11px] text-neutral-500">
        {weightPercent}% of the {crop.maxWeightKb} KB budget for this slot
      </p>
    </div>

    {#if formatNote}
      <p class="text-[11px] text-neutral-400">{formatNote}</p>
    {/if}

    {#if crop.upscaleNeeded}
      <p class="rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
        The source only offers {crop.cropRect.width} &times; {crop.cropRect.height} px at this ratio,
        below the {role.width} &times; {role.height} px target. The crop is left at its true size rather
        than upscaled.
      </p>
    {/if}
  {/if}

  <div class="space-y-2 border-t border-white/10 pt-3">
    <label class="flex items-center gap-3 text-xs text-neutral-400">
      <span class="w-14 shrink-0">Quality</span>
      <input
        type="range"
        min="0.4"
        max="1"
        step="0.05"
        value={quality}
        disabled={crop?.format === 'png'}
        aria-label={`Encoder quality for the ${role.label} crop`}
        class="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        oninput={handleQualityInput}
      />
      <span class="w-8 shrink-0 text-right text-neutral-200 tabular-nums">
        {Math.round(quality * 100)}
      </span>
    </label>

    {#if crop?.format === 'png'}
      <p class="text-[11px] text-neutral-500">PNG is lossless, so quality has no effect here.</p>
    {/if}

    <label class="flex items-center gap-2 text-xs text-neutral-400">
      <input
        type="checkbox"
        checked={allowUpscale}
        aria-label={`Upscale the ${role.label} crop to the full target size`}
        class="h-3.5 w-3.5 rounded-sm accent-indigo-400"
        onchange={handleUpscaleToggle}
      />
      Upscale to the full {role.width} &times; {role.height} target
    </label>
  </div>

  {#if crop}
    <a
      href={crop.url}
      download={roleCropFileName(role, crop, sourceName)}
      tabindex="0"
      aria-label={`Download the ${role.label} crop`}
      class="block rounded-lg bg-indigo-500 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none"
    >
      Download {roleCropFileName(role, crop, sourceName)}
    </a>
  {/if}
</div>
