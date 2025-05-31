<script lang="ts">
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import { loopVideo as loopVideoPreference, videoViewerMuted, videoViewerVolume } from '$lib/stores/preferences.store';
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
  import { AppRoute } from '$lib/constants';
  import { isSharedLink } from '$lib/utils';
  import { removeTag, tagAssets } from '$lib/utils/asset-utils';
  import { getAssetInfo, type AssetResponseDto, getAllTags } from '@immich/sdk';
  import {
    mdiClose,
    mdiPlus,
    mdiTag,
    mdiEyeOff,
    mdiEye,
    mdiMagnifyMinusOutline,
    mdiPlay,
    mdiPause,
    mdiVolumeMute,
    mdiVolumeHigh,
  } from '@mdi/js';

  interface Props {
    assetId: string;
    loopVideo: boolean;
    cacheKey: string | null;
    skipPercentage?: number; // Skip percentage of total video duration
    maxSkipSeconds?: number; // Maximum skip time in seconds
    minSkipSeconds?: number; // Minimum skip time in seconds
    asset?: AssetResponseDto; // Added asset property
    isOwner?: boolean; // Added isOwner property
    onPreviousAsset?: () => void;
    onNextAsset?: () => void;
    onVideoEnded?: () => void;
    onVideoStarted?: () => void;
    onClose?: () => void;
  }

  let {
    assetId,
    loopVideo,
    cacheKey,
    skipPercentage = 0.1, // Default to 10% of video duration
    maxSkipSeconds = 1, // Default max skip of 1 second
    minSkipSeconds = 1, // Default min skip of 1 second
    asset = $bindable(),
    isOwner = true,
    onPreviousAsset = () => {},
    onNextAsset = () => {},
    onVideoEnded = () => {},
    onVideoStarted = () => {},
    onClose = () => {},
  }: Props = $props();

  let videoPlayer: HTMLVideoElement | undefined = $state();
  let videoContainer: HTMLDivElement | undefined = $state();
  let isLoading = $state(true);
  let assetFileUrl = $state('');
  let forceMuted = $state(false);
  let isScrubbing = $state(false);
  let isPlaying = $state(false);
  // State to track tag processing - renamed to avoid conflict
  let isTagProcessingActive = $state(false);

  // NEW STATE VARIABLE for tag buttons initialization
  let tagButtonsInitialized = $state(false);

  // Fast playback variables
  let normalPlaybackRate = 1.0;
  let fastForwardRate = 3.5; // 3.5x speed for fast forward
  let isForwarding = $state(false);

  // Auto skip variables
  let isAutoSkip = $state(false);
  let autoSkipRate = 4.0; // 4x speed for auto skip

  // Progress bar variables
  let currentTime = $state(0);
  let duration = $state(0);
  let progress = $state(0);
  let isProgressBarHovered = $state(false);
  let showControls = $state(true);
  let controlsTimeout: number | null = $state(null);

  // Touch handling variables - IMPROVED for play/pause issues
  let touchStartTime = 0;
  let touchStartX = 0;
  let touchStartY = 0;
  let isTouchMove = false;
  const TOUCH_MOVEMENT_THRESHOLD = 10; // pixels of movement before considered a swipe
  const TAP_DURATION_THRESHOLD = 300; // max milliseconds for a tap

  // Tags related states
  let tags = $derived(asset?.tags || []);
  let isTagFormOpen = $state(false);
  let showTagsPanel = $state(false);

  // Toggle visibility for all tag elements - NOW FALSE BY DEFAULT
  let showTagElements = $state(false);

  // NEW: Track if we've passed the threshold to show tags
  let hasReachedTagDisplayThreshold = $state(false);
  const TAG_DISPLAY_THRESHOLD = 0.9; // Show tags at 90% of video completion

  // TOK tags toggle state - default is false (TOK tags hidden)
  let showTokTags = $state(false);

  // Preset tags with their IDs from the system
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

  // Map to store available tag IDs from the system
  let availableTagsMap = $state<Record<string, string>>({});

  // Track which preset tags are selected for the current asset
  let selectedPresetTags = $state<string[]>([]);

  // ZOOM FUNCTIONALITY
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

  // Minimum and maximum zoom levels
  const MIN_SCALE = 1;
  const MAX_SCALE = 5;

  // Store buttons being processed to prevent multiple clicks
  let processingTagIds = $state<string[]>([]);

  const checkTagSelected = (tagValue: string): boolean => {
    if (!asset?.tags) return false;
    return asset.tags.some((tag) => tag.value.toLowerCase() === tagValue.toLowerCase());
  };

  const checkTagProcessing = (tagValue: string): boolean => {
    return processingTagIds.includes(tagValue.toLowerCase());
  };

  const initializeTags = async () => {
    if (!assetId) return;

    try {
      // Always get fresh asset info
      asset = await getAssetInfo({ id: assetId });

      // Get all tags in the system
      const allTags = await getAllTags();

      // Create a map of tag values to IDs (case insensitive)
      availableTagsMap = allTags.reduce((map: Record<string, string>, tag) => {
        map[tag.value.toLowerCase()] = tag.id;
        return map;
      }, {});

      // Make sure all preset tags exist in the system
      const missingTags = presetTags.filter((tag) => !availableTagsMap[tag.value.toLowerCase()]);

      if (missingTags.length > 0) {
        console.warn('Some preset tags are not in the system:', missingTags.map((t) => t.value).join(', '));
      }

      // Reset state
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

      // DIMENSION OVERRIDE FIX - Force dimensions BEFORE loading
      // Override the properties immediately before any loading occurs
      Object.defineProperty(videoPlayer, 'videoWidth', {
        value: 576,
        writable: false,
        configurable: true,
      });
      Object.defineProperty(videoPlayer, 'videoHeight', {
        value: 1118,
        writable: false,
        configurable: true,
      });
      console.log('Pre-loaded dimension override: forcing all videos to 576x1118');

      // Also try to override the naturalWidth and naturalHeight properties
      Object.defineProperty(videoPlayer, 'naturalWidth', {
        value: 576,
        writable: false,
        configurable: true,
      });
      Object.defineProperty(videoPlayer, 'naturalHeight', {
        value: 1118,
        writable: false,
        configurable: true,
      });

      // Set initial style properties to force the aspect ratio
      videoPlayer.style.aspectRatio = '576/1118';
      videoPlayer.style.width = '100%';
      videoPlayer.style.height = '100%';
      videoPlayer.style.objectFit = 'contain';

      // Now load the video
      videoPlayer.load();

      // Additional override after metadata loads (belt and suspenders approach)
      videoPlayer.addEventListener('loadedmetadata', () => {
        // Force override again after metadata loads
        Object.defineProperty(videoPlayer, 'videoWidth', {
          value: 576,
          writable: false,
          configurable: true,
        });
        Object.defineProperty(videoPlayer, 'videoHeight', {
          value: 1118,
          writable: false,
          configurable: true,
        });
        Object.defineProperty(videoPlayer, 'naturalWidth', {
          value: 576,
          writable: false,
          configurable: true,
        });
        Object.defineProperty(videoPlayer, 'naturalHeight', {
          value: 1118,
          writable: false,
          configurable: true,
        });

        // Force re-render by triggering a resize event
        window.dispatchEvent(new Event('resize'));
        console.log('Post-metadata dimension override applied');
      });
    }

    // Initialize tags first before anything else tag-related
    await initializeTags();

    // Other onMount code...

    // Auto-hide controls after 3 seconds
    controlsTimeout = setTimeout(() => {
      showControls = false;
    }, 3000);

    // Reset tag display states
    showTagElements = false;
    hasReachedTagDisplayThreshold = false;
    tagButtonsInitialized = true;
  });

  onDestroy(() => {
    if (videoPlayer) {
      videoPlayer.src = '';
    }

    // Clear any timeouts
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    // Make sure auto skip is turned off
    isAutoSkip = false;
  });

  const handleCanPlay = async (video: HTMLVideoElement) => {
    try {
      // Always play video by default when it can play
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
    // Don't allow swiping between assets when zoomed in
    if (isZoomed) return;

    if (event.detail.direction === 'left') {
      onNextAsset();
    }
    if (event.detail.direction === 'right') {
      onPreviousAsset();
    }
  };

  // Start fast forwarding the video without resetting position
  const startFastForward = () => {
    if (!videoPlayer || isForwarding) return;

    isForwarding = true;

    // Disable auto skip if active
    if (isAutoSkip) {
      toggleAutoSkip();
    }

    // Store current playback state if needed
    if (videoPlayer.paused) {
      // If video was paused, play it for the fast-forward
      videoPlayer.play().catch((error) => handleError(error, $t('errors.unable_to_play_video')));
      isPlaying = true;
    }

    // Set fast forward speed
    videoPlayer.playbackRate = fastForwardRate;
  };

  // Stop fast forwarding
  const stopFastForward = () => {
    if (!videoPlayer || !isForwarding) return;

    // Reset to normal speed
    videoPlayer.playbackRate = normalPlaybackRate;
    isForwarding = false;
  };

  // Toggle auto skip mode
  const toggleAutoSkip = () => {
    if (!videoPlayer) return;

    isAutoSkip = !isAutoSkip;

    if (isAutoSkip) {
      // Turn on auto skip

      // Stop other modes if active
      if (isForwarding) stopFastForward();

      // Make sure video is playing
      if (videoPlayer.paused) {
        videoPlayer.play().catch((error) => handleError(error, $t('errors.unable_to_play_video')));
        isPlaying = true;
      }

      // Set to auto skip speed
      videoPlayer.playbackRate = autoSkipRate;
    } else {
      // Turn off auto skip
      videoPlayer.playbackRate = normalPlaybackRate;
    }
  };

  // Handle keyboard shortcuts for skipping
  const handleKeydown = (event: KeyboardEvent) => {
    if (!videoPlayer) return;

    // Skip forward with right arrow
    if (event.key === 'ArrowRight') {
      const skipTime = calculateSkipTime();
      videoPlayer.currentTime = Math.min(videoPlayer.currentTime + skipTime, videoPlayer.duration);
      event.preventDefault();
    }
    // Skip backward with left arrow
    else if (event.key === 'ArrowLeft') {
      const skipTime = calculateSkipTime();
      videoPlayer.currentTime = Math.max(videoPlayer.currentTime - skipTime, 0);
      event.preventDefault();
    }
    // Toggle play/pause with space or k
    else if (event.key === ' ' || event.key === 'k') {
      togglePlayPause();
      event.preventDefault();
    }
  };

  // Calculate skip time based on video duration (for keyboard shortcuts)
  const calculateSkipTime = () => {
    if (!videoPlayer) return 0;

    // Calculate skip based on percentage of total duration
    let skipTime = videoPlayer.duration * skipPercentage;

    // Apply min/max constraints
    if (skipTime > maxSkipSeconds) {
      skipTime = maxSkipSeconds;
    } else if (skipTime < minSkipSeconds) {
      skipTime = minSkipSeconds;
    }

    return skipTime;
  };

  // UPDATED: Simplified progress bar function
  const updateProgress = () => {
    if (!videoPlayer) return;
    currentTime = videoPlayer.currentTime;
    duration = videoPlayer.duration || 0;
    progress = duration ? (currentTime / duration) * 100 : 0;
    isPlaying = !videoPlayer.paused;

    // Check if we've reached the threshold to display tags - simpler logic
    if (!hasReachedTagDisplayThreshold && duration > 0) {
      const progressPercentage = currentTime / duration;
      if (progressPercentage >= TAG_DISPLAY_THRESHOLD) {
        hasReachedTagDisplayThreshold = true;
        showTagElements = true;
      }
    }
  };

  // FIXED: Improved progress bar click handling
  const handleProgressBarClick = (event: MouseEvent | TouchEvent) => {
    if (!videoPlayer || isZoomed) return;

    const progressBar = event.currentTarget as HTMLDivElement;
    const rect = progressBar.getBoundingClientRect();

    // Handle both mouse and touch events
    let clientX: number;

    if ('touches' in event) {
      // Touch event
      clientX = event.touches[0].clientX;
    } else {
      // Mouse event
      clientX = event.clientX;
    }

    const clickPosition = (clientX - rect.left) / rect.width;
    videoPlayer.currentTime = clickPosition * videoPlayer.duration;

    // Show visual feedback
    progress = clickPosition * 100;

    // Prevent event propagation to avoid triggering play/pause
    event.stopPropagation();
  };

  // IMPROVED: Touch handling for play/pause functionality
  const handleVideoTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;

    // Store touch start time and position
    touchStartTime = Date.now();
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    isTouchMove = false;
  };

  const handleVideoTouchMove = (event: TouchEvent) => {
    if (event.touches.length !== 1) return;

    // Check if touch has moved enough to be considered a swipe/pan
    const dx = Math.abs(event.touches[0].clientX - touchStartX);
    const dy = Math.abs(event.touches[0].clientY - touchStartY);

    if (dx > TOUCH_MOVEMENT_THRESHOLD || dy > TOUCH_MOVEMENT_THRESHOLD) {
      isTouchMove = true;
    }
  };

  // FIXED: Improved touch end handler
  const handleVideoTouchEnd = (event: TouchEvent) => {
    // Calculate touch duration
    const touchDuration = Date.now() - touchStartTime;

    // Only toggle play/pause if it was a simple tap (not a swipe or pan)
    if (!isTouchMove && touchDuration < TAP_DURATION_THRESHOLD && !isPanning && !isZoomed) {
      togglePlayPause();
      event.preventDefault();
    }
  };

  // FIXED: Improved play/pause toggle
  const togglePlayPause = () => {
    if (!videoPlayer) return;

    if (videoPlayer.paused) {
      videoPlayer.play().catch((error) => handleError(error, $t('errors.unable_to_play_video')));
      isPlaying = true;
    } else {
      videoPlayer.pause();
      isPlaying = false;
    }

    // Show controls when toggling play/pause
    showControls = true;
    resetControlsTimeout();
  };

  // Toggle mute state
  const toggleMute = () => {
    if (!videoPlayer) return;

    // Stop event propagation if this function is called from a click event
    // to prevent other handlers from toggling playback
    try {
      event?.stopPropagation();
    } catch (e) {}

    // Set both state variables consistently
    videoPlayer.muted = !videoPlayer.muted;
    $videoViewerMuted = videoPlayer.muted;
    forceMuted = false; // Reset force muted since user explicitly chose a state
  };

  // Add this to your script section
  const handleVolumeChange = (e: Event) => {
    const video = e.currentTarget as HTMLVideoElement;
    // Only update the store value if not in "forced" state
    if (!forceMuted) {
      $videoViewerMuted = video.muted;
    }
  };

  // Format seconds into MM:SS format
  const formatTime = (timeInSeconds: number): string => {
    if (isNaN(timeInSeconds)) return '00:00';

    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);

    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Reset the controls timeout
  const resetControlsTimeout = () => {
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }

    controlsTimeout = setTimeout(() => {
      if (!isZoomed) {
        showControls = false;
      }
    }, 3000);
  };

  // Show controls when user interacts with the video
  const showVideoControls = () => {
    // Don't show regular controls when zoomed in
    if (isZoomed) return;

    showControls = true;
    resetControlsTimeout();
  };

  // Tag related functions
  const toggleTagsPanel = () => {
    showTagsPanel = !showTagsPanel;
  };

  const handleAddTag = () => (isTagFormOpen = true);

  const handleCancelTag = () => (isTagFormOpen = false);

  // IMPROVED: Handle adding tags with better error handling and state updates
  const handleTag = async (tagIds: string[]) => {
    if (!asset?.id) return;

    try {
      isTagProcessingActive = true;
      const ids = await tagAssets({ tagIds, assetIds: [asset.id], showNotification: false });

      if (ids) {
        isTagFormOpen = false;
      }

      // Always refresh asset info
      asset = await getAssetInfo({ id: asset.id });

      // Update selected preset tags
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

  // IMPROVED: Handle removing tags with better error handling and state updates
  const handleRemoveTag = async (tagId: string) => {
    if (!asset?.id) return;

    try {
      isTagProcessingActive = true;
      const ids = await removeTag({ tagIds: [tagId], assetIds: [asset.id], showNotification: false });

      if (ids) {
        // Refresh asset info
        asset = await getAssetInfo({ id: asset.id });

        // Update selected preset tags
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

  // IMPROVED: Fixed the tag application function to work more reliably
  const applyTagToAsset = async (tagValue: string, force: boolean = false) => {
    // Don't proceed if asset is missing
    if (!asset?.id) return false;

    // Get a lowercase version for case-insensitive comparison
    const tagValueLower = tagValue.toLowerCase();

    // Skip if already processing this tag and not forced
    if (!force && processingTagIds.includes(tagValueLower)) {
      return false;
    }

    // Mark as processing immediately to prevent double-clicks
    processingTagIds = [...processingTagIds, tagValueLower];
    isTagProcessingActive = true;

    let success = false;

    try {
      // Find if this tag is already applied to asset
      const tagExists = asset.tags.some((tag) => tag.value.toLowerCase() === tagValueLower);

      if (tagExists) {
        // Remove tag if it exists
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
        // Add tag if we have its ID
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
        // Force refresh asset data
        asset = await getAssetInfo({ id: asset.id });
      }
    } catch (error) {
      console.error(`Error applying tag ${tagValue}:`, error);
      handleError(error, $t(tagExists ? 'errors.unable_to_remove_tag' : 'errors.unable_to_add_tag'));
      success = false;
    } finally {
      // Clear this tag from processing state
      processingTagIds = processingTagIds.filter((id) => id !== tagValueLower);
      if (processingTagIds.length === 0) {
        isTagProcessingActive = false;
      }
    }

    return success;
  };

  // FIXED: Improved tag button handling
  const handleTagButtonClick = (event: MouseEvent, tagValue: string) => {
    // Stop propagation to prevent bubbling
    event?.preventDefault();
    event?.stopPropagation();

    // Call our clean apply function
    applyTagToAsset(tagValue);
  };

  // Check if a preset tag is already applied to the asset
  const isPresetTagSelected = (tagValue: string): boolean => {
    return asset?.tags?.some((tag) => tag.value.toLowerCase() === tagValue.toLowerCase()) || false;
  };

  // Check if a tag is currently being processed
  const isTagBeingProcessed = (tagValue: string): boolean => {
    return processingTagIds.includes(tagValue.toLowerCase());
  };

  // Toggle tag elements visibility
  const toggleTagElementsVisibility = () => {
    showTagElements = !showTagElements;
  };

  // Toggle TOK tags visibility
  const toggleTokTagsVisibility = () => {
    showTokTags = !showTokTags;
  };

  // Filter preset tags based on TOK toggle state
  const getVisiblePresetTags = () => {
    const tokTags = ['lowTOK', 'semiTOK', 'topTOK'];
    const regularTags = ['low', 'semitop', 'top'];

    if (showTokTags) {
      // Show TOK tags and hide regular tags
      return presetTags.filter((tag) => !regularTags.includes(tag.value));
    } else {
      // Show regular tags and hide TOK tags (default behavior)
      return presetTags.filter((tag) => !tokTags.includes(tag.value));
    }
  };

  // ZOOM FUNCTIONALITY

  // Handle touchstart event to detect pinch gestures
  const handleTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      // This is a pinch/zoom gesture
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      startDistance = Math.sqrt(dx * dx + dy * dy);
      startScale = scale;
      event.preventDefault();
    } else if (event.touches.length === 1 && isZoomed) {
      // Start panning with one finger when zoomed in
      lastTouchX = event.touches[0].clientX;
      lastTouchY = event.touches[0].clientY;
      isPanning = true;
    }

    // Also handle basic touch start for play/pause functionality
    handleVideoTouchStart(event);
  };

  // Handle touch move event to compute zoom and pan
  const handleTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      // Pinch/zoom gesture
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Calculate new scale based on finger distance change
      let newScale = startScale * (distance / startDistance);

      // Enforce min/max scale
      newScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);

      // Update scale and check if we're zoomed in
      scale = newScale;
      isZoomed = scale > 1;

      // Show zoom controls when zoomed
      if (isZoomed) {
        showZoomControls = true;
      }

      event.preventDefault();
    } else if (event.touches.length === 1 && isZoomed && isPanning) {
      // Panning with one finger when zoomed in
      const touchX = event.touches[0].clientX;
      const touchY = event.touches[0].clientY;

      // Calculate the distance moved
      const deltaX = touchX - lastTouchX;
      const deltaY = touchY - lastTouchY;

      // Update last touch position
      lastTouchX = touchX;
      lastTouchY = touchY;

      // Update translation (with constraints to prevent too much panning)
      // The max pan distance increases with zoom level
      const maxPan = (scale - 1) * 100;
      translateX = Math.min(Math.max(translateX + deltaX, -maxPan), maxPan);
      translateY = Math.min(Math.max(translateY + deltaY, -maxPan), maxPan);

      event.preventDefault();
    }

    // Also track touch move for play/pause functionality
    handleVideoTouchMove(event);
  };

  // FIXED: Improved touch end handler
  const handleTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) {
      // End of pinch gesture
      startDistance = 0;

      // Reset to normal view if scale is very close to 1
      if (scale < 1.05) {
        resetZoom();
      }
    }

    if (event.touches.length === 0) {
      // End of all touches
      const wasPanning = isPanning;
      isPanning = false;

      // Only handle tap if we weren't panning
      if (!wasPanning) {
        handleVideoTouchEnd(event);
      }
    }
  };

  // Reset zoom to normal view
  const resetZoom = () => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    isZoomed = false;
    showZoomControls = false;

    // Show normal controls again
    showControls = true;
    resetControlsTimeout();
  };

  // Get transform style for the video element
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
      class="h-full w-full object-contain max-h-screen transition-transform duration-100"
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
        // Only handle click for play/pause if not zoomed
        if (!isZoomed) {
          e.stopPropagation();
          togglePlayPause();
        }
      }}
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

    <!-- Fast Forward Button - hide when zoomed -->
    {#if !isZoomed}
      <div class="z-[1001] fixed left-0 bottom-[83%]">
        <button
          class="bg-transparent text-white rounded-full p-2"
          onmousedown={startFastForward}
          onmouseup={stopFastForward}
          onmouseleave={stopFastForward}
          ontouchstart={startFastForward}
          ontouchend={stopFastForward}
        >
          {isForwarding ? '3.5x' : 'S'} ⏩
        </button>
      </div>
    {/if}

    <!-- Auto Skip Button - hide when zoomed -->
    {#if !isZoomed}
      <div class="z-[1001] fixed left-14 bottom-[88%]">
        <button
          class={`bg-black bg-opacity-60 text-white rounded-full p-3 transition-all ${isAutoSkip ? 'bg-immich-primary' : 'bg-black bg-opacity-60'}`}
          onclick={toggleAutoSkip}
        >
          <span class="font-bold">A</span>
          {isAutoSkip ? '4x' : ''}
        </button>
      </div>
    {/if}

    <!-- Reset Zoom Button - only show when zoomed in -->
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

      <!-- Zoom level indicator -->
      <div
        class="z-[1001] fixed left-4 bottom-4 bg-black bg-opacity-60 text-white px-3 py-1 rounded-full"
        transition:fade={{ duration: 150 }}
      >
        {Math.round(scale * 100)}%
      </div>
    {/if}

    <!-- Hide/Show Tags Button - only show when not zoomed -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed}
      <div class="z-[1001] fixed left-0 bottom-[88%]">
        <button
          type="button"
          class="bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-60 transition-all"
          title={showTagElements ? 'Hide Tags' : 'Show Tags'}
          onclick={toggleTagElementsVisibility}
        >
          <Icon path={showTagElements ? mdiEyeOff : mdiEye} size="1.2rem" />
        </button>
      </div>
    {/if}

    <!-- Tag Actions Panel - left side -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed}
      <div class="z-[1001] fixed left-0 bottom-[78%]">
        <div class="flex flex-col">
          <!-- Always visible add tag button -->
          <button
            type="button"
            class="bg-immich-primary text-white rounded-full px-3 py-1 mb-2 flex items-center gap-1 hover:bg-immich-primary/80 transition-all"
            title="Add tag"
            onclick={handleAddTag}
          >
            <Icon path={mdiPlus} size="0.75rem" />
            <span class="text-xs">Add Tag</span>
          </button>

          <!-- Toggle for existing tags -->
          {#if tags.length > 0}
            <button
              type="button"
              class="bg-black bg-opacity-40 text-white rounded-full px-3 py-1 mb-2 flex items-center gap-1"
              title="Toggle Tags"
              onclick={toggleTagsPanel}
            >
              <span class="text-xs">View Tags {showTagsPanel ? '▲' : '▼'}</span>
            </button>
          {/if}

          {#if showTagsPanel && tags.length > 0}
            <!-- Reduced max-width from 300px to 200px -->
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

    <!-- TOK Tags Toggle Button - bottom right, very transparent -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed}
      <div class="z-[1001] fixed right-2 bottom-2">
        <button
          type="button"
          class="bg-black bg-opacity-20 text-white rounded-full p-2 hover:bg-opacity-40 transition-all"
          title={showTokTags ? 'Switch to Regular Tags' : 'Switch to TOK Tags'}
          onclick={toggleTokTagsVisibility}
        >
          <span class="text-xs font-medium">{showTokTags ? 'REG' : 'TOK'}</span>
        </button>
      </div>
    {/if}

    <!-- Preset Tags Quick Access Panel - only show when showTagElements is true -->
    {#if isOwner && asset?.id && !isSharedLink() && !isZoomed && showTagElements}
      <div class="z-[1001] fixed left-2 bottom-[20%]">
        <div class="flex flex-col gap-1">
          {#each getVisiblePresetTags() as presetTag (presetTag.id)}
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
          {/each}
        </div>
      </div>
    {/if}

    <!-- Custom progress bar - overlay on video -->
    {#if showControls && !isZoomed}
      <div class="absolute bottom-6 left-6 right-6 z-[1002] transition-opacity" transition:fade={{ duration: 150 }}>
        <div
          class="relative h-1 bg-black bg-opacity-50 rounded cursor-pointer mb-2"
          onmousedown={handleProgressBarClick}
          ontouchstart={handleProgressBarClick}
        >
          <div class="absolute top-0 left-0 h-full bg-white rounded shadow-sm" style={`width: ${progress}%`}></div>
        </div>

        <!-- Time indicator -->
        <div class="flex justify-between items-center text-xs text-white">
          <span class="bg-black bg-opacity-50 px-2 py-1 rounded">{formatTime(currentTime)}</span>
          <span class="bg-black bg-opacity-50 px-2 py-1 rounded">{formatTime(duration)}</span>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if isTagFormOpen}
  <Portal>
    <TagAssetForm onTag={(tagsIds) => handleTag(tagsIds)} onCancel={handleCancelTag} />
  </Portal>
{/if}
