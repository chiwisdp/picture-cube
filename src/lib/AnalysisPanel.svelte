<script lang="ts">
  import { Motion } from 'svelte-motion';
  import type { RoleFit, TechnicalIssue } from './analysis/schema';
  import type { WebRole } from './analysis/webRoles';
  import { getWebRole, webRoleList } from './analysis/webRoles';
  import type { DroppedImage } from './image/store.svelte';
  import { imageStatusLabels, imageStore } from './image/store.svelte';
  import type { ExifSummary, ImageMetadata } from './image/extractMetadata';
  import { sourceFormatLabels } from './image/sniffFormat';
  import { DEFAULT_FOCAL_POINT } from './image/cropForRole';
  import RolePreview from './RolePreview.svelte';

  type PanelTab = 'metadata' | 'uses' | 'edits';

  type DetailRow = { label: string; value: string };

  /** One row of the Uses tab. `fit` is null when no analysis has scored it. */
  type RoleEntry = { role: WebRole; fit: RoleFit | null };

  const tabs: readonly { id: PanelTab; label: string }[] = [
    { id: 'metadata', label: 'Metadata' },
    { id: 'uses', label: 'Uses' },
    { id: 'edits', label: 'Edits' },
  ];

  const severityClasses: Record<TechnicalIssue['severity'], string> = {
    low: 'border-neutral-500/40 bg-neutral-500/10 text-neutral-300',
    medium: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    high: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  };

  const statusClasses: Record<DroppedImage['status'], string> = {
    decoding: 'border-amber-400/40 bg-amber-400/10 text-amber-200',
    queued: 'border-white/15 bg-white/5 text-neutral-300',
    analyzing: 'border-indigo-400/40 bg-indigo-400/10 text-indigo-200',
    done: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200',
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
  };

  const fitBarClasses = (score: number): string => {
    if (score >= 70) return 'bg-emerald-400';
    if (score >= 40) return 'bg-amber-400';
    return 'bg-rose-500';
  };

  const buildMetadataRows = (metadata: ImageMetadata): DetailRow[] => {
    const rows: DetailRow[] = [
      { label: 'Format', value: metadata.sourceFormatLabel },
      { label: 'Dimensions', value: `${metadata.width} × ${metadata.height} px` },
      { label: 'Ratio', value: metadata.aspectRatioLabel },
      { label: 'Closest named', value: metadata.closestNamedRatio },
      { label: 'Orientation', value: metadata.orientationClass },
      { label: 'File size', value: metadata.fileSizeLabel },
    ];

    if (metadata.megapixels !== null) {
      rows.push({ label: 'Megapixels', value: `${metadata.megapixels} MP` });
    }
    if (metadata.bytesPerPixel !== null) {
      rows.push({ label: 'Bytes / pixel', value: metadata.bytesPerPixel.toFixed(3) });
    }
    if (metadata.dpi) {
      rows.push({
        label: 'Resolution',
        value: `${metadata.dpi.x} × ${metadata.dpi.y} DPI (${metadata.dpi.source})`,
      });
    }

    rows.push({
      label: 'Transparency',
      value: metadata.hasTransparency
        ? `${Math.round(metadata.transparentPixelRatio * 100)}% of pixels`
        : metadata.supportsAlphaChannel
          ? 'None used'
          : 'Not supported',
    });
    rows.push({
      label: 'Avg luminance',
      value: `${Math.round(metadata.averageLuminance * 100)}%`,
    });
    rows.push({ label: 'Decoded via', value: metadata.decodedVia });

    return rows;
  };

  const buildExifRows = (exif: ExifSummary): DetailRow[] => {
    const candidates: DetailRow[] = [
      { label: 'Camera', value: [exif.make, exif.model].filter(Boolean).join(' ') },
      { label: 'Lens', value: exif.lens ?? '' },
      { label: 'ISO', value: exif.iso === null ? '' : String(exif.iso) },
      { label: 'Aperture', value: exif.fNumber === null ? '' : `f/${exif.fNumber}` },
      { label: 'Shutter', value: exif.exposureTime ?? '' },
      { label: 'Focal length', value: exif.focalLength === null ? '' : `${exif.focalLength} mm` },
      { label: 'Taken', value: exif.dateTaken ? exif.dateTaken.slice(0, 10) : '' },
      { label: 'Software', value: exif.software ?? '' },
      { label: 'Colour space', value: exif.colorSpace ?? '' },
      { label: 'Artist', value: exif.artist ?? '' },
      { label: 'Copyright', value: exif.copyright ?? '' },
      { label: 'Keywords', value: exif.keywords.join(', ') },
      { label: 'GPS', value: exif.hasGpsCoordinates ? 'Coordinates embedded' : '' },
    ];

    return candidates.filter((row) => row.value.trim().length > 0);
  };

  const sortByFit = (fits: readonly RoleFit[]): RoleFit[] =>
    [...fits].sort((a, b) => b.fitScore - a.fitScore);

  let tab = $state<PanelTab>('metadata');
  let expandedRoleId = $state<string | null>(null);
  let altTextCopied = $state(false);
  let lastImage = $state<DroppedImage | null>(null);

  // Held through the slide-out so the panel is not empty while it animates away.
  $effect(() => {
    const current = imageStore.selected;
    if (current) {
      lastImage = current;
      return;
    }
    const previous = lastImage;
    if (previous && !imageStore.images.some((image) => image.id === previous.id)) {
      lastImage = null;
    }
  });

  $effect(() => {
    void imageStore.selectedId;
    expandedRoleId = null;
    altTextCopied = false;
  });

  let isOpen = $derived(imageStore.selected !== null);
  let image = $derived(imageStore.selected ?? lastImage);
  let analysis = $derived(image?.analysis ?? null);
  let isPending = $derived(image !== null && analysis === null && image.status !== 'error');
  /**
   * Every role is listed either way. Cropping only needs a focal point, and
   * there is a sensible default for that, so the crop tools stay available
   * when analysis is unavailable — which is the whole experience when no
   * OPENROUTER_API_KEY is configured.
   */
  let roleEntries = $derived.by<RoleEntry[]>(() => {
    if (!analysis) return webRoleList.map((role) => ({ role, fit: null }));
    return sortByFit(analysis.roleFits).map((fit) => ({ role: getWebRole(fit.roleId), fit }));
  });

  let focalPoint = $derived(analysis?.focalPoint ?? DEFAULT_FOCAL_POINT);

  const handleClose = (): void => {
    imageStore.deselect();
  };

  const handleTab = (next: PanelTab): void => {
    tab = next;
  };

  const handleToggleRole = (roleId: string): void => {
    expandedRoleId = expandedRoleId === roleId ? null : roleId;
  };

  const handleRetry = (): void => {
    if (!image) return;
    imageStore.retryAnalysis(image.id);
  };

  const handleCopyAltText = async (): Promise<void> => {
    const text = analysis?.accessibility.suggestedAltText ?? '';
    if (text.length === 0) return;

    try {
      await navigator.clipboard.writeText(text);
      altTextCopied = true;
      setTimeout(() => {
        altTextCopied = false;
      }, 1600);
    } catch {
      altTextCopied = false;
    }
  };
</script>

<Motion
  let:motion
  initial={{ x: 460, opacity: 0 }}
  animate={{ x: isOpen ? 0 : 460, opacity: isOpen ? 1 : 0 }}
  transition={{ type: 'spring', stiffness: 260, damping: 32 }}
>
  <aside
    use:motion
    aria-label="Image analysis"
    aria-hidden={!isOpen}
    inert={!isOpen}
    class={[
      'absolute top-0 right-0 z-30 flex w-[27rem] max-w-[92vw] flex-col border-l border-white/10 bg-[#101018]/95 backdrop-blur-xl',
      imageStore.hasImages ? 'bottom-28' : 'bottom-0',
      isOpen ? 'pointer-events-auto' : 'pointer-events-none',
    ]}
  >
    {#if image}
      <header class="shrink-0 space-y-3 border-b border-white/10 px-5 pt-5 pb-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold tracking-tight text-neutral-50">
              {image.fileName}
            </h2>
            <p class="mt-0.5 text-xs text-neutral-500">
              {#if image.metadata}
                {image.metadata.sourceFormatLabel} &middot; {image.metadata.width} &times; {image
                  .metadata.height} &middot; {image.metadata.fileSizeLabel}
              {:else if image.status === 'error'}
                Detected as {sourceFormatLabels[image.sourceFormat]}, never decoded
              {:else}
                Reading the file&hellip;
              {/if}
            </p>
          </div>
          <button
            type="button"
            tabindex="0"
            aria-label="Close the analysis panel"
            class="shrink-0 rounded-full border border-white/10 px-2.5 py-1 text-xs text-neutral-400 transition hover:border-white/25 hover:text-neutral-100 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
            onclick={handleClose}
          >
            Close
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class={[
              'rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase',
              statusClasses[image.status],
            ]}
          >
            {imageStatusLabels[image.status]}
          </span>
          {#if image.metadata?.isVector}
            <span
              class="rounded-full border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-sky-200 uppercase"
            >
              Vector
            </span>
          {/if}
          {#if image.metadata?.isAnimated}
            <span
              class="rounded-full border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-fuchsia-200 uppercase"
            >
              Animated &middot; frame 1
            </span>
          {/if}
          {#if analysis}
            <span
              class="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-300 uppercase"
            >
              {analysis.contentType}
            </span>
          {/if}
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto">
        {#if image.status === 'error'}
          <div class="space-y-3 px-5 py-5">
            <p
              class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              role="alert"
            >
              {image.error}
            </p>
            {#if image.bitmap}
              <button
                type="button"
                tabindex="0"
                aria-label="Run the analysis again"
                class="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:outline-none"
                onclick={handleRetry}
              >
                Try the analysis again
              </button>
            {/if}
          </div>
        {/if}

        {#if analysis}
          <div class="space-y-2 px-5 py-4">
            <p class="text-sm leading-relaxed text-neutral-200">{analysis.summary}</p>
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
              <span><span class="text-neutral-400">Subject:</span> {analysis.subject}</span>
              <span><span class="text-neutral-400">Mood:</span> {analysis.mood}</span>
            </div>
          </div>
        {:else if isPending}
          <div class="space-y-3 px-5 py-5" aria-live="polite">
            <p class="text-xs tracking-[0.14em] text-neutral-500 uppercase">
              {imageStatusLabels[image.status]}
            </p>
            {#each [0, 1, 2, 3] as line (line)}
              <div
                class="h-3 animate-pulse rounded-full bg-white/8"
                style:width={`${94 - line * 12}%`}
              ></div>
            {/each}
          </div>
        {/if}

        <nav
          aria-label="Analysis sections"
          class="sticky top-0 z-10 flex gap-1 border-y border-white/10 bg-[#101018]/95 px-5 py-2 backdrop-blur"
        >
          {#each tabs as entry (entry.id)}
            <button
              type="button"
              tabindex="0"
              aria-label={`Show ${entry.label}`}
              aria-current={tab === entry.id}
              class={[
                'rounded-full px-3 py-1.5 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none',
                tab === entry.id
                  ? 'bg-indigo-500/20 text-indigo-100'
                  : 'text-neutral-500 hover:text-neutral-200',
              ]}
              onclick={() => handleTab(entry.id)}
            >
              {entry.label}
            </button>
          {/each}
        </nav>

        <div class="px-5 py-4">
          {#if tab === 'metadata'}
            {#if image.metadata}
              {@const metadata = image.metadata}
              <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
                {#each buildMetadataRows(metadata) as row (row.label)}
                  <div>
                    <dt class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                      {row.label}
                    </dt>
                    <dd class="mt-0.5 text-sm text-neutral-100">{row.value}</dd>
                  </div>
                {/each}
              </dl>

              {#if metadata.palette.length > 0}
                <section class="mt-6">
                  <h3 class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                    Measured palette
                  </h3>
                  <ul class="mt-2 flex gap-2">
                    {#each metadata.palette as swatch (swatch.hex)}
                      <li class="flex-1 space-y-1">
                        <span
                          class="block h-9 rounded-md ring-1 ring-white/10"
                          style:background-color={swatch.hex}
                          aria-hidden="true"
                        ></span>
                        <span class="block text-[10px] text-neutral-500 tabular-nums">
                          {Math.round(swatch.share * 100)}%
                        </span>
                      </li>
                    {/each}
                  </ul>
                  {#if analysis}
                    <p class="mt-2 text-xs leading-relaxed text-neutral-400">
                      {analysis.paletteDescription}
                    </p>
                  {/if}
                </section>
              {/if}

              <section class="mt-6">
                <h3 class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                  Embedded metadata
                </h3>
                {#if !metadata.supportsEmbeddedMetadata}
                  <p class="mt-2 text-xs text-neutral-500">
                    {metadata.sourceFormatLabel} has no container for EXIF, IPTC or XMP.
                  </p>
                {:else if !metadata.exif}
                  <p class="mt-2 text-xs text-neutral-500">
                    No embedded metadata was found in this file.
                  </p>
                {:else}
                  {@const exifRows = buildExifRows(metadata.exif)}
                  {#if exifRows.length === 0}
                    <p class="mt-2 text-xs text-neutral-500">
                      A metadata block is present but carries nothing readable.
                    </p>
                  {:else}
                    <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
                      {#each exifRows as row (row.label)}
                        <div>
                          <dt class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                            {row.label}
                          </dt>
                          <dd class="mt-0.5 text-sm break-words text-neutral-100">{row.value}</dd>
                        </div>
                      {/each}
                    </dl>
                  {/if}
                {/if}
              </section>
            {:else}
              <p class="text-sm text-neutral-500">Measurements appear once the file is decoded.</p>
            {/if}
          {/if}

          {#if tab === 'uses'}
            {#if analysis}
              <section
                class="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs"
              >
                <h3 class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                  Text overlay
                </h3>
                <p class="mt-1 text-sm text-neutral-100">
                  {#if analysis.overlayTextSafeZone.region === 'none'}
                    No safe zone
                  {:else}
                    {analysis.overlayTextSafeZone.region} &middot;
                    {analysis.overlayTextSafeZone.recommendedTextColor} text
                  {/if}
                </p>
                <p class="mt-1 leading-relaxed text-neutral-400">
                  {analysis.overlayTextSafeZone.rationale}
                </p>
              </section>
            {:else if image.bitmap}
              <p
                class="mb-5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs leading-relaxed text-neutral-400"
              >
                No analysis for this image, so there are no fit scores. Every crop below is still
                generated for real, centred on the middle of the image.
              </p>
            {:else}
              <p class="text-sm text-neutral-500">Crops appear once the file is decoded.</p>
            {/if}

            {#if image.bitmap}
              {@const bitmap = image.bitmap}
              <ul class="space-y-3">
                {#each roleEntries as { role, fit } (role.id)}
                  {@const expanded = expandedRoleId === role.id}
                  <li class="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div class="flex items-baseline justify-between gap-3">
                      <h3 class="text-sm font-semibold text-neutral-50">{role.label}</h3>
                      {#if fit}
                        <span class="text-xs text-neutral-400 tabular-nums">
                          {fit.fitScore}<span class="text-neutral-600">/100</span>
                        </span>
                      {/if}
                    </div>
                    <p class="mt-0.5 text-[11px] text-neutral-500">
                      {role.aspectRatioLabel} &middot; {role.width} &times; {role.height} &middot; max
                      {role.maxWeightKb} KB
                    </p>

                    {#if fit}
                      <div class="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          class={['h-full rounded-full', fitBarClasses(fit.fitScore)]}
                          style:width={`${fit.fitScore}%`}
                        ></div>
                      </div>

                      <p class="mt-2 text-xs leading-relaxed text-neutral-300">{fit.rationale}</p>

                      {#if fit.requiredEdits.length > 0}
                        <ul class="mt-2 space-y-1">
                          {#each fit.requiredEdits as edit (edit)}
                            <li class="flex gap-2 text-xs text-neutral-400">
                              <span class="text-indigo-400" aria-hidden="true">&bull;</span>
                              <span>{edit}</span>
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    {:else}
                      <p class="mt-2 text-xs leading-relaxed text-neutral-500">
                        {role.description}
                      </p>
                    {/if}

                    <button
                      type="button"
                      tabindex="0"
                      aria-label={`${expanded ? 'Hide' : 'Show'} the ${role.label} crop`}
                      aria-expanded={expanded}
                      class="mt-3 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-indigo-400/60 hover:text-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
                      onclick={() => handleToggleRole(role.id)}
                    >
                      {expanded ? 'Hide crop' : 'Generate crop'}
                    </button>

                    {#if expanded}
                      <RolePreview
                        {bitmap}
                        sourceUrl={image.displayUrl}
                        sourceName={image.fileName}
                        {role}
                        {focalPoint}
                        hasAlpha={image.metadata?.hasTransparency ?? false}
                      />
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          {/if}

          {#if tab === 'edits'}
            {#if !analysis}
              <p class="text-sm text-neutral-500">
                Edit recommendations appear once the analysis comes back.
              </p>
            {:else}
              <section>
                <h3 class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                  Technical issues
                </h3>
                {#if analysis.technicalIssues.length === 0}
                  <p class="mt-2 text-sm text-emerald-300">
                    Nothing flagged against the measured file.
                  </p>
                {:else}
                  <ul class="mt-2 space-y-2">
                    {#each analysis.technicalIssues as issue (issue.issue)}
                      <li class={['rounded-xl border px-3 py-2', severityClasses[issue.severity]]}>
                        <p class="text-[10px] font-semibold tracking-[0.14em] uppercase">
                          {issue.severity}
                        </p>
                        <p class="mt-1 text-sm text-neutral-100">{issue.issue}</p>
                        <p class="mt-1 text-xs leading-relaxed text-neutral-400">
                          {issue.recommendation}
                        </p>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </section>

              <section class="mt-6">
                <h3 class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">Delivery</h3>
                <div class="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-sm font-semibold text-neutral-50 uppercase">
                      {analysis.optimization.recommendedFormat}
                    </span>
                    <span class="text-xs text-neutral-400">
                      target &le; {analysis.optimization.targetMaxWeightKb} KB
                    </span>
                  </div>
                  <p class="text-xs leading-relaxed text-neutral-300">
                    {analysis.optimization.formatAdvice}
                  </p>
                  <p class="text-xs leading-relaxed text-neutral-400">
                    {analysis.optimization.compressionAdvice}
                  </p>
                </div>
              </section>

              <section class="mt-6">
                <h3 class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                  Accessibility
                </h3>
                <div class="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  {#if analysis.accessibility.isDecorative}
                    <p class="text-sm text-neutral-200">
                      Decorative &mdash; ship it with an empty <code class="text-indigo-300"
                        >alt=""</code
                      >.
                    </p>
                  {:else}
                    <p class="text-sm leading-relaxed text-neutral-100">
                      {analysis.accessibility.suggestedAltText}
                    </p>
                    <button
                      type="button"
                      tabindex="0"
                      aria-label="Copy the suggested alt text"
                      class="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-indigo-400/60 hover:text-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none"
                      onclick={() => void handleCopyAltText()}
                    >
                      {altTextCopied ? 'Copied' : 'Copy alt text'}
                    </button>
                  {/if}
                  {#if analysis.accessibility.contrastNotes.length > 0}
                    <p class="text-xs leading-relaxed text-neutral-400">
                      {analysis.accessibility.contrastNotes}
                    </p>
                  {/if}
                </div>
              </section>

              <section class="mt-6">
                <h3 class="text-[10px] tracking-[0.14em] text-neutral-500 uppercase">
                  Focal point
                </h3>
                <p class="mt-2 text-sm text-neutral-100">{analysis.focalPoint.description}</p>
                <p class="mt-1 text-xs text-neutral-500 tabular-nums">
                  x {analysis.focalPoint.x.toFixed(2)} &middot; y {analysis.focalPoint.y.toFixed(2)}
                  &mdash; every generated crop is centred here
                </p>
              </section>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </aside>
</Motion>
