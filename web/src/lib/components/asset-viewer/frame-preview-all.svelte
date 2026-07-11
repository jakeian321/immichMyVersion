<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { getAssetPlaybackUrl } from '$lib/utils';
  import { timeToSeconds } from '$lib/utils/date-time';
  import { handleError } from '$lib/utils/handle-error';
  import { navigate } from '$lib/utils/navigation';
  import { deleteAssets, type AssetResponseDto } from '@immich/sdk';
  import { mdiClose, mdiDeleteOutline } from '@mdi/js';
  import { onDestroy, onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';

  interface Props {
    /** video assets to show, in feed order; the first one is the currently viewed asset */
    assets: AssetResponseDto[];
    currentAssetId: string;
    onJumpTo: (time: number) => void;
    onClose: () => void;
  }

  let { assets, currentAssetId, onJumpTo, onClose }: Props = $props();

  const FRAME_COUNT = 21;
  // capping capture size keeps dozens of sections from exhausting memory the way
  // full-resolution canvases would; sized for the roughly full-width tiles of the feed
  const CAPTURE_MAX_WIDTH = 720;
  const JPEG_QUALITY = 0.6;
  // how many sections to generate ahead of the last one the user has scrolled to
  const LOOKAHEAD = 1;

  interface FeedSection {
    asset: AssetResponseDto;
    frames: { time: number; url: string }[];
    status: 'pending' | 'generating' | 'done' | 'error' | 'deleted';
  }

  let sections = $state<FeedSection[]>(assets.map((asset) => ({ asset, frames: [], status: 'pending' as const })));

  let feedVideo: HTMLVideoElement | undefined = $state();
  let feedCanvas: HTMLCanvasElement | undefined = $state();
  let sentinel: HTMLDivElement | undefined = $state();

  let isGenerating = false;
  let isDestroyed = false;
  let sentinelVisible = false;
  let generatedCount = 0;

  const formatTime = (timeInSeconds: number): string => {
    if (Number.isNaN(timeInSeconds)) {
      return '00:00';
    }
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getFrameTimes = (videoDuration: number): number[] => {
    const interval = videoDuration / FRAME_COUNT;
    return Array.from({ length: FRAME_COUNT }, (_, i) => Math.min(i * interval, Math.max(videoDuration - 0.1, 0)));
  };

  const captureFrame = (time: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = feedVideo;
      const canvas = feedCanvas;
      const context = canvas?.getContext('2d');

      if (!video || !canvas || !context) {
        reject(new Error('Frame preview is not ready'));
        return;
      }

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        // iOS Safari can fire `seeked` before the frame is actually painted,
        // so give it an extra couple of frames before drawing to the canvas.
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
  };

  const generateSection = async (index: number) => {
    const section = sections[index];
    const video = feedVideo;
    if (!section || !video) {
      return;
    }

    section.status = 'generating';

    try {
      video.src = getAssetPlaybackUrl({ id: section.asset.id, cacheKey: null });
      await new Promise<void>((resolve, reject) => {
        video.addEventListener('loadedmetadata', () => resolve(), { once: true });
        video.addEventListener('error', () => reject(new Error('Failed to load video')), { once: true });
      });

      // iOS Safari won't decode any frames for drawImage until the video has
      // actually started playing at least once, so prime it with a play/pause.
      try {
        await video.play();
        video.pause();
      } catch {
        // Autoplay may be blocked; seeking can still work without priming.
      }

      for (const time of getFrameTimes(video.duration)) {
        if (isDestroyed || isSectionDeleted(section)) {
          return;
        }
        const url = await captureFrame(time);
        section.frames.push({ time, url });
      }

      if (!isSectionDeleted(section)) {
        section.status = 'done';
      }
    } catch (error) {
      if (!isDestroyed) {
        section.status = 'error';
        handleError(error, $t('errors.unable_to_generate_video_preview'));
      }
    }
  };

  const pumpQueue = async () => {
    if (isGenerating || isDestroyed) {
      return;
    }

    isGenerating = true;
    try {
      while (!isDestroyed) {
        const nextIndex = sections.findIndex((section) => section.status === 'pending');
        if (nextIndex === -1) {
          break;
        }
        // always keep a small lookahead; beyond that only continue while the
        // user has scrolled to the bottom, so we load like a feed instead of
        // hammering every video at once
        if (generatedCount > LOOKAHEAD && !sentinelVisible) {
          break;
        }
        await generateSection(nextIndex);
        generatedCount++;
      }
    } finally {
      isGenerating = false;
    }
  };

  const handleTrash = async (section: FeedSection) => {
    try {
      await deleteAssets({ assetBulkDeleteDto: { ids: [section.asset.id] } });
      section.status = 'deleted';
      section.frames = [];
    } catch (error) {
      handleError(error, $t('errors.unable_to_trash_asset'));
    }
  };

  const handleFrameClick = async (section: FeedSection, time: number) => {
    if (section.asset.id === currentAssetId) {
      onJumpTo(time);
      onClose();
      return;
    }

    // navigate the viewer to the tapped video, opening it at the tapped frame's time.
    // setAsset keeps the current feed and autoplay delay; the seek is applied by the
    // video viewer once the target video is ready.
    assetViewingStore.setPendingVideoSeek(section.asset.id, time);
    assetViewingStore.setAsset(section.asset, [], get(assetViewingStore.videoAutoplayDelayMs));
    await navigate({ targetRoute: 'current', assetId: section.asset.id });
    onClose();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  };

  let observer: IntersectionObserver | undefined;

  onMount(() => {
    void pumpQueue();

    observer = new IntersectionObserver((entries) => {
      sentinelVisible = entries.some((entry) => entry.isIntersecting);
      if (sentinelVisible) {
        void pumpQueue();
      }
    });
    if (sentinel) {
      observer.observe(sentinel);
    }
  });

  onDestroy(() => {
    isDestroyed = true;
    observer?.disconnect();
    if (feedVideo) {
      feedVideo.src = '';
    }
  });

  let visibleSections = $derived(sections.filter((section) => section.status !== 'pending'));
  let hasPending = $derived(sections.some((section) => section.status === 'pending'));

  // status can be flipped to 'deleted' by the trash button while generation awaits;
  // checking through a function keeps TypeScript from narrowing it to 'generating'
  const isSectionDeleted = (section: FeedSection) => section.status === 'deleted';
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-[9999] flex flex-col bg-black bg-opacity-95 p-2">
  <div class="flex items-center justify-between px-1">
    <h2 class="text-lg text-white">
      {$t('frame_preview_all')}
      <span class="ml-2 text-sm text-gray-400">{assets.length}</span>
    </h2>
    <button type="button" class="text-white p-2" title={$t('close')} onclick={onClose}>
      <Icon path={mdiClose} size="1.5rem" />
    </button>
  </div>

  <div class="flex-1 overflow-y-auto overscroll-contain">
    {#each visibleSections as section (section.asset.id)}
      <section class="mb-6">
        <div class="sticky top-0 z-10 flex items-center justify-between bg-black bg-opacity-80 px-1 py-1">
          <div class="min-w-0">
            <p
              class="truncate text-sm {section.asset.id === currentAssetId ? 'text-immich-dark-primary' : 'text-white'}"
              title={section.asset.originalFileName}
            >
              {section.asset.originalFileName}
            </p>
            <p class="text-xs text-gray-400">
              {formatTime(timeToSeconds(section.asset.duration ?? '0:00:00.00000'))}
            </p>
          </div>

          {#if section.status !== 'deleted'}
            <button
              type="button"
              class="shrink-0 p-2 text-white hover:text-red-400"
              title={$t('trash')}
              onclick={() => handleTrash(section)}
            >
              <Icon path={mdiDeleteOutline} size="1.4rem" />
            </button>
          {/if}
        </div>

        {#if section.status === 'deleted'}
          <p class="px-1 py-3 text-sm text-gray-500">{$t('moved_to_trash')}</p>
        {:else if section.status === 'error'}
          <p class="px-1 py-3 text-sm text-red-400">{$t('error')}</p>
        {:else}
          <div class="grid grid-cols-1 items-start gap-1.5 sm:grid-cols-2 sm:gap-2">
            {#each section.frames as frame (frame.time)}
              <button
                type="button"
                class="relative w-full overflow-hidden rounded-sm bg-black/30"
                onclick={() => handleFrameClick(section, frame.time)}
              >
                <!-- natural aspect ratio, so the whole frame is visible instead of a crop -->
                <img src={frame.url} alt={formatTime(frame.time)} class="w-full" />
                <span class="absolute bottom-1 right-1 rounded-sm bg-black bg-opacity-60 px-1.5 text-xs text-white">
                  {formatTime(frame.time)}
                </span>
              </button>
            {/each}

            {#if section.status === 'generating'}
              {#each Array.from({ length: FRAME_COUNT - section.frames.length }) as _, index (index)}
                <div class="aspect-video w-full animate-pulse rounded-sm bg-white bg-opacity-10"></div>
              {/each}
            {/if}
          </div>
        {/if}
      </section>
    {/each}

    <div bind:this={sentinel} class="flex h-16 items-center justify-center">
      {#if hasPending}
        <LoadingSpinner />
      {:else}
        <p class="text-sm text-gray-500">{$t('no_more_videos')}</p>
      {/if}
    </div>
  </div>

  <video
    bind:this={feedVideo}
    muted
    playsinline
    class="pointer-events-none fixed left-0 top-0 -z-50 h-px w-px opacity-0"
  ></video>
  <canvas bind:this={feedCanvas} class="hidden"></canvas>
</div>
