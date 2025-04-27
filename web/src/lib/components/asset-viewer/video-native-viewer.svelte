<!--
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
      import { mdiClose, mdiPlus, mdiTag } from '@mdi/js';
    
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
      let isLoading = $state(true);
      let assetFileUrl = $state('');
      let forceMuted = $state(false);
      let isScrubbing = $state(false);
      
      // Fast playback variables
      let normalPlaybackRate = 1.0;
      let fastForwardRate = 3.5; // 3.5x speed for fast forward
      let fastRewindRate = -3.5; // Negative value indicates we need to handle rewind specially
      let isForwarding = $state(false);
      let isRewinding = $state(false);
      let rewindInterval: number | null = $state(null); // For manual rewinding
      
      // Progress bar variables
      let currentTime = $state(0);
      let duration = $state(0);
      let progress = $state(0);
      let isProgressBarHovered = $state(false);
      let showControls = $state(true);
      let controlsTimeout: number | null = $state(null);
    
      // Tags related states
      let tags = $derived(asset?.tags || []);
      let isTagFormOpen = $state(false);
      let showTagsPanel = $state(false);
      
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
        { id: 'preset-spin', value: 'spin' },
        { id: 'preset-ass', value: 'ass' },
        { id: 'preset-walk', value: 'walk' },
        { id: 'preset-tongue', value: 'tongue' },
        { id: 'preset-ahegao', value: 'ahegao' },
        { id: 'preset-editing', value: 'editing' },
        { id: 'preset-tit', value: 'tit' }
      ];
      
      // Map to store available tag IDs from the system
      let availableTagsMap = $state<Record<string, string>>({});
      
      // Track which preset tags are selected for the current asset
      let selectedPresetTags = $state<string[]>([]);
    
      onMount(async () => {
        if (videoPlayer) {
          assetFileUrl = getAssetPlaybackUrl({ id: assetId, cacheKey });
          forceMuted = false;
          videoPlayer.load();
        }
        
        // Fetch asset info if not provided
        if (!asset?.id && assetId) {
          try {
            asset = await getAssetInfo({ id: assetId });
          } catch (error) {
            handleError(error, $t('errors.unable_to_load_asset_info'));
          }
        }
        
        // Initialize selected preset tags based on the asset's current tags
        if (asset?.tags) {
          selectedPresetTags = asset.tags
            .filter(tag => presetTags.some(preset => preset.value === tag.value))
            .map(tag => tag.value);
        }
        
        // Get all available tags from the system to find IDs for our preset tags
        try {
          const allTags = await getAllTags();
          
          // Create a mapping of tag values to their IDs
          availableTagsMap = allTags.reduce((map: Record<string, string>, tag) => {
            map[tag.value.toLowerCase()] = tag.id;
            return map;
          }, {});
        } catch (error) {
          handleError(error, $t('errors.unable_to_load_tags'));
        }
        
        // Auto-hide controls after 3 seconds
        controlsTimeout = setTimeout(() => {
          showControls = false;
        }, 3000);
      });
    
      onDestroy(() => {
        if (videoPlayer) {
          videoPlayer.src = '';
        }
        // Clear any intervals when component is destroyed
        if (rewindInterval) {
          clearInterval(rewindInterval);
        }
        
        // Clear any timeouts
        if (controlsTimeout) {
          clearTimeout(controlsTimeout);
        }
      });
    
      const handleCanPlay = async (video: HTMLVideoElement) => {
        try {
          if (!video.paused && !isScrubbing) {
            await video.play();
            onVideoStarted();
          }
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
        if (event.detail.direction === 'left') {
          onNextAsset();
        }
        if (event.detail.direction === 'right') {
          onPreviousAsset();
        }
      };
    
      // Start fast forwarding the video
      const startFastForward = () => {
        if (!videoPlayer || isForwarding) return;
        
        isForwarding = true;
        
        // Pause rewinding if active
        if (isRewinding) {
          stopRewind();
        }
        
        // Store current playback state if needed
        if (videoPlayer.paused) {
          // If video was paused, play it for the fast-forward
          videoPlayer.play().catch(error => handleError(error, $t('errors.unable_to_play_video')));
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
    
      // Special handling for rewind since HTML5 video doesn't support negative playback rates
      const startRewind = () => {
        if (!videoPlayer || isRewinding) return;
        
        isRewinding = true;
        
        // Pause forwarding if active
        if (isForwarding) {
          stopFastForward();
        }
        
        // Make sure video is playing
        if (videoPlayer.paused) {
          videoPlayer.play().catch(error => handleError(error, $t('errors.unable_to_play_video')));
        }
        
        // We'll use an interval to manually adjust the currentTime
        const rewindStep = 0.1; // Small step for smoother rewind
        rewindInterval = setInterval(() => {
          if (!videoPlayer) return;
          
          // Calculate how much to rewind based on desired rate
          const newTime = Math.max(videoPlayer.currentTime - rewindStep, 0);
          videoPlayer.currentTime = newTime;
          
          // If we reached the beginning, stop rewinding
          if (newTime <= 0) {
            stopRewind();
          }
        }, 30); // Update frequently for smoother appearance
      };
    
      // Stop rewinding
      const stopRewind = () => {
        if (!isRewinding) return;
        
        if (rewindInterval) {
          clearInterval(rewindInterval);
          rewindInterval = null;
        }
        
        isRewinding = false;
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
      
      // Progress bar functions
      const updateProgress = () => {
        if (!videoPlayer) return;
        currentTime = videoPlayer.currentTime;
        duration = videoPlayer.duration || 0;
        progress = duration ? (currentTime / duration) * 100 : 0;
      };
      
      const handleProgressBarClick = (event: MouseEvent) => {
        if (!videoPlayer) return;
        const progressBar = event.currentTarget as HTMLDivElement;
        const rect = progressBar.getBoundingClientRect();
        const clickPosition = (event.clientX - rect.left) / rect.width;
        videoPlayer.currentTime = clickPosition * videoPlayer.duration;
      };
      
      const togglePlayPause = () => {
        if (!videoPlayer) return;
        if (videoPlayer.paused) {
          videoPlayer.play();
        } else {
          videoPlayer.pause();
        }
        
        // Show controls when toggling play/pause
        showControls = true;
        resetControlsTimeout();
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
          showControls = false;
        }, 3000);
      };
      
      // Show controls when user interacts with the video
      const showVideoControls = () => {
        showControls = true;
        resetControlsTimeout();
      };
    
      // Tag related functions
      const toggleTagsPanel = () => {
        showTagsPanel = !showTagsPanel;
      };
    
      const handleAddTag = () => (isTagFormOpen = true);
    
      const handleCancelTag = () => (isTagFormOpen = false);
    
      const handleTag = async (tagIds: string[]) => {
        if (!asset?.id) return;
        
        const ids = await tagAssets({ tagIds, assetIds: [asset.id], showNotification: false });
        if (ids) {
          isTagFormOpen = false;
        }
    
        asset = await getAssetInfo({ id: asset.id });
        
        // Update selected preset tags
        if (asset?.tags) {
          selectedPresetTags = asset.tags
            .filter(tag => presetTags.some(preset => preset.value === tag.value))
            .map(tag => tag.value);
        }
      };
    
      const handleRemoveTag = async (tagId: string) => {
        if (!asset?.id) return;
        
        const ids = await removeTag({ tagIds: [tagId], assetIds: [asset.id], showNotification: false });
        if (ids) {
          asset = await getAssetInfo({ id: asset.id });
          
          // Update selected preset tags
          if (asset?.tags) {
            selectedPresetTags = asset.tags
              .filter(tag => presetTags.some(preset => preset.value === tag.value))
              .map(tag => tag.value);
          }
        }
      };
      
      // Function to toggle preset tag with one click
      const togglePresetTag = async (presetTagValue: string) => {
        if (!asset?.id) return;
        
        // Find if this tag already exists on the asset
        const existingTag = asset.tags.find(tag => tag.value === presetTagValue);
        
        if (existingTag) {
          // Remove tag if it exists on the asset
          await handleRemoveTag(existingTag.id);
        } else {
          // Add tag if it doesn't exist on the asset
          
          // Check if tag exists in the system
          const tagId = availableTagsMap[presetTagValue.toLowerCase()];
          
          if (tagId) {
            // Tag exists in system, apply it directly
            await handleTag([tagId]);
          } else {
            // Tag doesn't exist in system, need to create it first
            // For now, just open tag form as fallback
            isTagFormOpen = true;
          }
        }
      };
      
      // Check if a preset tag is already applied to the asset
      const isPresetTagSelected = (tagValue: string): boolean => {
        return asset?.tags?.some(tag => tag.value === tagValue) || false;
      };
    
      let containerWidth = $state(0);
      let containerHeight = $state(0);
    
      $effect(() => {
        if (isFaceEditMode.value) {
          videoPlayer?.pause();
        }
      });
    </script>
    
    <div
      transition:fade={{ duration: 150 }}
      class="flex flex-col h-full select-none"
    >
      <div 
        class="flex-grow relative flex place-content-center place-items-center"
        bind:clientWidth={containerWidth}
        bind:clientHeight={containerHeight}
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
          class="h-full object-contain"
          use:swipe={() => ({})}
          onswipe={onSwipe}
          ontimeupdate={updateProgress}
          oncanplay={(e) => handleCanPlay(e.currentTarget)}
          onended={onVideoEnded}
          onvolumechange={(e) => {
            if (!forceMuted) {
              $videoViewerMuted = e.currentTarget.muted;
            }
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
          onclick={togglePlayPause}
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
    
        <!-- Fast Rewind Button 
        <div class="z-[1001] fixed left-0 bottom-[15%]">
          <button 
            class="bg-transparent text-white rounded-full p-2"
            onmousedown={startRewind}
            onmouseup={stopRewind}
            onmouseleave={stopRewind}
            ontouchstart={startRewind}
            ontouchend={stopRewind}
          >
            ⏪ {isRewinding ? '3.5x' : 'skip'}
          </button>
        </div>
    
        <!-- Fast Forward Button 
        <div class="z-[1001] fixed left-0 bottom-[88%]">
          <button 
            class="bg-transparent text-white rounded-full p-2"
            onmousedown={startFastForward}
            onmouseup={stopFastForward}
            onmouseleave={stopFastForward}
            ontouchstart={startFastForward}
            ontouchend={stopFastForward}
          >
            {isForwarding ? '3.5x' : 'skip'} ⏩
          </button>
        </div>
        
        <!-- Preset Tags Quick Access Panel - Left side of the video 
        {#if isOwner && asset?.id && !isSharedLink()}
          <div class="z-[1001] fixed left-2 bottom-77">
            <div class="flex flex-col gap-1">
              {#each presetTags as presetTag (presetTag.id)}
                <button
                  type="button"
                  class={`px-2 py-1 rounded-lg text-white text-opacity-50 transition-all flex items-center gap-1 ${isPresetTagSelected(presetTag.value) ? 'bg-immich-primary' : 'bg-black bg-opacity-5 hover:bg-immich-primary/50'}`}
                  onclick={() => togglePresetTag(presetTag.value)}
                >
                  <Icon path={mdiTag} size="0.6rem" />
                  <span class="text-xs font-medium text-opacity-50">{presetTag.value}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
        
        <!-- Custom progress bar - shows only when showControls is true 
        {#if showControls}
          <div 
            class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-40 px-2 py-1 transition-opacity mx-auto max-w-[80%]"
            transition:fade={{ duration: 150 }}
          >
            <div 
              class="relative h-2 bg-gray-600 rounded cursor-pointer"
              onmousedown={handleProgressBarClick}
              ontouchstart={handleProgressBarClick}
            >
              <div 
                class="absolute top-0 left-0 h-full bg-immich-primary rounded"
                style={`width: ${progress}%`}
              ></div>
            </div>
            
            <!-- Time indicator 
            <div class="flex justify-between text-xs text-white mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        {/if}
    
        <!-- Tag Button and Panel section 
        {#if isOwner && asset?.id && !isSharedLink()}
          <div class="z-[1001] fixed left-0 bottom-[80%]">
            <div class="flex flex-col">
              <!-- Always visible add tag button 
              <button
                type="button"
                class="bg-immich-primary text-white rounded-full px-3 py-1 mb-2 flex items-center gap-1 hover:bg-immich-primary/80 transition-all"
                title="Add tag"
                onclick={handleAddTag}
              >
                <Icon path={mdiPlus} size="0.75rem" />
                <span class="text-xs">Add Tag</span>
              </button>
              
              <!-- Toggle for existing tags 
              {#if tags.length > 0}
                <button 
                  type="button"
                  class="bg-black bg-opacity-40 text-white text-opacity-5 rounded-full px-3 py-1 mb-2 flex items-center gap-1"
                  title="Toggle Tags"
                  onclick={toggleTagsPanel}
                >
                  <span class="text-xs text-opacity-5">View Tags {showTagsPanel ? '▲' : '▼'}</span>
                </button>
              {/if}
              
              {#if showTagsPanel && tags.length > 0}
                <!-- Reduced max-width from 300px to 200px 
                <div class="bg-black bg-opacity-5 rounded p-2 max-w-[200px]">
                  <div class="flex flex-wrap gap-1">
                    {#each tags as tag (tag.id)}
                      <div class="flex group transition-all">
                        <a
                          class="inline-block h-min whitespace-nowrap pl-2 pr-1 py-0.5 text-center align-baseline leading-none text-gray-100 bg-immich-primary rounded-tl-full rounded-bl-full hover:bg-immich-primary/80 transition-all"
                          href={encodeURI(`${AppRoute.TAGS}/?path=${tag.value}`)}
                        >
                          <p class="text-xs text-opacity-50">
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
      </div>
    </div>
    
    {#if isTagFormOpen}
      <Portal>
        <TagAssetForm onTag={(tagsIds) => handleTag(tagsIds)} onCancel={handleCancelTag} />
      </Portal>
    {/if}

-->



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
  import { mdiClose, mdiPlus, mdiTag, mdiEyeOff, mdiEye } from '@mdi/js';

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
  let isLoading = $state(true);
  let assetFileUrl = $state('');
  let forceMuted = $state(false);
  let isScrubbing = $state(false);
  
  // Fast playback variables
  let normalPlaybackRate = 1.0;
  let fastForwardRate = 3.5; // 3.5x speed for fast forward
  let fastRewindRate = -3.5; // Negative value indicates we need to handle rewind specially
  let isForwarding = $state(false);
  let isRewinding = $state(false);
  let rewindInterval: number | null = $state(null); // For manual rewinding
  
  // Progress bar variables
  let currentTime = $state(0);
  let duration = $state(0);
  let progress = $state(0);
  let isProgressBarHovered = $state(false);
  let showControls = $state(true);
  let controlsTimeout: number | null = $state(null);

  // Tags related states
  let tags = $derived(asset?.tags || []);
  let isTagFormOpen = $state(false);
  let showTagsPanel = $state(false);
  
  // NEW: Toggle visibility for all tag elements
  let showTagElements = $state(true);
  
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
    { id: 'preset-spin', value: 'spin' },
    { id: 'preset-ass', value: 'ass' },
    { id: 'preset-walk', value: 'walk' },
    { id: 'preset-tongue', value: 'tongue' },
    { id: 'preset-ahegao', value: 'ahegao' },
    { id: 'preset-editing', value: 'editing' },
    { id: 'preset-tit', value: 'tit' }
  ];
  
  // Map to store available tag IDs from the system
  let availableTagsMap = $state<Record<string, string>>({});
  
  // Track which preset tags are selected for the current asset
  let selectedPresetTags = $state<string[]>([]);

  onMount(async () => {
    if (videoPlayer) {
      assetFileUrl = getAssetPlaybackUrl({ id: assetId, cacheKey });
      forceMuted = false;
      videoPlayer.load();
    }
    
    // Fetch asset info if not provided
    if (!asset?.id && assetId) {
      try {
        asset = await getAssetInfo({ id: assetId });
      } catch (error) {
        handleError(error, $t('errors.unable_to_load_asset_info'));
      }
    }
    
    // Initialize selected preset tags based on the asset's current tags
    if (asset?.tags) {
      selectedPresetTags = asset.tags
        .filter(tag => presetTags.some(preset => preset.value === tag.value))
        .map(tag => tag.value);
    }
    
    // Get all available tags from the system to find IDs for our preset tags
    try {
      const allTags = await getAllTags();
      
      // Create a mapping of tag values to their IDs
      availableTagsMap = allTags.reduce((map: Record<string, string>, tag) => {
        map[tag.value.toLowerCase()] = tag.id;
        return map;
      }, {});
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_tags'));
    }
    
    // Auto-hide controls after 3 seconds
    controlsTimeout = setTimeout(() => {
      showControls = false;
    }, 3000);
    
    // Reset showTagElements when changing assets
    showTagElements = true;
  });

  onDestroy(() => {
    if (videoPlayer) {
      videoPlayer.src = '';
    }
    // Clear any intervals when component is destroyed
    if (rewindInterval) {
      clearInterval(rewindInterval);
    }
    
    // Clear any timeouts
    if (controlsTimeout) {
      clearTimeout(controlsTimeout);
    }
  });

  const handleCanPlay = async (video: HTMLVideoElement) => {
    try {
      if (!video.paused && !isScrubbing) {
        await video.play();
        onVideoStarted();
      }
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
    if (event.detail.direction === 'left') {
      onNextAsset();
    }
    if (event.detail.direction === 'right') {
      onPreviousAsset();
    }
  };

  // IMPROVED: Start fast forwarding the video without resetting position
  const startFastForward = () => {
    if (!videoPlayer || isForwarding) return;
    
    isForwarding = true;
    
    // Pause rewinding if active
    if (isRewinding) {
      stopRewind();
    }
    
    // Store current playback state if needed
    if (videoPlayer.paused) {
      // If video was paused, play it for the fast-forward
      videoPlayer.play().catch(error => handleError(error, $t('errors.unable_to_play_video')));
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

  // IMPROVED: Special handling for rewind without resetting position
  const startRewind = () => {
    if (!videoPlayer || isRewinding) return;
    
    isRewinding = true;
    
    // Pause forwarding if active
    if (isForwarding) {
      stopFastForward();
    }
    
    // Make sure video is playing
    if (videoPlayer.paused) {
      videoPlayer.play().catch(error => handleError(error, $t('errors.unable_to_play_video')));
    }
    
    // We'll use an interval to manually adjust the currentTime
    const rewindStep = 0.1; // Small step for smoother rewind
    rewindInterval = setInterval(() => {
      if (!videoPlayer) return;
      
      // Calculate how much to rewind based on desired rate
      const newTime = Math.max(videoPlayer.currentTime - rewindStep, 0);
      videoPlayer.currentTime = newTime;
      
      // If we reached the beginning, stop rewinding
      if (newTime <= 0) {
        stopRewind();
      }
    }, 30); // Update frequently for smoother appearance
  };

  // Stop rewinding
  const stopRewind = () => {
    if (!isRewinding) return;
    
    if (rewindInterval) {
      clearInterval(rewindInterval);
      rewindInterval = null;
    }
    
    isRewinding = false;
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
  
  // Progress bar functions
  const updateProgress = () => {
    if (!videoPlayer) return;
    currentTime = videoPlayer.currentTime;
    duration = videoPlayer.duration || 0;
    progress = duration ? (currentTime / duration) * 100 : 0;
  };
  
  const handleProgressBarClick = (event: MouseEvent) => {
    if (!videoPlayer) return;
    const progressBar = event.currentTarget as HTMLDivElement;
    const rect = progressBar.getBoundingClientRect();
    const clickPosition = (event.clientX - rect.left) / rect.width;
    videoPlayer.currentTime = clickPosition * videoPlayer.duration;
  };
  
  const togglePlayPause = () => {
    if (!videoPlayer) return;
    if (videoPlayer.paused) {
      videoPlayer.play();
    } else {
      videoPlayer.pause();
    }
    
    // Show controls when toggling play/pause
    showControls = true;
    resetControlsTimeout();
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
      showControls = false;
    }, 3000);
  };
  
  // Show controls when user interacts with the video
  const showVideoControls = () => {
    showControls = true;
    resetControlsTimeout();
  };

  // Tag related functions
  const toggleTagsPanel = () => {
    showTagsPanel = !showTagsPanel;
  };

  const handleAddTag = () => (isTagFormOpen = true);

  const handleCancelTag = () => (isTagFormOpen = false);

  const handleTag = async (tagIds: string[]) => {
    if (!asset?.id) return;
    
    const ids = await tagAssets({ tagIds, assetIds: [asset.id], showNotification: false });
    if (ids) {
      isTagFormOpen = false;
    }

    asset = await getAssetInfo({ id: asset.id });
    
    // Update selected preset tags
    if (asset?.tags) {
      selectedPresetTags = asset.tags
        .filter(tag => presetTags.some(preset => preset.value === tag.value))
        .map(tag => tag.value);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!asset?.id) return;
    
    const ids = await removeTag({ tagIds: [tagId], assetIds: [asset.id], showNotification: false });
    if (ids) {
      asset = await getAssetInfo({ id: asset.id });
      
      // Update selected preset tags
      if (asset?.tags) {
        selectedPresetTags = asset.tags
          .filter(tag => presetTags.some(preset => preset.value === tag.value))
          .map(tag => tag.value);
      }
    }
  };
  
  // Function to toggle preset tag with one click
  const togglePresetTag = async (presetTagValue: string) => {
    if (!asset?.id) return;
    
    // Find if this tag already exists on the asset
    const existingTag = asset.tags.find(tag => tag.value === presetTagValue);
    
    if (existingTag) {
      // Remove tag if it exists on the asset
      await handleRemoveTag(existingTag.id);
    } else {
      // Add tag if it doesn't exist on the asset
      
      // Check if tag exists in the system
      const tagId = availableTagsMap[presetTagValue.toLowerCase()];
      
      if (tagId) {
        // Tag exists in system, apply it directly
        await handleTag([tagId]);
      } else {
        // Tag doesn't exist in system, need to create it first
        // For now, just open tag form as fallback
        isTagFormOpen = true;
      }
    }
  };
  
  // Check if a preset tag is already applied to the asset
  const isPresetTagSelected = (tagValue: string): boolean => {
    return asset?.tags?.some(tag => tag.value === tagValue) || false;
  };
  
  // NEW: Toggle tag elements visibility
  const toggleTagElementsVisibility = () => {
    showTagElements = !showTagElements;
  };

  let containerWidth = $state(0);
  let containerHeight = $state(0);

  $effect(() => {
    if (isFaceEditMode.value) {
      videoPlayer?.pause();
    }
  });
</script>

<div
  transition:fade={{ duration: 150 }}
  class="flex flex-col h-full select-none"
>
  <div 
    class="flex-grow relative flex place-content-center place-items-center"
    bind:clientWidth={containerWidth}
    bind:clientHeight={containerHeight}
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
      class="h-full w-full object-contain max-h-screen"
      use:swipe={() => ({})}
      onswipe={onSwipe}
      ontimeupdate={updateProgress}
      oncanplay={(e) => handleCanPlay(e.currentTarget)}
      onended={onVideoEnded}
      onvolumechange={(e) => {
        if (!forceMuted) {
          $videoViewerMuted = e.currentTarget.muted;
        }
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
      onclick={togglePlayPause}
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

    <!-- Fast Rewind Button -->
    <div class="z-[1001] fixed left-0 bottom-[15%]">
      <button 
        class="bg-transparent text-white rounded-full p-2"
        onmousedown={startRewind}
        onmouseup={stopRewind}
        onmouseleave={stopRewind}
        ontouchstart={startRewind}
        ontouchend={stopRewind}
      >
        ⏪ {isRewinding ? '3.5x' : 'skip'}
      </button>
    </div>

    <!-- Fast Forward Button -->
    <div class="z-[1001] fixed left-0 bottom-[88%]">
      <button 
        class="bg-transparent text-white rounded-full p-2"
        onmousedown={startFastForward}
        onmouseup={stopFastForward}
        onmouseleave={stopFastForward}
        ontouchstart={startFastForward}
        ontouchend={stopFastForward}
      >
        {isForwarding ? '3.5x' : 'skip'} ⏩
      </button>
    </div>
    
    <!-- MOVED: Hide/Show Tags Button - positioned in bottom left, below rewind button -->
    {#if isOwner && asset?.id && !isSharedLink()}
      <div class="z-[1001] fixed left-0 bottom-[7%]">
        <button
          type="button"
          class="bg-black bg-opacity-40 text-white rounded-full p-2 hover:bg-opacity-60 transition-all"
          title={showTagElements ? "Hide Tags" : "Show Tags"}
          onclick={toggleTagElementsVisibility}
        >
          <Icon path={showTagElements ? mdiEyeOff : mdiEye} size="1.2rem" />
        </button>
      </div>
    {/if}
    
    <!-- Preset Tags Quick Access Panel - Left side of the video -->
    {#if isOwner && asset?.id && !isSharedLink() && showTagElements}
      <div class="z-[1001] fixed left-2 bottom-77">
        <div class="flex flex-col gap-1">
          {#each presetTags as presetTag (presetTag.id)}
            <button
              type="button"
              class={`px-2 py-1 rounded-lg text-white text-opacity-50 transition-all flex items-center gap-1 ${isPresetTagSelected(presetTag.value) ? 'bg-immich-primary' : 'bg-black bg-opacity-5 hover:bg-immich-primary/50'}`}
              onclick={() => togglePresetTag(presetTag.value)}
            >
              <Icon path={mdiTag} size="0.6rem" />
              <span class="text-xs font-medium text-opacity-50">{presetTag.value}</span>
            </button>
          {/each}
        </div>
      </div>
    {/if}
    
    <!-- Custom progress bar - shows only when showControls is true -->
    {#if showControls}
      <div 
        class="absolute bottom-0 left-0 right-0 bg-black bg-opacity-40 px-2 py-1 transition-opacity mx-auto max-w-[80%]"
        transition:fade={{ duration: 150 }}
      >
        <div 
          class="relative h-2 bg-gray-600 rounded cursor-pointer"
          onmousedown={handleProgressBarClick}
          ontouchstart={handleProgressBarClick}
        >
          <div 
            class="absolute top-0 left-0 h-full bg-immich-primary rounded"
            style={`width: ${progress}%`}
          ></div>
        </div>
        
        <!-- Time indicator -->
        <div class="flex justify-between text-xs text-white mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    {/if}

    <!-- Tag Button and Panel section -->
    {#if isOwner && asset?.id && !isSharedLink() && showTagElements}
      <div class="z-[1001] fixed left-0 bottom-[80%]">
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
              class="bg-black bg-opacity-40 text-white text-opacity-5 rounded-full px-3 py-1 mb-2 flex items-center gap-1"
              title="Toggle Tags"
              onclick={toggleTagsPanel}
            >
              <span class="text-xs text-opacity-5">View Tags {showTagsPanel ? '▲' : '▼'}</span>
            </button>
          {/if}
          
          {#if showTagsPanel && tags.length > 0}
            <!-- Reduced max-width from 300px to 200px -->
            <div class="bg-black bg-opacity-5 rounded p-2 max-w-[200px]">
              <div class="flex flex-wrap gap-1">
                {#each tags as tag (tag.id)}
                  <div class="flex group transition-all">
                    <a
                      class="inline-block h-min whitespace-nowrap pl-2 pr-1 py-0.5 text-center align-baseline leading-none text-gray-100 bg-immich-primary rounded-tl-full rounded-bl-full hover:bg-immich-primary/80 transition-all"
                      href={encodeURI(`${AppRoute.TAGS}/?path=${tag.value}`)}
                    >
                      <p class="text-xs text-opacity-50">
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
  </div>
</div>

{#if isTagFormOpen}
  <Portal>
    <TagAssetForm onTag={(tagsIds) => handleTag(tagsIds)} onCancel={handleCancelTag} />
  </Portal>
{/if}