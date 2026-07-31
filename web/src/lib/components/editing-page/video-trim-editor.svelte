<script lang="ts">
  import Button from '$lib/components/elements/buttons/button.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import { getAssetPlaybackUrl } from '$lib/utils';
  import { type AssetResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    asset: AssetResponseDto;
    onCancel: () => void;
    onSave: (segments: { start: number; end: number }[]) => void;
  }

  let { asset, onCancel, onSave }: Props = $props();

  // one thumbnail per second, which is the granularity the segments are chosen at
  const FRAME_INTERVAL_SECONDS = 1;
  // a very long video would otherwise mean hundreds of seeks; past this the strip
  // coarsens rather than refusing to open
  const MAX_FRAMES = 240;
  const CAPTURE_MAX_WIDTH = 240;
  const JPEG_QUALITY = 0.6;

  let videoElement: HTMLVideoElement | undefined = $state();
  let canvasElement: HTMLCanvasElement | undefined = $state();

  let frames = $state<{ time: number; url: string }[]>([]);
  let duration = $state(0);
  let step = $state(FRAME_INTERVAL_SECONDS);
  let isGenerating = $state(true);
  let progress = $state(0);
  let errorMessage = $state('');
  let isDestroyed = false;

  // every frame starts kept, so trimming is a matter of dropping what you don't want;
  // the select-none button covers the opposite way of working
  let keptIndexes = new SvelteSet<number>();

  onDestroy(() => {
    isDestroyed = true;
    if (videoElement) {
      videoElement.src = '';
    }
  });

  const captureFrame = (time: number): Promise<string> =>
    new Promise((resolve, reject) => {
      const video = videoElement;
      const canvas = canvasElement;
      const context = canvas?.getContext('2d');

      if (!video || !canvas || !context) {
        reject(new Error('Editor is not ready'));
        return;
      }

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        // iOS Safari can fire `seeked` before the frame is painted, so give it an
        // extra couple of frames before drawing
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const scale = Math.min(1, CAPTURE_MAX_WIDTH / (video.videoWidth || CAPTURE_MAX_WIDTH));
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
          }),
        );
      };

      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
    });

  const generate = async () => {
    const video = videoElement;
    if (!video) {
      return;
    }

    try {
      video.src = getAssetPlaybackUrl({ id: asset.id, cacheKey: null });
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Failed to load video')), { once: true });
      });

      // iOS Safari won't decode frames for drawImage until the video has played once
      try {
        await video.play();
        video.pause();
      } catch {
        // autoplay may be blocked; seeking usually still works
      }

      duration = video.duration;
      const wanted = Math.ceil(duration / FRAME_INTERVAL_SECONDS);
      step = wanted > MAX_FRAMES ? duration / MAX_FRAMES : FRAME_INTERVAL_SECONDS;
      const count = Math.min(wanted, MAX_FRAMES);

      for (let index = 0; index < count; index++) {
        if (isDestroyed) {
          return;
        }
        const time = Math.min(index * step, Math.max(duration - 0.05, 0));
        const url = await captureFrame(time);
        frames = [...frames, { time, url }];
        keptIndexes.add(index);
        progress = Math.round(((index + 1) / count) * 100);
      }
    } catch {
      errorMessage = $t('errors.unable_to_load_asset');
    } finally {
      isGenerating = false;
    }
  };

  $effect(() => {
    if (videoElement && canvasElement && frames.length === 0 && isGenerating) {
      void generate();
    }
  });

  const toggle = (index: number) => {
    if (keptIndexes.has(index)) {
      keptIndexes.delete(index);
    } else {
      keptIndexes.add(index);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // collapses the kept frames into contiguous time ranges, which is what the encoder needs
  let segments = $derived.by(() => {
    const sorted = [...keptIndexes].sort((a, b) => a - b);
    const ranges: { start: number; end: number }[] = [];
    for (const index of sorted) {
      const start = frames[index]?.time ?? index * step;
      const end = Math.min(start + step, duration);
      const last = ranges.at(-1);
      if (last && Math.abs(last.end - start) < 0.001) {
        last.end = end;
      } else {
        ranges.push({ start, end });
      }
    }
    return ranges;
  });

  let keptDuration = $derived(segments.reduce((total, r) => total + (r.end - r.start), 0));
</script>

<div class="fixed inset-0 z-[1100] flex flex-col bg-black text-white">
  <div class="flex items-center justify-between gap-2 border-b border-gray-800 p-3">
    <Button size="sm" color="gray" onclick={onCancel}>{$t('cancel')}</Button>
    <p class="truncate text-sm">{asset.originalFileName}</p>
    <Button size="sm" disabled={segments.length === 0 || isGenerating} onclick={() => onSave(segments)}>
      {$t('save')}
    </Button>
  </div>

  <div class="flex flex-wrap items-center gap-3 px-3 py-2 text-xs text-gray-300">
    <span>{$t('trim_kept_summary', { values: { kept: formatTime(keptDuration), total: formatTime(duration) } })}</span>
    <span>·</span>
    <span>{$t('trim_segments_count', { values: { count: segments.length } })}</span>
    <button
      type="button"
      class="rounded-lg bg-gray-800 px-2 py-1 [@media(hover:hover)]:hover:bg-gray-700"
      style="touch-action: manipulation"
      onclick={() => {
        for (let i = 0; i < frames.length; i++) {
          keptIndexes.add(i);
        }
      }}
    >
      {$t('select_all')}
    </button>
    <button
      type="button"
      class="rounded-lg bg-gray-800 px-2 py-1 [@media(hover:hover)]:hover:bg-gray-700"
      style="touch-action: manipulation"
      onclick={() => keptIndexes.clear()}
    >
      {$t('unselect_all')}
    </button>
  </div>

  <div class="immich-scrollbar flex-1 overflow-y-auto p-3">
    {#if errorMessage}
      <p class="pt-8 text-center text-sm text-red-400">{errorMessage}</p>
    {:else}
      {#if isGenerating}
        <div class="flex items-center justify-center gap-3 pb-3 text-sm text-gray-300">
          <LoadingSpinner />
          <span>{progress}%</span>
        </div>
      {/if}

      <div class="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
        {#each frames as frame, index (frame.time)}
          {@const kept = keptIndexes.has(index)}
          <button
            type="button"
            class={[
              'relative overflow-hidden rounded-lg border-2 transition-opacity',
              kept ? 'border-immich-primary' : 'border-transparent opacity-40',
            ]}
            style="touch-action: manipulation"
            onclick={() => toggle(index)}
          >
            <img src={frame.url} alt={formatTime(frame.time)} class="w-full" />
            <span class="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px]">{index + 1}</span>
            <span class="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px]">
              {formatTime(frame.time)}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <video bind:this={videoElement} class="hidden" muted playsinline preload="metadata"></video>
  <canvas bind:this={canvasElement} class="hidden"></canvas>
</div>
