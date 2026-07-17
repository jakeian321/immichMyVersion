<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { getAssetPlaybackUrl } from '$lib/utils';
  import { timeToSeconds } from '$lib/utils/date-time';
  import { removeTag, tagAssets } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { navigate } from '$lib/utils/navigation';
  import { getAllTags, getAssetInfo, upsertTags, type AssetResponseDto } from '@immich/sdk';
  import { mdiClose } from '@mdi/js';
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

  // quick review buttons under each video's frames; combo buttons apply several tags at
  // once. Scrolling past a video without tapping any of them auto-applies
  // REVIEW_FALLBACK_TAG.
  const REVIEW_TAG_BUTTONS = [
    { label: 'low', tagValues: ['low'] },
    { label: 'ls', tagValues: ['low', 'semitop'] },
    { label: 'semitop', tagValues: ['semitop'] },
    { label: 'st', tagValues: ['semitop', 'top'] },
    { label: 'top', tagValues: ['top'] },
    { label: 'tp', tagValues: ['top', 'pose'] },
    { label: 'ed', tagValues: ['editing'] },
  ];
  const REVIEW_TAGS = new Set(REVIEW_TAG_BUTTONS.flatMap(({ tagValues }) => tagValues));
  const REVIEW_FALLBACK_TAG = 'low';

  interface FeedSection {
    asset: AssetResponseDto;
    frames: { time: number; url: string }[];
    status: 'pending' | 'generating' | 'done' | 'error' | 'skipped';
    /** review tag values currently applied via this feed (or found on the asset) */
    selectedTags: string[];
    /** the user explicitly tagged this video, so no fallback tag on scroll-past */
    hasSelection: boolean;
    /** the fallback tag was applied automatically rather than tapped */
    autoTagged: boolean;
    /** already scrolled past and processed; never process twice */
    passed: boolean;
  }

  let sections = $state<FeedSection[]>(
    assets.map((asset) => {
      // if the album payload includes tags, respect review tags already on the asset
      const existing = (asset.tags ?? [])
        .map((tag) => tag.value.toLowerCase())
        .filter((value) => REVIEW_TAGS.has(value));
      return {
        asset,
        frames: [],
        status: 'pending' as const,
        selectedTags: existing,
        hasSelection: existing.length > 0,
        autoTagged: false,
        passed: false,
      };
    }),
  );

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
        if (isDestroyed) {
          return;
        }
        const url = await captureFrame(time);
        section.frames.push({ time, url });
      }

      section.status = 'done';
    } catch (error) {
      if (!isDestroyed) {
        section.status = 'error';
        handleError(error, $t('errors.unable_to_generate_video_preview'));
      }
    }
  };

  // the feed is a review queue for unreviewed media: anything that already carries a
  // tag is left out. Tags are checked fresh right before a section would generate, so
  // the payload the feed was opened with can't be stale.
  const isAlreadyTagged = async (section: FeedSection): Promise<boolean> => {
    try {
      const fresh = await getAssetInfo({ id: section.asset.id });
      return (fresh.tags ?? []).length > 0;
    } catch {
      // if the check fails, keep the video in the feed rather than silently dropping it
      return false;
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
        if (await isAlreadyTagged(sections[nextIndex])) {
          sections[nextIndex].status = 'skipped';
          continue;
        }
        await generateSection(nextIndex);
        generatedCount++;
      }
    } finally {
      isGenerating = false;
    }
  };

  let reviewTagIds = $state<Record<string, string>>({});

  const loadReviewTagIds = async () => {
    try {
      const allTags = await getAllTags();
      const ids: Record<string, string> = {};
      for (const tag of allTags) {
        const value = tag.value.toLowerCase();
        if (REVIEW_TAGS.has(value)) {
          ids[value] = tag.id;
        }
      }
      reviewTagIds = ids;
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_tags'));
    }
  };

  const ensureReviewTagId = async (value: string): Promise<string | undefined> => {
    if (reviewTagIds[value]) {
      return reviewTagIds[value];
    }
    const [created] = await upsertTags({ tagUpsertDto: { tags: [value] } });
    if (created) {
      reviewTagIds = { ...reviewTagIds, [value]: created.id };
      return created.id;
    }
    return undefined;
  };

  const applyReviewTag = async (section: FeedSection, value: string) => {
    try {
      const tagId = await ensureReviewTagId(value);
      if (tagId) {
        await tagAssets({ tagIds: [tagId], assetIds: [section.asset.id], showNotification: false });
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_add_tag'));
    }
  };

  const removeReviewTag = async (section: FeedSection, value: string) => {
    try {
      const tagId = reviewTagIds[value];
      if (tagId) {
        await removeTag({ tagIds: [tagId], assetIds: [section.asset.id], showNotification: false });
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_remove_tag'));
    }
  };

  const isReviewButtonSelected = (section: FeedSection, tagValues: string[]) =>
    tagValues.every((value) => section.selectedTags.includes(value));

  const handleReviewTagClick = async (section: FeedSection, tagValues: string[]) => {
    section.hasSelection = true;

    // tapping a fully selected button unselects all of its tags
    if (isReviewButtonSelected(section, tagValues)) {
      section.selectedTags = section.selectedTags.filter((tag) => !tagValues.includes(tag));
      if (tagValues.includes(REVIEW_FALLBACK_TAG)) {
        section.autoTagged = false;
      }
      for (const value of tagValues) {
        await removeReviewTag(section, value);
      }
      return;
    }

    const missing = tagValues.filter((value) => !section.selectedTags.includes(value));
    section.selectedTags = [...section.selectedTags, ...missing];
    for (const value of missing) {
      await applyReviewTag(section, value);
    }

    // a real pick replaces an automatically applied fallback tag
    if (
      !tagValues.includes(REVIEW_FALLBACK_TAG) &&
      section.autoTagged &&
      section.selectedTags.includes(REVIEW_FALLBACK_TAG)
    ) {
      section.selectedTags = section.selectedTags.filter((tag) => tag !== REVIEW_FALLBACK_TAG);
      section.autoTagged = false;
      await removeReviewTag(section, REVIEW_FALLBACK_TAG);
    }
  };

  const handleSectionPassed = async (section: FeedSection) => {
    if (section.passed) {
      return;
    }
    section.passed = true;

    // only videos that were actually reviewable and got no explicit pick fall back
    if (section.hasSelection || section.status === 'error') {
      return;
    }

    section.autoTagged = true;
    section.selectedTags = [...section.selectedTags, REVIEW_FALLBACK_TAG];
    await applyReviewTag(section, REVIEW_FALLBACK_TAG);
  };

  // watches each section within the feed's scroll container; a section counts as
  // "passed" once its bottom scrolls out above the viewport
  let passObserver: IntersectionObserver | undefined;
  const sectionsByElement = new Map<Element, FeedSection>();

  const trackScrollPast = (node: HTMLElement, section: FeedSection) => {
    sectionsByElement.set(node, section);
    passObserver?.observe(node);
    return {
      destroy() {
        sectionsByElement.delete(node);
        passObserver?.unobserve(node);
      },
    };
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
  let scrollContainer: HTMLDivElement | undefined = $state();

  onMount(() => {
    void pumpQueue();
    void loadReviewTagIds();

    observer = new IntersectionObserver((entries) => {
      sentinelVisible = entries.some((entry) => entry.isIntersecting);
      if (sentinelVisible) {
        void pumpQueue();
      }
    });
    if (sentinel) {
      observer.observe(sentinel);
    }

    passObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting || !entry.rootBounds) {
            continue;
          }
          // fully above the visible area means the user scrolled past it
          if (entry.boundingClientRect.bottom <= entry.rootBounds.top) {
            const section = sectionsByElement.get(entry.target);
            if (section) {
              void handleSectionPassed(section);
            }
          }
        }
      },
      { root: scrollContainer },
    );
    for (const element of sectionsByElement.keys()) {
      passObserver.observe(element);
    }
  });

  onDestroy(() => {
    isDestroyed = true;
    observer?.disconnect();
    passObserver?.disconnect();
    sectionsByElement.clear();
    if (feedVideo) {
      feedVideo.src = '';
    }
  });

  let visibleSections = $derived(
    sections.filter((section) => section.status !== 'pending' && section.status !== 'skipped'),
  );
  let hasPending = $derived(sections.some((section) => section.status === 'pending'));
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="fixed inset-0 z-[9999] flex flex-col bg-black bg-opacity-95 p-2">
  <div class="flex items-center justify-between px-1">
    <h2 class="text-lg text-white">
      {$t('frame_preview_all')}
      <span class="ml-2 text-sm text-gray-400">{visibleSections.length}/{assets.length}</span>
    </h2>
    <button type="button" class="text-white p-2" title={$t('close')} onclick={onClose}>
      <Icon path={mdiClose} size="1.5rem" />
    </button>
  </div>

  <div class="flex-1 overflow-y-auto overscroll-contain" bind:this={scrollContainer}>
    {#each visibleSections as section (section.asset.id)}
      <section class="mb-6" use:trackScrollPast={section}>
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
        </div>

        {#if section.status === 'error'}
          <p class="px-1 py-3 text-sm text-red-400">{$t('error')}</p>
        {:else}
          <div class="grid grid-cols-2 items-start gap-1.5 sm:gap-2">
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

        <!-- review actions sit after the frames: by the time you know what the video
             holds you're at the bottom of its section, so no scrolling back up -->
        <div class="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {#each REVIEW_TAG_BUTTONS as reviewButton (reviewButton.label)}
            <button
              type="button"
              class={`rounded-full px-3 py-2 text-sm font-medium text-white transition-all ${
                isReviewButtonSelected(section, reviewButton.tagValues)
                  ? 'bg-immich-primary'
                  : 'bg-white bg-opacity-10 hover:bg-opacity-20'
              }`}
              title={reviewButton.tagValues.join(' + ')}
              onclick={() => handleReviewTagClick(section, reviewButton.tagValues)}
            >
              {reviewButton.label}
            </button>
          {/each}
        </div>
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
