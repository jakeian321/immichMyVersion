<script lang="ts">
  import { focusTrap } from '$lib/actions/focus-trap';
  import type { Action, OnAction, PreAction } from '$lib/components/asset-viewer/actions/action';
  import MotionPhotoAction from '$lib/components/asset-viewer/actions/motion-photo-action.svelte';
  import NextAssetAction from '$lib/components/asset-viewer/actions/next-asset-action.svelte';
  import PreviousAssetAction from '$lib/components/asset-viewer/actions/previous-asset-action.svelte';
  import { AssetAction, ProjectionType } from '$lib/constants';
  import { updateNumberOfComments } from '$lib/stores/activity.store';
  import { closeEditorCofirm } from '$lib/stores/asset-editor.store';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { isShowDetail } from '$lib/stores/preferences.store';
  import { SlideshowNavigation, SlideshowState, slideshowStore } from '$lib/stores/slideshow.store';
  import { user } from '$lib/stores/user.store';
  import { websocketEvents } from '$lib/stores/websocket';
  import { getAssetJobMessage, getSharedLink, handlePromiseError, isSharedLink } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { SlideshowHistory } from '$lib/utils/slideshow-history';
  import {
    AssetJobName,
    AssetTypeEnum,
    ReactionType,
    createActivity,
    deleteActivity,
    getActivities,
    getActivityStatistics,
    getAllAlbums,
    getStack,
    runAssetJobs,
    type ActivityResponseDto,
    type AlbumResponseDto,
    type AssetResponseDto,
    type PersonResponseDto,
    type StackResponseDto,
  } from '@immich/sdk';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import { fly } from 'svelte/transition';
  import Thumbnail from '../assets/thumbnail/thumbnail.svelte';
  import { NotificationType, notificationController } from '../shared-components/notification/notification';
  import ActivityStatus from './activity-status.svelte';
  import ActivityViewer from './activity-viewer.svelte';
  import AssetViewerNavBar from './asset-viewer-nav-bar.svelte';
  import DetailPanel from './detail-panel.svelte';
  import CropArea from './editor/crop-tool/crop-area.svelte';
  import EditorPanel from './editor/editor-panel.svelte';
  import ImagePanoramaViewer from './image-panorama-viewer.svelte';
  import PhotoViewer from './photo-viewer.svelte';
  import SlideshowBar from './slideshow-bar.svelte';
  import VideoViewer from './video-wrapper-viewer.svelte';

  type HasAsset = boolean;

  interface Props {
    asset: AssetResponseDto;
    preloadAssets?: AssetResponseDto[];
    showNavigation?: boolean;
    withStacked?: boolean;
    isShared?: boolean;
    album?: AlbumResponseDto | null;
    person?: PersonResponseDto | null;
    preAction?: PreAction | undefined;
    onAction?: OnAction | undefined;
    reactions?: ActivityResponseDto[];
    showCloseButton?: boolean;
    onClose: (dto: { asset: AssetResponseDto }) => void;
    onNext: () => Promise<HasAsset>;
    onPrevious: () => Promise<HasAsset>;
    onRandom: () => Promise<AssetResponseDto | undefined>;
    copyImage?: () => Promise<void>;
  }

  let {
    asset = $bindable(),
    preloadAssets = $bindable([]),
    showNavigation = true,
    withStacked = false,
    isShared = false,
    album = null,
    person = null,
    preAction = undefined,
    onAction = undefined,
    reactions = $bindable([]),
    showCloseButton,
    onClose,
    onNext,
    onPrevious,
    onRandom,
    copyImage = $bindable(),
  }: Props = $props();

  const { setAsset } = assetViewingStore;
  const {
    restartProgress: restartSlideshowProgress,
    stopProgress: stopSlideshowProgress,
    slideshowNavigation,
    slideshowState,
    slideshowTransition,
  } = slideshowStore;

  let appearsInAlbums: AlbumResponseDto[] = $state([]);
  let shouldPlayMotionPhoto = $state(false);
  let sharedLink = getSharedLink();
  let enableDetailPanel = asset.hasMetadata;
  let slideshowStateUnsubscribe: () => void;
  let shuffleSlideshowUnsubscribe: () => void;
  let previewStackedAsset: AssetResponseDto | undefined = $state();
  let isShowActivity = $state(false);
  let isShowEditor = $state(false);
  let isLiked: ActivityResponseDto | null = $state(null);
  let numberOfComments = $state(0);
  let fullscreenElement = $state<Element>();
  let unsubscribes: (() => void)[] = [];
  let selectedEditType: string = $state('');
  let stack: StackResponseDto | null = $state(null);

  let zoomToggle = $state(() => void 0);

  const refreshStack = async () => {
    if (isSharedLink()) {
      return;
    }

    if (asset.stack) {
      stack = await getStack({ id: asset.stack.id });
    }

    if (!stack?.assets.some(({ id }) => id === asset.id)) {
      stack = null;
    }

    untrack(() => {
      if (stack && stack?.assets.length > 1) {
        preloadAssets.push(stack.assets[1]);
      }
    });
  };

  const handleAddComment = () => {
    numberOfComments++;
    updateNumberOfComments(1);
  };

  const handleRemoveComment = () => {
    numberOfComments--;
    updateNumberOfComments(-1);
  };

  const handleFavorite = async () => {
    if (album && album.isActivityEnabled) {
      try {
        if (isLiked) {
          const activityId = isLiked.id;
          await deleteActivity({ id: activityId });
          reactions = reactions.filter((reaction) => reaction.id !== activityId);
          isLiked = null;
        } else {
          const data = await createActivity({
            activityCreateDto: { albumId: album.id, assetId: asset.id, type: ReactionType.Like },
          });

          isLiked = data;
          reactions = [...reactions, isLiked];
        }
      } catch (error) {
        handleError(error, $t('errors.unable_to_change_favorite'));
      }
    }
  };

  const getFavorite = async () => {
    if (album && $user) {
      try {
        const data = await getActivities({
          userId: $user.id,
          assetId: asset.id,
          albumId: album.id,
          $type: ReactionType.Like,
        });
        isLiked = data.length > 0 ? data[0] : null;
      } catch (error) {
        handleError(error, $t('errors.unable_to_load_liked_status'));
      }
    }
  };

  const getNumberOfComments = async () => {
    if (album) {
      try {
        const { comments } = await getActivityStatistics({ assetId: asset.id, albumId: album.id });
        numberOfComments = comments;
      } catch (error) {
        handleError(error, $t('errors.unable_to_get_comments_number'));
      }
    }
  };

  const onAssetUpdate = ({ asset: assetUpdate }: { event: 'upload' | 'update'; asset: AssetResponseDto }) => {
    if (assetUpdate.id === asset.id) {
      asset = assetUpdate;
    }
  };

  onMount(async () => {
    unsubscribes.push(
      websocketEvents.on('on_upload_success', (asset) => onAssetUpdate({ event: 'upload', asset })),
      websocketEvents.on('on_asset_update', (asset) => onAssetUpdate({ event: 'update', asset })),
    );

    slideshowStateUnsubscribe = slideshowState.subscribe((value) => {
      if (value === SlideshowState.PlaySlideshow) {
        slideshowHistory.reset();
        slideshowHistory.queue(asset);
        handlePromiseError(handlePlaySlideshow());
      } else if (value === SlideshowState.StopSlideshow) {
        handlePromiseError(handleStopSlideshow());
      }
    });

    shuffleSlideshowUnsubscribe = slideshowNavigation.subscribe((value) => {
      if (value === SlideshowNavigation.Shuffle) {
        slideshowHistory.reset();
        slideshowHistory.queue(asset);
      }
    });

    if (!sharedLink) {
      await handleGetAllAlbums();
    }
  });

  onDestroy(() => {
    if (slideshowStateUnsubscribe) {
      slideshowStateUnsubscribe();
    }

    if (shuffleSlideshowUnsubscribe) {
      shuffleSlideshowUnsubscribe();
    }

    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  });

  const handleGetAllAlbums = async () => {
    if (isSharedLink()) {
      return;
    }

    try {
      appearsInAlbums = await getAllAlbums({ assetId: asset.id });
    } catch (error) {
      console.error('Error getting album that asset belong to', error);
    }
  };

  const handleOpenActivity = () => {
    if ($isShowDetail) {
      $isShowDetail = false;
    }
    isShowActivity = !isShowActivity;
  };

  const toggleDetailPanel = () => {
    isShowActivity = false;
    $isShowDetail = !$isShowDetail;
  };

  const closeViewer = () => {
    onClose({ asset });
  };

  const closeEditor = () => {
    closeEditorCofirm(() => {
      isShowEditor = false;
    });
  };

  const navigateAsset = async (order?: 'previous' | 'next', e?: Event) => {
    if (!order) {
      if ($slideshowState === SlideshowState.PlaySlideshow) {
        order = $slideshowNavigation === SlideshowNavigation.AscendingOrder ? 'previous' : 'next';
      } else {
        return;
      }
    }

    e?.stopPropagation();

    let hasNext = false;

    if ($slideshowState === SlideshowState.PlaySlideshow && $slideshowNavigation === SlideshowNavigation.Shuffle) {
      hasNext = order === 'previous' ? slideshowHistory.previous() : slideshowHistory.next();
      if (!hasNext) {
        const asset = await onRandom();
        if (asset) {
          slideshowHistory.queue(asset);
          hasNext = true;
        }
      }
    } else {
      hasNext = order === 'previous' ? await onPrevious() : await onNext();
    }

    if ($slideshowState === SlideshowState.PlaySlideshow) {
      if (hasNext) {
        $restartSlideshowProgress = true;
      } else {
        await handleStopSlideshow();
      }
    }
  };

  // const showEditorHandler = () => {
  //   if (isShowActivity) {
  //     isShowActivity = false;
  //   }
  //   isShowEditor = !isShowEditor;
  // };

  const handleRunJob = async (name: AssetJobName) => {
    try {
      await runAssetJobs({ assetJobsDto: { assetIds: [asset.id], name } });
      notificationController.show({ type: NotificationType.Info, message: $getAssetJobMessage(name) });
    } catch (error) {
      handleError(error, $t('errors.unable_to_submit_job'));
    }
  };

  /**
   * Slide show mode
   */

  let assetViewerHtmlElement = $state<HTMLElement>();

  const slideshowHistory = new SlideshowHistory((asset) => {
    setAsset(asset);
    $restartSlideshowProgress = true;
  });

  const handleVideoStarted = () => {
    if ($slideshowState === SlideshowState.PlaySlideshow) {
      $stopSlideshowProgress = true;
    }
  };

  const handlePlaySlideshow = async () => {
    try {
      await assetViewerHtmlElement?.requestFullscreen?.();
    } catch (error) {
      handleError(error, $t('errors.unable_to_enter_fullscreen'));
      $slideshowState = SlideshowState.StopSlideshow;
    }
  };

  const handleStopSlideshow = async () => {
    try {
      if (document.fullscreenElement) {
        document.body.style.cursor = '';
        await document.exitFullscreen();
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_exit_fullscreen'));
    } finally {
      $stopSlideshowProgress = true;
      $slideshowState = SlideshowState.None;
    }
  };

  const handleStackedAssetMouseEvent = (isMouseOver: boolean, asset: AssetResponseDto) => {
    previewStackedAsset = isMouseOver ? asset : undefined;
  };
  const handlePreAction = (action: Action) => {
    preAction?.(action);
  };
  const handleAction = async (action: Action) => {
    switch (action.type) {
      case AssetAction.ADD_TO_ALBUM: {
        await handleGetAllAlbums();
        break;
      }

      case AssetAction.KEEP_THIS_DELETE_OTHERS:
      case AssetAction.UNSTACK: {
        closeViewer();
        break;
      }
    }

    onAction?.(action);
  };

  const handleUpdateSelectedEditType = (type: string) => {
    selectedEditType = type;
  };
  let isFullScreen = $derived(fullscreenElement !== null);
  $effect(() => {
    if (asset) {
      previewStackedAsset = undefined;
      handlePromiseError(refreshStack());
    }
  });
  $effect(() => {
    if (album && !album.isActivityEnabled && numberOfComments === 0) {
      isShowActivity = false;
    }
  });
  $effect(() => {
    if (isShared && asset.id) {
      handlePromiseError(getFavorite());
      handlePromiseError(getNumberOfComments());
    }
  });
  $effect(() => {
    if (asset.id && !sharedLink) {
      handlePromiseError(handleGetAllAlbums());
    }
  });
</script>

<svelte:document bind:fullscreenElement />

<section
  id="immich-asset-viewer"
  class="fixed left-0 top-0 z-[1001] grid size-full grid-cols-4 grid-rows-[64px_1fr] overflow-hidden bg-black"
  use:focusTrap
>
  <!-- Top navigation bar -->
  {#if $slideshowState === SlideshowState.None && !isShowEditor}
    <div class="z-[1002] col-span-4 col-start-1 row-span-1 row-start-1 transition-transform">
      <AssetViewerNavBar
        {asset}
        {album}
        {person}
        {stack}
        {showCloseButton}
        showDetailButton={enableDetailPanel}
        showSlideshow={true}
        onZoomImage={zoomToggle}
        onCopyImage={copyImage}
        preAction={handlePreAction}
        onAction={handleAction}
        onRunJob={handleRunJob}
        onPlaySlideshow={() => ($slideshowState = SlideshowState.PlaySlideshow)}
        onShowDetail={toggleDetailPanel}
        onClose={closeViewer}
      >
        {#snippet motionPhoto()}
          <MotionPhotoAction
            isPlaying={shouldPlayMotionPhoto}
            onClick={(shouldPlay) => (shouldPlayMotionPhoto = shouldPlay)}
          />
        {/snippet}
      </AssetViewerNavBar>
    </div>
  {/if}

  {#if $slideshowState === SlideshowState.None && showNavigation && !isShowEditor}
    <!-- commented out this 888999888 and added line 461 <div class="z-[1001] my-auto column-span-1 col-start-1 row-span-full row-start-1 justify-self-start"> -->
    <div class="z-[1001] fixed left-[0%] bottom-[10%]">
      <PreviousAssetAction onPreviousAsset={() => navigateAsset('previous')} />
    </div>
  {/if}

  <!-- Asset Viewer -->
  <div class="z-[1000] relative col-start-1 col-span-4 row-start-1 row-span-full" bind:this={assetViewerHtmlElement}>
    {#if $slideshowState != SlideshowState.None}
      <div class="z-[1000] absolute w-full flex">
        <SlideshowBar
          {isFullScreen}
          onSetToFullScreen={() => assetViewerHtmlElement?.requestFullscreen?.()}
          onPrevious={() => navigateAsset('previous')}
          onNext={() => navigateAsset('next')}
          onClose={() => ($slideshowState = SlideshowState.StopSlideshow)}
        />
      </div>
    {/if}

    {#if previewStackedAsset}
      {#key previewStackedAsset.id}
        {#if previewStackedAsset.type === AssetTypeEnum.Image}
          <PhotoViewer
            bind:zoomToggle
            bind:copyImage
            asset={previewStackedAsset}
            {preloadAssets}
            onPreviousAsset={() => navigateAsset('previous')}
            onNextAsset={() => navigateAsset('next')}
            haveFadeTransition={false}
            {sharedLink}
          />
        {:else}
          <VideoViewer
            assetId={previewStackedAsset.id}
            cacheKey={previewStackedAsset.thumbhash}
            projectionType={previewStackedAsset.exifInfo?.projectionType}
            loopVideo={true}
            onPreviousAsset={() => navigateAsset('previous')}
            onNextAsset={() => navigateAsset('next')}
            onClose={closeViewer}
            onVideoEnded={() => navigateAsset()}
            onVideoStarted={handleVideoStarted}
          />
        {/if}
      {/key}
    {:else}
      {#key asset.id}
        {#if asset.type === AssetTypeEnum.Image}
          {#if shouldPlayMotionPhoto && asset.livePhotoVideoId}
            <VideoViewer
              assetId={asset.livePhotoVideoId}
              cacheKey={asset.thumbhash}
              projectionType={asset.exifInfo?.projectionType}
              loopVideo={$slideshowState !== SlideshowState.PlaySlideshow}
              onPreviousAsset={() => navigateAsset('previous')}
              onNextAsset={() => navigateAsset('next')}
              onVideoEnded={() => (shouldPlayMotionPhoto = false)}
            />
          {:else if asset.exifInfo?.projectionType === ProjectionType.EQUIRECTANGULAR || (asset.originalPath && asset.originalPath
                .toLowerCase()
                .endsWith('.insp'))}
            <ImagePanoramaViewer {asset} />
          {:else if isShowEditor && selectedEditType === 'crop'}
            <CropArea {asset} />
          {:else}
            <PhotoViewer
              bind:zoomToggle
              bind:copyImage
              {asset}
              {preloadAssets}
              onPreviousAsset={() => navigateAsset('previous')}
              onNextAsset={() => navigateAsset('next')}
              {sharedLink}
              haveFadeTransition={$slideshowState === SlideshowState.None || $slideshowTransition}
            />
          {/if}
        {:else}
          <VideoViewer
            assetId={asset.id}
            cacheKey={asset.thumbhash}
            projectionType={asset.exifInfo?.projectionType}
            loopVideo={$slideshowState !== SlideshowState.PlaySlideshow}
            onPreviousAsset={() => navigateAsset('previous')}
            onNextAsset={() => navigateAsset('next')}
            onClose={closeViewer}
            onVideoEnded={() => navigateAsset()}
            onVideoStarted={handleVideoStarted}
          />
        {/if}
        {#if $slideshowState === SlideshowState.None && isShared && ((album && album.isActivityEnabled) || numberOfComments > 0)}
          <div class="z-[9999] absolute bottom-0 right-0 mb-20 mr-8">
            <ActivityStatus
              disabled={!album?.isActivityEnabled}
              {isLiked}
              {numberOfComments}
              onFavorite={handleFavorite}
              onOpenActivityTab={handleOpenActivity}
            />
          </div>
        {/if}
      {/key}
    {/if}
  </div>

  {#if $slideshowState === SlideshowState.None && showNavigation && !isShowEditor}
    <!-- <div class="z-[1001] my-auto col-span-1 col-start-4 row-span-full row-start-1 justify-self-end"> -->
    <div class="z-[1001] fixed left-[20%] bottom-[88%]">
      <NextAssetAction onNextAsset={() => navigateAsset('next')} />
    </div>
  {/if}

  {#if enableDetailPanel && $slideshowState === SlideshowState.None && $isShowDetail && !isShowEditor}
    <div
      transition:fly={{ duration: 150 }}
      id="detail-panel"
      class="z-[1002] row-start-1 row-span-4 w-[360px] overflow-y-auto bg-immich-bg transition-all dark:border-l dark:border-l-immich-dark-gray dark:bg-immich-dark-bg"
      translate="yes"
    >
      <DetailPanel {asset} currentAlbum={album} albums={appearsInAlbums} onClose={() => ($isShowDetail = false)} />
    </div>
  {/if}

  {#if isShowEditor}
    <div
      transition:fly={{ duration: 150 }}
      id="editor-panel"
      class="z-[1002] row-start-1 row-span-4 w-[400px] overflow-y-auto bg-immich-bg transition-all dark:border-l dark:border-l-immich-dark-gray dark:bg-immich-dark-bg"
      translate="yes"
    >
      <EditorPanel {asset} onUpdateSelectedType={handleUpdateSelectedEditType} onClose={closeEditor} />
    </div>
  {/if}

  {#if stack && withStacked}
    {@const stackedAssets = stack.assets}
    <div
      id="stack-slideshow"
      class="z-[1002] flex place-item-center place-content-center absolute bottom-0 w-full col-span-4 col-start-1 overflow-x-auto horizontal-scrollbar"
    >
      <div class="relative w-full">
        {#each stackedAssets as stackedAsset (stackedAsset.id)}
          <div
            class={['inline-block px-1 relative transition-all pb-2']}
            style:bottom={stackedAsset.id === asset.id ? '0' : '-10px'}
          >
            <Thumbnail
              imageClass={{ 'border-2 border-white': stackedAsset.id === asset.id }}
              brokenAssetClass="text-xs"
              dimmed={stackedAsset.id !== asset.id}
              asset={stackedAsset}
              onClick={(stackedAsset) => {
                asset = stackedAsset;
              }}
              onMouseEvent={({ isMouseOver }) => handleStackedAssetMouseEvent(isMouseOver, stackedAsset)}
              readonly
              thumbnailSize={stackedAsset.id === asset.id ? 65 : 60}
              showStackedIcon={false}
              disableLinkMouseOver
            />

            {#if stackedAsset.id === asset.id}
              <div class="w-full flex place-items-center place-content-center">
                <div class="w-2 h-2 bg-white rounded-full flex mt-[2px]"></div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  {#if isShared && album && isShowActivity && $user}
    <div
      transition:fly={{ duration: 150 }}
      id="activity-panel"
      class="z-[1002] row-start-1 row-span-5 w-[360px] md:w-[460px] overflow-y-auto bg-immich-bg transition-all dark:border-l dark:border-l-immich-dark-gray dark:bg-immich-dark-bg"
      translate="yes"
    >
      <ActivityViewer
        user={$user}
        disabled={!album.isActivityEnabled}
        assetType={asset.type}
        albumOwnerId={album.ownerId}
        albumId={album.id}
        assetId={asset.id}
        {isLiked}
        bind:reactions
        onAddComment={handleAddComment}
        onDeleteComment={handleRemoveComment}
        onDeleteLike={() => (isLiked = null)}
        onClose={() => (isShowActivity = false)}
      />
    </div>
  {/if}
</section>

<style>
  #immich-asset-viewer {
    contain: layout;
  }

  .horizontal-scrollbar::-webkit-scrollbar {
    width: 8px;
    height: 10px;
  }

  /* Track */
  .horizontal-scrollbar::-webkit-scrollbar-track {
    background: #000000;
    border-radius: 16px;
  }

  /* Handle */
  .horizontal-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(159, 159, 159, 0.408);
    border-radius: 16px;
  }

  /* Handle on hover */
  .horizontal-scrollbar::-webkit-scrollbar-thumb:hover {
    background: #adcbfa;
    border-radius: 16px;
  }
</style>
