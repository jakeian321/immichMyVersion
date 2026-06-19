<script lang="ts">
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import {
    loopVideo as loopVideoPreference,
    videoViewerMuted,
    videoViewerVolume,
    videoZoomedOut,
  } from '$lib/stores/preferences.store';
  import { getAssetPlaybackUrl, getAssetThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { AssetMediaSize } from '@immich/sdk';
  import { onDestroy, onMount } from 'svelte';
  import { swipe } from 'svelte-gestures';
  import type { SwipeCustomEvent } from 'svelte-gestures';
  import { fade } from 'svelte/transition';
  import { t } from 'svelte-i18n';
  import { isFaceEditMode } from '$lib/stores/face-edit.svelte';
  import FaceEditor from '$lib/components/asset-viewer/face-editor/face-editor.svelte';

  // Import for tag components
  import Icon from '$lib/components/elements/icon.svelte';
  import TagAssetForm from '$lib/components/forms/tag-asset-form.svelte';
  import Portal from '$lib/components/shared-components/portal/portal.svelte';
  import { AppRoute, AssetAction } from '$lib/constants';
  import { isSharedLink } from '$lib/utils';
  import { removeTag, tagAssets } from '$lib/utils/asset-utils';
  import type { OnAction } from '$lib/components/asset-viewer/actions/action';
  import { deleteAssets, getAssetInfo, type AssetResponseDto, getAllTags, upsertTags } from '@immich/sdk';
  import {
    mdiClose,
    mdiPlus,
    mdiTag,
    mdiTagMultiple,
    mdiEyeOff,
    mdiEye,
    mdiMagnifyMinusOutline,
    mdiPlay,
    mdiPause,
    mdiVolumeMute,
    mdiVolumeHigh,
    mdiBookmark,
    mdiBookmarkOutline,
    mdiFilmstrip,
    mdiDeleteOutline,
  } from '@mdi/js';

  interface Props {
    assetId: string;
    loopVideo: boolean;
    cacheKey: string | null;
    skipPercentage?: number;
    maxSkipSeconds?: number;
    minSkipSeconds?: number;
    asset?: AssetResponseDto;
    isOwner?: boolean;
    onPreviousAsset?: () => void;
    onNextAsset?: () => void;
    onVideoEnded?: () => void;
    onVideoStarted?: () => void;
    onClose?: () => void;
    onAction?: OnAction;
  }

  let {
    assetId,
    loopVideo,
    cacheKey,
    skipPercentage = 0.1,
    maxSkipSeconds = 1,
    minSkipSeconds = 1,
    asset = $bindable(),
    isOwner = true,
    onPreviousAsset = () => {},
    onNextAsset = () => {},
    onVideoEnded = () => {},
    onVideoStarted = () => {},
    onClose = () => {},
    onAction = undefined,
  }: Props = $props();

  let { videoAutoplayDelayMs } = assetViewingStore;

  let videoPlayer: HTMLVideoElement | undefined = $state();
  let videoContainer: HTMLDivElement | undefined = $state();
  let isLoading = $state(true);
  let assetFileUrl = $state('');
  let forceMuted = $state(false);
  let isScrubbing = $state(false);
  let isPlaying = $state(false);
  let isTagProcessingActive = $state(false);

  let tagButtonsInitialized = $state(false);

  let normalPlaybackRate = 1.0;
  let fastForwardRate = 3.5;
  let isForwarding = $state(false);

  let isAutoSkip = $state(false);
  let autoSkipRate = 4.0;

  const FRAME_PREVIEW_COUNT = 21;
  let showFramePreview = $state(false);
  let isGeneratingFramePreview = $state(false);
  let framePreviewThumbnails = $state<{ time: number; url: string }[]>([]);
  let wasPlayingBeforeFramePreview = false;
  let framePreviewVideo: HTMLVideoElement | undefined = $state();
  let framePreviewCanvas: HTMLCanvasElement | undefined = $state();
  let framePreviewLoadedUrl = '';

  let currentTime = $state(0);
  let duration = $state(0);
  let progress = $state(0);
  let isProgressBarHovered = $state(false);
  let showControls = $state(true);
  let controlsTimeout: number | null = $state(null);

  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let isTouchMove = false;
  const TOUCH_MOVEMENT_THRESHOLD = 10;
  const TAP_DURATION_THRESHOLD = 300;

  // FIXED: Load preset from localStorage on initialization
  const PRESET_STORAGE_KEY = 'immich_quick_tag_preset';

  const loadSavedPreset = (): string[] => {
    try {
      const saved = localStorage.getItem(PRESET_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('Loaded saved preset from localStorage:', parsed);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (error) {
      console.error('Failed to load saved preset:', error);
    }
    return [];
  };

  const savePresetToStorage = (preset: string[]) => {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
      console.log('Saved preset to localStorage:', preset);
    } catch (error) {
      console.error('Failed to save preset to localStorage:', error);
    }
  };

  let savedTagPreset: string[] = $state(loadSavedPreset());
  let isHoldingPresetButton = $state(false);
  let holdTimer: number | null = null;
  let showPresetConfig = $state(false);
  let tempPresetSelection: string[] = $state([]);
  const HOLD_DURATION = 4000;

  let tags = $derived(asset?.tags || []);
  let isTagFormOpen = $state(false);
  let showTagsPanel = $state(false);

  let showTagElements = $state(false);

  let hasReachedTagDisplayThreshold = $state(false);
  const TAG_DISPLAY_THRESHOLD = 0.9;

  const presetTags = [
    { id: 'preset-low', value: 'low' },
    { id: 'preset-semitop', value: 'semitop' },
    { id: 'preset-top', value: 'top' },
    { id: 'preset-lowTOK', value: 'lowTOK' },
    { id: 'preset-semiTOK', value: 'semiTOK' },
    { id: 'preset-topTOK', value: 'topTOK' },
    { id: 'preset-twerk', value: 'twerk' },
    { id: 'preset-face', value: 'face' },
    { id: 'preset-wiggle', value: 'wiggle' },
    { id: 'preset-pose', value: 'pose' },
    { id: 'preset-recoil', value: 'recoil' },
    { id: 'preset-pose2', value: 'pose2' },
    { id: 'preset-side', value: 'side' },
    { id: 'preset-lay', value: 'lay' },
    { id: 'preset-spin', value: 'spin' },
    { id: 'preset-ass', value: 'ass' },
    { id: 'preset-walk', value: 'walk' },
    { id: 'preset-tongue', value: 'tongue' },
    { id: 'preset-ahegao', value: 'ahegao' },
    { id: 'preset-tit', value: 'tit' },
    { id: 'preset-bikini', value: 'bikini' },
    { id: 'preset-milf', value: 'milf' },
    { id: 'preset-editing', value: 'editing' },
  ];

  // one-tap shortcuts that select several preset tags at once; each is shown
  // inline next to its anchorTag in the preset tag list
  const comboTags = [
    { id: 'combo-tpr', label: 'TPR', anchorTag: 'recoil', tagValues: ['top', 'pose', 'recoil'] },
    { id: 'combo-tpt', label: 'TPT', anchorTag: 'twerk', tagValues: ['top', 'pose', 'twerk'] },
    { id: 'combo-tpw', label: 'TPW', anchorTag: 'wiggle', tagValues: ['top', 'pose', 'wiggle'] },
    { id: 'combo-tp', label: 'TP', anchorTag: 'pose', tagValues: ['top', 'pose'] },
  ];

  const getComboTagForAnchor = (tagValue: string) => comboTags.find((combo) => combo.anchorTag === tagValue);

  let availableTagsMap = $state<Record<string, string>>({});

  let selectedPresetTags = $state<string[]>([]);

  let scale = $state(1);
  let translateX = $state(0);
  let translateY = $state(0);
  let startDistance = $state(0);
  let startScale = $state(1);
  let isZoomed = $state(false);
  let lastTouchX = $state(0);
  let lastTouchY = $state(0);
  let isPanning = $state(false);
  let showZoomControls = $state(false);

  const MIN_SCALE = 1;
  const MAX_SCALE = 5;

  let processingTagIds = $state<string[]>([]);

  const checkTagSelected = (tagValue: string): boolean => {
    if (!asset?.tags) return false;
    return asset.tags.some((tag) => tag.value.toLowerCase() === tagValue.toLowerCase());
  };

  const checkTagProcessing = (tagValue: string): boolean => {
    return processingTagIds.includes(tagValue.toLowerCase());
  };

  const checkComboTagProcessing = (tagValues: string[]): boolean => {
    return tagValues.some((tagValue) => checkTagProcessing(tagValue));
  };

  const initializeTags = async () => {
    if (!assetId) return;

    try {
      asset = await getAssetInfo({ id: assetId });

      const allTags = await getAllTags();

      availableTagsMap = allTags.reduce((map: Record<string, string>, tag) => {
        map[tag.value.toLowerCase()] = tag.id;
        return map;
      }, {});

      const missingTags = presetTags.filter((tag) => !availableTagsMap[tag.value.toLowerCase()]);

      if (missingTags.length > 0) {
        console.warn('Some preset tags are not in the system:', missingTags.map((t) => t.value).join(', '));
      }

      processingTagIds = [];
      isTagProcessingActive = false;
    } catch (error) {
      console.error('Failed to initialize tags:', error);
      handleError(error, $t('errors.unable_to_load_tags'));
    }
  };

  onMount(async () => {
    if (videoPlayer) {
      assetFileUrl = getAssetPlaybackUrl({ id: assetId, cacheKey });
      forceMuted = false;
      $videoViewerMuted = false;
    }

    await initializeTags();

    controlsTimeout = setTimeout(() => {
      showControls = false;
    }, 3000);

    showTagElements = false;
    hasReachedTagDisplayThreshold = false;
    tagButtonsInitialized = true;
  });

  onDestroy(() => {
    if (videoPlayer) {
      videoPlayer.src = '';
    }

    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    if (holdTimer) {
      clearTimeout(holdTimer);
    }

    isAutoSkip = false;
  });

  const handleCanPlay = async (video: HTMLVideoElement) => {
    try {
      const delayMs = $videoAutoplayDelayMs;
      if (delayMs > 0) {
        // give a non-virtualized grid's other mounted assets a moment to settle before
        // starting decode on this video, instead of competing with them from frame one
        video.pause();
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      await video.play();
      isPlaying = true;
      onVideoStarted();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError' && !forceMuted) {
        await tryForceMutedPlay(video);
        return;
      }

      handleError(error, $t('errors.unable_to_play_video'));
    } finally {
      isLoading = false;
    }
  };

  const tryForceMutedPlay = async (video: HTMLVideoElement) => {
    try {
      video.muted = true;
      await handleCanPlay(video);
    } catch (error) {
      handleError(error, $t('errors.unable_to_play_video'));
    }
  };

  const onSwipe = (event: SwipeCustomEvent) => {
    if (isZoomed) return;

    if (event.detail.direction === 'left') {
      onNextAsset();
    }
    if (event.detail.direction === 'right') {
      onPreviousAsset();
    }
  };

  const toggleAutoSkip = () => {
    if (!videoPlayer) return;

    isAutoSkip = !isAutoSkip;

    if (isAutoSkip) {
      if (videoPlayer.paused) {
        videoPlayer.play().catch((error) => handleError(error, $t('errors.unable_to_play_video')));
        isPlaying = true;
      }

      videoPlayer.playbackRate = autoSkipRate;
    } else {
      videoPlayer.playbackRate = normalPlaybackRate;
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!videoPlayer) return;

    if (event.key === 'ArrowRight') {
      const skipTime = calculateSkipTime();
      videoPlayer.currentTime = Math.min(videoPlayer.currentTime + skipTime, videoPlayer.duration);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      const skipTime = calculateSkipTime();
      videoPlayer.currentTime = Math.max(videoPlayer.currentTime - skipTime, 0);
      event.preventDefault();
    } else if (event.key === ' ' || event.key === 'k') {
      togglePlayPause();
      event.preventDefault();
    }
  };

  const calculateSkipTime = () => {
    if (!videoPlayer) return 0;

    let skipTime = videoPlayer.duration * skipPercentage;

    if (skipTime > maxSkipSeconds) {
      skipTime = maxSkipSeconds;
    } else if (skipTime < minSkipSeconds) {
      skipTime = minSkipSeconds;
    }

    return skipTime;
  };

  const updateProgress = () => {
    if (!videoPlayer) return;
    currentTime = videoPlayer.currentTime;
    duration = videoPlayer.duration || 0;
    progress = duration ? (currentTime / duration) * 100 : 0;
    isPlaying = !videoPlayer.paused;

    if (!hasReachedTagDisplayThreshold && duration > 0) {
      const progressPercentage = currentTime / duration;
      if (progressPercentage >= TAG_DISPLAY_THRESHOLD) {
        hasReachedTagDisplayThreshold = true;
        showTagElements = true;
      }
    }
  };

  const handleProgressBarClick = (event: MouseEvent | TouchEvent) => {
    if (!videoPlayer || isZoomed) return;

    const progressBar = event.currentTarget as HTMLDivElement;
    const rect = progressBar.getBoundingClientRect();

    let clientY: number;

    if ('touches' in event) {
      clientY = event.touches[0].clientY;
    } else {
      clientY = event.clientY;
    }

    const clickPosition = (clientY - rect.top) / rect.height;
    videoPlayer.currentTime = clickPosition * videoPlayer.duration;
    progress = clickPosition * 100;

    event.stopPropagation();
  };

  const handleSegmentProgressClick = (
    event: MouseEvent | TouchEvent,
    segmentIndex: number,
    segmentDuration: number,
  ) => {
    if (!videoPlayer || isZoomed) return;

    const progressBar = event.currentTarget as HTMLDivElement;
    const rect = progressBar.getBoundingClientRect();

    let clientX: number;

    if ('touches' in event) {
      clientX = event.touches[0].clientX;
    } else {
      clientX = event.clientX;
    }

    const clickPosition = (clientX - rect.left) / rect.width;
    const segmentStart = segmentIndex * 8;
    videoPlayer.currentTime = segmentStart + clickPosition * segmentDuration;
    progress = (videoPlayer.currentTime / videoPlayer.duration) * 100;

    event.stopPropagation();
  };

  const handleVideoTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;

    touchStartTime = Date.now();
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    isTouchMove = false;
  };

  const handleVideoTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;

    const dx = Math.abs(event.touches[0].clientX - touchStartX);
    const dy = Math.abs(event.touches[0].clientY - touchStartY);

    if (dx > TOUCH_MOVEMENT_THRESHOLD || dy > TOUCH_MOVEMENT_THRESHOLD) {
      isTouchMove = true;
    }
  };

  const handleVideoTouchEnd = (event: TouchEvent) => {
    const touchDuration = Date.now() - touchStartTime;

    if (!isTouchMove && touchDuration < TAP_DURATION_THRESHOLD && !isPanning && !isZoomed) {
      togglePlayPause();
      event.preventDefault();
    }
  };

  const togglePlayPause = () => {
    if (!videoPlayer) return;

    if (videoPlayer.paused) {
      videoPlayer.play().catch((error) => handleError(error, $t('errors.unable_to_play_video')));
      isPlaying = true;
    } else {
      videoPlayer.pause();
      isPlaying = false;
    }

    showControls = true;
    resetControlsTimeout();
  };

  const toggleMute = () => {
    if (!videoPlayer) return;

    try {
      event?.stopPropagation();
    } catch (e) {}

    videoPlayer.muted = !videoPlayer.muted;
    $videoViewerMuted = videoPlayer.muted;
    forceMuted = false;
  };

  const handleVolumeChange = (e: Event) => {
    const video = e.currentTarget as HTMLVideoElement;
    if (!forceMuted) {
      $videoViewerMuted = video.muted;
    }
  };

  const formatTime = (timeInSeconds: number): string => {
    if (isNaN(timeInSeconds)) return '00:00';

    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const getFramePreviewTimes = (videoDuration: number): number[] => {
    const interval = videoDuration / FRAME_PREVIEW_COUNT;
    return Array.from({ length: FRAME_PREVIEW_COUNT }, (_, i) =>
      Math.min(i * interval, Math.max(videoDuration - 0.1, 0)),
    );
  };

  const captureFramePreview = (time: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = framePreviewVideo;
      const canvas = framePreviewCanvas;
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
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          }),
        );
      };

      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
    });
  };

  const openFramePreview = async () => {
    if (!videoPlayer || !duration || !framePreviewVideo) {
      return;
    }

    wasPlayingBeforeFramePreview = isPlaying;
    videoPlayer.pause();

    showFramePreview = true;
    isGeneratingFramePreview = true;
    framePreviewThumbnails = [];

    try {
      if (framePreviewLoadedUrl !== assetFileUrl) {
        framePreviewVideo.src = assetFileUrl;
        await new Promise<void>((resolve, reject) => {
          framePreviewVideo?.addEventListener('loadedmetadata', () => resolve(), { once: true });
          framePreviewVideo?.addEventListener('error', () => reject(new Error('Failed to load video')), {
            once: true,
          });
        });
        framePreviewLoadedUrl = assetFileUrl;

        // iOS Safari won't decode any frames for drawImage until the video has
        // actually started playing at least once, so prime it with a play/pause.
        try {
          await framePreviewVideo.play();
          framePreviewVideo.pause();
        } catch {
          // Autoplay may be blocked; seeking can still work without priming.
        }
      }

      const thumbnails: { time: number; url: string }[] = [];
      for (const time of getFramePreviewTimes(framePreviewVideo.duration || duration)) {
        thumbnails.push({ time, url: await captureFramePreview(time) });
        framePreviewThumbnails = [...thumbnails];
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_generate_video_preview'));
    } finally {
      isGeneratingFramePreview = false;
    }
  };

  const closeFramePreview = () => {
    showFramePreview = false;

    if (wasPlayingBeforeFramePreview && videoPlayer) {
      videoPlayer.play().catch((error) => handleError(error, $t('errors.unable_to_play_video')));
    }
  };

  const handleTrashFromFramePreview = async () => {
    if (!asset?.id) {
      return;
    }

    showFramePreview = false;

    try {
      await deleteAssets({ assetBulkDeleteDto: { ids: [asset.id] } });
      onAction?.({ type: AssetAction.TRASH, asset });
    } catch (error) {
      handleError(error, $t('errors.unable_to_trash_asset'));
    }
  };

  const jumpToFramePreview = (time: number) => {
    if (videoPlayer) {
      videoPlayer.currentTime = time;
      updateProgress();
    }

    closeFramePreview();
  };

  const resetControlsTimeout = () => {
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    controlsTimeout = setTimeout(() => {
      if (!isZoomed) {
        showControls = false;
      }
    }, 1300);
  };

  const showVideoControls = () => {
    if (isZoomed) return;

    showControls = true;
    resetControlsTimeout();
  };

  const toggleTagsPanel = () => {
    showTagsPanel = !showTagsPanel;
  };

  const handleAddTag = () => (isTagFormOpen = true);

  const handleCancelTag = () => (isTagFormOpen = false);

  const handleTag = async (tagIds: string[]) => {
    if (!asset?.id) return;

    try {
      isTagProcessingActive = true;
      const ids = await tagAssets({ tagIds, assetIds: [asset.id], showNotification: false });

      if (ids) {
        isTagFormOpen = false;
      }

      asset = await getAssetInfo({ id: asset.id });

      if (asset?.tags) {
        selectedPresetTags = asset.tags
          .filter((tag) => presetTags.some((preset) => preset.value === tag.value))
          .map((tag) => tag.value);
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_add_tag'));
    } finally {
      isTagProcessingActive = false;
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!asset?.id) return;

    try {
      isTagProcessingActive = true;
      const ids = await removeTag({ tagIds: [tagId], assetIds: [asset.id], showNotification: false });

      if (ids) {
        asset = await getAssetInfo({ id: asset.id });

        if (asset?.tags) {
          selectedPresetTags = asset.tags
            .filter((tag) => presetTags.some((preset) => preset.value === tag.value))
            .map((tag) => tag.value);
        }
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_remove_tag'));
    } finally {
      isTagProcessingActive = false;
    }
  };

  const applyTagToAsset = async (tagValue: string, force: boolean = false) => {
    if (!asset?.id) return false;

    const tagValueLower = tagValue.toLowerCase();

    if (!force && processingTagIds.includes(tagValueLower)) {
      return false;
    }

    processingTagIds = [...processingTagIds, tagValueLower];
    isTagProcessingActive = true;

    let success = false;

    try {
      const tagExists = asset.tags.some((tag) => tag.value.toLowerCase() === tagValueLower);

      if (tagExists) {
        const existingTag = asset.tags.find((tag) => tag.value.toLowerCase() === tagValueLower);
        if (existingTag) {
          const result = await removeTag({
            tagIds: [existingTag.id],
            assetIds: [asset.id],
            showNotification: false,
          });
          success = !!result;
        }
      } else {
        const tagId = availableTagsMap[tagValueLower];
        if (tagId) {
          const result = await tagAssets({
            tagIds: [tagId],
            assetIds: [asset.id],
            showNotification: false,
          });
          success = !!result;
        }
      }

      if (success) {
        asset = await getAssetInfo({ id: asset.id });
      }
    } catch (error) {
      console.error(`Error applying tag ${tagValue}:`, error);
      handleError(error, $t(tagExists ? 'errors.unable_to_remove_tag' : 'errors.unable_to_add_tag'));
      success = false;
    } finally {
      processingTagIds = processingTagIds.filter((id) => id !== tagValueLower);
      if (processingTagIds.length === 0) {
        isTagProcessingActive = false;
      }
    }

    return success;
  };

  const handleComboTagButtonClick = async (event: MouseEvent, tagValues: string[]) => {
    event?.preventDefault();
    event?.stopPropagation();

    for (const tagValue of tagValues) {
      if (!checkTagSelected(tagValue)) {
        await applyTagToAsset(tagValue);
      }
    }
  };

  const handleTagButtonClick = (event: MouseEvent, tagValue: string) => {
    event?.preventDefault();
    event?.stopPropagation();

    applyTagToAsset(tagValue);
  };

  const handleDoubleClick = async (e: MouseEvent) => {
    if (isZoomed || !asset?.id || !isOwner) {
      return;
    }
    e.stopPropagation();

    const tagValue = 'low';

    // no-op if already tagged
    if (asset.tags?.some((tag) => tag.value.toLowerCase() === tagValue)) {
      return;
    }

    try {
      let tagId = availableTagsMap[tagValue];
      if (!tagId) {
        const [created] = await upsertTags({ tagUpsertDto: { tags: [tagValue] } });
        if (created) {
          tagId = created.id;
          availableTagsMap = { ...availableTagsMap, [tagValue]: tagId };
        }
      }
      if (tagId) {
        await tagAssets({ tagIds: [tagId], assetIds: [asset.id], showNotification: false });
        asset = await getAssetInfo({ id: asset.id });
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_add_tag'));
    }
  };

  const isPresetTagSelected = (tagValue: string): boolean => {
    return asset?.tags?.some((tag) => tag.value.toLowerCase() === tagValue.toLowerCase()) || false;
  };

  const isTagBeingProcessed = (tagValue: string): boolean => {
    return processingTagIds.includes(tagValue.toLowerCase());
  };

  const toggleTagElementsVisibility = () => {
    showTagElements = !showTagElements;
  };

  const toggleVideoZoom = () => {
    $videoZoomedOut = !$videoZoomedOut;
  };

  const getVisiblePresetTags = () => {
    const tokTags = ['lowTOK', 'semiTOK', 'topTOK'];
    return presetTags.filter((tag) => !tokTags.includes(tag.value));
  };

  const saveCurrentTagSelection = () => {
    if (!asset?.tags) return;

    const currentSelection = asset.tags
      .filter((tag) => presetTags.some((preset) => preset.value.toLowerCase() === tag.value.toLowerCase()))
      .map((tag) => tag.value);

    if (currentSelection.length > 0) {
      savedTagPreset = currentSelection;
      savePresetToStorage(currentSelection);
      console.log('Saved tag preset:', savedTagPreset);
    }
  };

  const applyQuickTagPreset = async () => {
    if (savedTagPreset.length === 0 || !asset?.id) {
      console.log('No preset to apply or no asset');
      return;
    }

    console.log('Applying quick tag preset:', savedTagPreset);
    isTagProcessingActive = true;

    try {
      for (const tagValue of savedTagPreset) {
        const tagValueLower = tagValue.toLowerCase();
        const tagId = availableTagsMap[tagValueLower];

        if (!tagId) {
          console.warn(`Tag ${tagValue} not found in available tags`);
          continue;
        }

        const tagExists = asset.tags.some((tag) => tag.value.toLowerCase() === tagValueLower);

        if (!tagExists) {
          console.log(`Adding tag: ${tagValue}`);
          await tagAssets({
            tagIds: [tagId],
            assetIds: [asset.id],
            showNotification: false,
          });
        } else {
          console.log(`Tag ${tagValue} already exists, skipping`);
        }
      }

      asset = await getAssetInfo({ id: asset.id });
      console.log('Preset applied successfully');
    } catch (error) {
      console.error('Error applying preset:', error);
      handleError(error, $t('errors.unable_to_apply_tags'));
    } finally {
      isTagProcessingActive = false;
    }
  };

  const startHoldTimer = () => {
    isHoldingPresetButton = true;
    holdTimer = setTimeout(() => {
      showPresetConfig = true;
      tempPresetSelection = [...savedTagPreset];
      isHoldingPresetButton = false;
    }, HOLD_DURATION);
  };

  const cancelHoldTimer = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }

    if (!showPresetConfig && isHoldingPresetButton) {
      applyQuickTagPreset();
    }

    isHoldingPresetButton = false;
  };

  const togglePresetTagSelection = (tagValue: string) => {
    const index = tempPresetSelection.indexOf(tagValue);
    if (index > -1) {
      tempPresetSelection = tempPresetSelection.filter((t) => t !== tagValue);
    } else {
      tempPresetSelection = [...tempPresetSelection, tagValue];
    }
  };

  const savePresetConfig = () => {
    savedTagPreset = [...tempPresetSelection];
    savePresetToStorage(savedTagPreset);
    showPresetConfig = false;
    console.log('Configured tag preset:', savedTagPreset);
  };

  const cancelPresetConfig = () => {
    showPresetConfig = false;
    tempPresetSelection = [];
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      startDistance = Math.sqrt(dx * dx + dy * dy);
      startScale = scale;
      event.preventDefault();
    } else if (event.touches.length === 1 && isZoomed) {
      lastTouchX = event.touches[0].clientX;
      lastTouchY = event.touches[0].clientY;
      isPanning = true;
    }

    handleVideoTouchStart(event);
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      let newScale = startScale * (distance / startDistance);

      newScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);

      scale = newScale;
      isZoomed = scale > 1;

      if (isZoomed) {
        showZoomControls = true;
      }

      event.preventDefault();
    } else if (event.touches.length === 1 && isZoomed && isPanning) {
      const touchX = event.touches[0].clientX;
      const touchY = event.touches[0].clientY;

      const deltaX = touchX - lastTouchX;
      const deltaY = touchY - lastTouchY;

      lastTouchX = touchX;
      lastTouchY = touchY;

      const maxPan = (scale - 1) * 100;
      translateX = Math.min(Math.max(translateX + deltaX, -maxPan), maxPan);
      translateY = Math.min(Math.max(translateY + deltaY, -maxPan), maxPan);

      event.preventDefault();
    }

    handleVideoTouchMove(event);
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) {
      startDistance = 0;

      if (scale < 1.05) {
        resetZoom();
      }
    }

    if (event.touches.length === 0) {
      const wasPanning = isPanning;
      isPanning = false;

      if (!wasPanning) {
        handleVideoTouchEnd(event);
      }
    }
  };

  const resetZoom = () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    isZoomed = false;
    showZoomControls = false;

    showControls = true;
    resetControlsTimeout();
  };

  const getTransformStyle = () => {
    return `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)`;
  };

  let containerWidth = $state(0);
  let containerHeight = $state(0);

  $effect(() => {
    if (isFaceEditMode.value) {
      videoPlayer?.pause();
      isPlaying = false;
    }
  });

  $effect(() => {
    if (asset?.tags && tagButtonsInitialized) {
      saveCurrentTagSelection();
    }
  });
</script>

<div transition:fade={{ duration: 150 }} class="flex flex-col h-full select-none">
  <div
    class="flex-grow relative flex place-content-center place-items-center overflow-hidden"
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
    bind:this={videoContainer}
    onkeydown={handleKeydown}
    tabindex="0"
    onmousemove={showVideoControls}
    ontouchmove={showVideoControls}
  >
    <video
      bind:this={videoPlayer}
      loop={$loopVideoPreference && loopVideo}
      autoplay
      playsinline
      webkit-playsinline="true"
      class="h-full w-full {$videoZoomedOut
        ? 'object-contain'
        : 'object-cover'} max-h-screen transition-transform duration-100"
      style={`transform: ${getTransformStyle()}`}
      use:swipe={() => ({})}
      onswipe={onSwipe}
      ontimeupdate={updateProgress}
      oncanplay={(e) => handleCanPlay(e.currentTarget)}
      onended={onVideoEnded}
      onvolumechange={handleVolumeChange}
      onplay={() => {
        isPlaying = true;
      }}
      onpause={() => {
        isPlaying = false;
      }}
      onseeking={() => (isScrubbing = true)}
      onseeked={() => (isScrubbing = false)}
      onplaying={(e) => {
        e.currentTarget.focus();
        updateProgress();
      }}
      onclose={() => onClose()}
      muted={forceMuted || $videoViewerMuted}
      bind:volume={$videoViewerVolume}
      poster={getAssetThumbnailUrl({ id: assetId, size: AssetMediaSize.Preview, cacheKey })}
      src={assetFileUrl}
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      onclick={(e) => {
        if (!isZoomed) {
          e.stopPropagation();
          togglePlayPause();
        }
      }}
      ondblclick={handleDoubleClick}
    >
    </video>

    {#if isLoading}
      <div class="absolute flex place-content-center place-items-center">
        <LoadingSpinner />
      </div>
    {/if}

    {#if isFaceEditMode.value}
      <FaceEditor htmlElement={videoPlayer} {containerWidth} {containerHeight} {assetId} />
    {/if}

    <!-- Quick Tag Preset Button -->
    {#if !isZoomed && isOwner && asset?.id && !isSharedLink()}
      <div class="z-[1001] fixed left-0 top-[8%]">
        <button
          class={`text-white rounded-full px-3 py-2 transition-all ${
            savedTagPreset.length > 0 ? 'bg-immich-primary' : 'bg-black bg-opacity-60'
          }`}
          onmousedown={startHoldTimer}
          onmouseup={cancelHoldTimer}
          onmouseleave={cancelHoldTimer}
          ontouchstart={startHoldTimer}
          ontouchend={cancelHoldTimer}
          title={savedTagPreset.length > 0 ? `Quick apply: ${savedTagPreset.join(', ')}` : 'Hold 4s to configure'}
        >
          <Icon path={savedTagPreset.length > 0 ? mdiBookmark : mdiBookmarkOutline} size="1.2rem" />
        </button>
      </div>
    {/if}

    <!-- Auto-skip Button -->
    {#if !isZoomed}
      <div class="z-[1001] fixed left-12 top-[8%]">
        <button
          class={`bg-black bg-opacity-40 text-white rounded-full p-2 transition-all ${isAutoSkip ? 'bg-immich-primary bg-opacity-60' : ''}`}
          onclick={toggleAutoSkip}
        >
          <span class="font-bold text-xs">A{isAutoSkip ? '4x' : ''}</span>
        </button>
      </div>
    {/if}

    <!-- Frame Preview Button -->
    {#if !isZoomed}
      <div class="z-[1001] fixed left-24 top-[18%]">
        <button
          type="button"
          class="bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-60 transition-all"
          title={$t('frame_preview')}
          onclick={openFramePreview}
        >
          <Icon path={mdiFilmstrip} size="1.1rem" />
        </button>
      </div>
    {/if}

    <!-- View Tags Button (V) -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed && tags.length > 0}
      <div class="z-[1001] fixed left-12 top-[12%]">
        <button
          type="button"
          class="bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-60 transition-all"
          title="Toggle Tags"
          onclick={toggleTagsPanel}
        >
          <span class="font-bold text-xs">V</span>
        </button>
      </div>
    {/if}

    <!-- Zoom Reset Button -->
    {#if isZoomed && showZoomControls}
      <div class="z-[1001] fixed right-4 bottom-4" transition:fade={{ duration: 150 }}>
        <button
          type="button"
          class="bg-black bg-opacity-60 text-white rounded-full p-3 hover:bg-opacity-80 transition-all"
          title="Reset Zoom"
          onclick={resetZoom}
        >
          <Icon path={mdiMagnifyMinusOutline} size="1.5rem" />
        </button>
      </div>

      <div
        class="z-[1001] fixed left-4 bottom-4 bg-black bg-opacity-60 text-white px-3 py-1 rounded-full"
        transition:fade={{ duration: 150 }}
      >
        {Math.round(scale * 100)}%
      </div>
    {/if}

    <!-- Eye Icon (now uses tag functionality) - Toggle Tag Elements -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed}
      <div class="z-[1001] fixed left-0 top-[12%]">
        <button
          type="button"
          class="bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-60 transition-all"
          title={showTagElements ? 'Hide Tags' : 'Show Tags'}
          onclick={toggleTagElementsVisibility}
        >
          <Icon path={showTagElements ? mdiEyeOff : mdiEye} size="1.1rem" />
        </button>
      </div>
    {/if}

    <!-- Add Tag Button -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed}
      <div class="z-[1001] fixed left-12 top-[18%]">
        <button
          type="button"
          class="bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-60 transition-all"
          title="Add tag"
          onclick={handleAddTag}
        >
          <Icon path={mdiPlus} size="1.1rem" />
        </button>
      </div>
    {/if}

    <!-- Horizontal Progress Bars (increased width and gap) -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed}
      {@const numBars = Math.ceil(duration / 8)}
      {@const barWidth = '2.5in'}

      <div class="z-[1001] fixed left-0 top-[21%] flex flex-col gap-8">
        {#each Array(numBars) as _, index}
          {@const segmentStart = index * 8}
          {@const segmentEnd = Math.min((index + 1) * 8, duration)}
          {@const segmentDuration = segmentEnd - segmentStart}
          {@const segmentProgress = Math.max(0, Math.min(100, ((currentTime - segmentStart) / segmentDuration) * 100))}
          {@const isTopBar = index % 2 === 0}

          <div
            class="relative cursor-pointer select-none outline-none focus:outline-none active:outline-none"
            style="width: {barWidth}; height: 10px; -webkit-tap-highlight-color: transparent;"
            onmousedown={(e) => handleSegmentProgressClick(e, index, segmentDuration)}
            ontouchstart={(e) => handleSegmentProgressClick(e, index, segmentDuration)}
          >
            <div class="absolute inset-0">
              <div class="w-full h-full bg-white bg-opacity-5 rounded-full">
                <div
                  class="h-full bg-white bg-opacity-20 rounded-full transition-[width]"
                  style={`width: ${currentTime >= segmentStart && currentTime <= segmentEnd ? segmentProgress : currentTime > segmentEnd ? 100 : 0}%`}
                ></div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Preset Tag Buttons (anchored below the eye icon / add-tag / progress bars / tags panel) -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed && showTagElements}
      <div class="z-[1001] fixed left-2 top-[26%]">
        <div class="flex flex-col gap-1.5">
          {#each getVisiblePresetTags() as presetTag (presetTag.id)}
            {@const comboTag = getComboTagForAnchor(presetTag.value)}
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                class={`px-2 py-1 rounded-lg text-white transition-all flex items-center gap-1 ${
                  checkTagSelected(presetTag.value)
                    ? 'bg-immich-primary'
                    : 'bg-black bg-opacity-40 hover:bg-immich-primary/50'
                }`}
                onclick={(event) => handleTagButtonClick(event, presetTag.value)}
                disabled={checkTagProcessing(presetTag.value)}
              >
                <Icon path={mdiTag} size="0.6rem" />
                <span class="text-xs font-medium">{presetTag.value}</span>
                {#if checkTagProcessing(presetTag.value)}
                  <span class="ml-1 inline-block h-3 w-3">
                    <LoadingSpinner size="xs" />
                  </span>
                {/if}
              </button>

              {#if comboTag}
                <button
                  type="button"
                  class={`px-2 py-1 rounded-lg text-white transition-all flex items-center gap-1 ${
                    comboTag.tagValues.every((value) => checkTagSelected(value))
                      ? 'bg-immich-primary'
                      : 'bg-black bg-opacity-40 hover:bg-immich-primary/50'
                  }`}
                  title={comboTag.tagValues.join(' + ')}
                  onclick={(event) => handleComboTagButtonClick(event, comboTag.tagValues)}
                  disabled={checkComboTagProcessing(comboTag.tagValues)}
                >
                  <Icon path={mdiTagMultiple} size="0.6rem" />
                  <span class="text-xs font-medium">{comboTag.label}</span>
                  {#if checkComboTagProcessing(comboTag.tagValues)}
                    <span class="ml-1 inline-block h-3 w-3">
                      <LoadingSpinner size="xs" />
                    </span>
                  {/if}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- View Tags Panel -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed}
      <div class="z-[1001] fixed left-0 top-[22%]">
        <div class="flex flex-col">
          {#if showTagsPanel && tags.length > 0}
            <div class="bg-black bg-opacity-40 rounded p-2 max-w-[200px]">
              <div class="flex flex-wrap gap-1">
                {#each tags as tag (tag.id)}
                  <div class="flex group transition-all">
                    <a
                      class="inline-block h-min whitespace-nowrap pl-2 pr-1 py-0.5 text-center align-baseline leading-none text-gray-100 bg-immich-primary rounded-tl-full rounded-bl-full hover:bg-immich-primary/80 transition-all"
                      href={encodeURI(`${AppRoute.TAGS}/?path=${tag.value}`)}
                    >
                      <p class="text-xs">
                        {tag.value}
                      </p>
                    </a>

                    <button
                      type="button"
                      class="text-gray-100 bg-immich-primary/95 rounded-tr-full rounded-br-full place-items-center place-content-center pr-1 pl-0.5 py-0.5 hover:bg-immich-primary/80 transition-all"
                      title="Remove tag"
                      onclick={() => handleRemoveTag(tag.id)}
                    >
                      <Icon path={mdiClose} size="0.75rem" />
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Video Zoom In/Out Toggle Button -->
    {#if !isZoomed}
      <div class="z-[1001] fixed right-2 bottom-2">
        <button
          type="button"
          class="bg-black bg-opacity-40 text-white rounded-full px-2 py-1 hover:bg-opacity-60 transition-all"
          title={$videoZoomedOut ? 'Zoom In' : 'Zoom Out'}
          onclick={toggleVideoZoom}
        >
          <span class="text-[10px] font-medium">{$videoZoomedOut ? 'IN' : 'OUT'}</span>
        </button>
      </div>
    {/if}

    <!-- Preset Configuration Modal -->
    {#if showPresetConfig}
      <Portal>
        <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-75">
          <div class="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-white text-lg font-semibold mb-4">Configure Quick Tag Preset</h3>
            <p class="text-gray-300 text-sm mb-4">Select tags to apply with a quick tap:</p>

            <div class="flex flex-wrap gap-2 mb-6 max-h-96 overflow-y-auto">
              {#each presetTags as presetTag (presetTag.id)}
                <button
                  type="button"
                  class={`px-3 py-2 rounded-lg text-white transition-all ${
                    tempPresetSelection.includes(presetTag.value)
                      ? 'bg-immich-primary'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                  onclick={() => togglePresetTagSelection(presetTag.value)}
                >
                  {presetTag.value}
                </button>
              {/each}
            </div>

            <div class="flex gap-3">
              <button
                type="button"
                class="flex-1 bg-immich-primary text-white py-2 px-4 rounded-lg hover:bg-immich-primary/80 transition-all"
                onclick={savePresetConfig}
              >
                Save Preset
              </button>
              <button
                type="button"
                class="flex-1 bg-gray-700 text-white py-2 px-4 rounded-lg hover:bg-gray-600 transition-all"
                onclick={cancelPresetConfig}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Portal>
    {/if}

    <!-- Tag Form Modal -->
    {#if isTagFormOpen}
      <Portal>
        <TagAssetForm onTag={(tagsIds) => handleTag(tagsIds)} onCancel={handleCancelTag} />
      </Portal>
    {/if}

    <!-- Frame Preview Overlay -->
    {#if showFramePreview}
      <Portal>
        <div class="fixed inset-0 z-[9999] flex flex-col bg-black bg-opacity-90 p-2">
          <div class="flex items-center justify-between px-1">
            <div class="flex items-center gap-1">
              <button type="button" class="text-white p-2" title={$t('trash')} onclick={handleTrashFromFramePreview}>
                <Icon path={mdiDeleteOutline} size="1.5rem" />
              </button>
              <h2 class="text-lg text-white">{$t('frame_preview')}</h2>
            </div>
            <button type="button" class="text-white p-2" title={$t('close')} onclick={closeFramePreview}>
              <Icon path={mdiClose} size="1.5rem" />
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            <div class="grid h-full grid-cols-3 grid-rows-7 gap-1.5 sm:grid-cols-6 sm:grid-rows-4 sm:gap-2">
              {#each framePreviewThumbnails as frame (frame.time)}
                <button
                  type="button"
                  class="relative h-full w-full overflow-hidden rounded-sm"
                  onclick={() => jumpToFramePreview(frame.time)}
                >
                  <img src={frame.url} alt={formatTime(frame.time)} class="h-full w-full object-cover" />
                  <span
                    class="absolute bottom-0.5 right-0.5 rounded-sm bg-black bg-opacity-60 px-1 text-[10px] text-white"
                  >
                    {formatTime(frame.time)}
                  </span>
                </button>
              {/each}

              {#if isGeneratingFramePreview}
                {#each Array.from({ length: FRAME_PREVIEW_COUNT - framePreviewThumbnails.length }) as _, index (index)}
                  <div class="h-full w-full animate-pulse rounded-sm bg-white bg-opacity-10"></div>
                {/each}
              {/if}
            </div>
          </div>
        </div>
      </Portal>
    {/if}

    <video
      bind:this={framePreviewVideo}
      muted
      playsinline
      class="pointer-events-none fixed left-0 top-0 -z-50 h-px w-px opacity-0"
    ></video>
    <canvas bind:this={framePreviewCanvas} class="hidden"></canvas>
  </div>
</div>
