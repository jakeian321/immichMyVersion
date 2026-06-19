<script lang="ts">
  import { afterNavigate, goto, onNavigate } from '$app/navigation';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import AlbumDescription from '$lib/components/album-page/album-description.svelte';
  import AlbumOptions from '$lib/components/album-page/album-options.svelte';
  import AlbumSummary from '$lib/components/album-page/album-summary.svelte';
  import AlbumTitle from '$lib/components/album-page/album-title.svelte';
  import ShareInfoModal from '$lib/components/album-page/share-info-modal.svelte';
  import UserSelectionModal from '$lib/components/album-page/user-selection-modal.svelte';
  import ActivityStatus from '$lib/components/asset-viewer/activity-status.svelte';
  import ActivityViewer from '$lib/components/asset-viewer/activity-viewer.svelte';
  import Button from '$lib/components/elements/buttons/button.svelte';
  import CircleIconButton from '$lib/components/elements/buttons/circle-icon-button.svelte';
  import Icon from '$lib/components/elements/icon.svelte';
  import AddToAlbum from '$lib/components/photos-page/actions/add-to-album.svelte';
  import ArchiveAction from '$lib/components/photos-page/actions/archive-action.svelte';
  import ChangeDate from '$lib/components/photos-page/actions/change-date-action.svelte';
  import ChangeLocation from '$lib/components/photos-page/actions/change-location-action.svelte';
  import CreateSharedLink from '$lib/components/photos-page/actions/create-shared-link.svelte';
  import DeleteAssets from '$lib/components/photos-page/actions/delete-assets.svelte';
  import DownloadAction from '$lib/components/photos-page/actions/download-action.svelte';
  import FavoriteAction from '$lib/components/photos-page/actions/favorite-action.svelte';
  import RemoveFromAlbum from '$lib/components/photos-page/actions/remove-from-album.svelte';
  import SelectAllAssets from '$lib/components/photos-page/actions/select-all-assets.svelte';
  import AssetGrid from '$lib/components/photos-page/asset-grid.svelte';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/button-context-menu.svelte';
  import AssetSelectControlBar from '$lib/components/photos-page/asset-select-control-bar.svelte';
  import MenuOption from '$lib/components/shared-components/context-menu/menu-option.svelte';
  import ControlAppBar from '$lib/components/shared-components/control-app-bar.svelte';
  import CreateSharedLinkModal from '$lib/components/shared-components/create-share-link-modal/create-shared-link-modal.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/gallery-viewer.svelte';
  import {
    NotificationType,
    notificationController,
  } from '$lib/components/shared-components/notification/notification';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import UserAvatar from '$lib/components/shared-components/user-avatar.svelte';
  import { AppRoute, AlbumPageViewMode } from '$lib/constants';
  import { numberOfComments, setNumberOfComments, updateNumberOfComments } from '$lib/stores/activity.store';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { AssetStore, type Viewport } from '$lib/stores/assets-store.svelte';
  import { preferences, user } from '$lib/stores/user.store';
  import { handlePromiseError } from '$lib/utils';
  import { downloadAlbum, cancelMultiselect } from '$lib/utils/asset-utils';
  import { timeToSeconds } from '$lib/utils/date-time';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { handleError } from '$lib/utils/handle-error';
  import {
    isAlbumsRoute,
    isPeopleRoute,
    isSearchRoute,
    navigate,
    type AssetGridRouteSearchParams,
  } from '$lib/utils/navigation';
  import {
    AlbumUserRole,
    AssetOrder,
    ReactionLevel,
    ReactionType,
    addAssetsToAlbum,
    addUsersToAlbum,
    createActivity,
    deleteActivity,
    deleteAlbum,
    getActivities,
    getActivityStatistics,
    getAlbumInfo,
    searchAssets,
    updateAlbumInfo,
    type ActivityResponseDto,
    type AlbumUserAddDto,
    type AssetResponseDto,
  } from '@immich/sdk';
  import {
    mdiArrowLeft,
    mdiClose,
    mdiCogOutline,
    mdiDeleteOutline,
    mdiDotsVertical,
    mdiFolderDownloadOutline,
    mdiImageOutline,
    mdiImagePlusOutline,
    mdiLink,
    mdiPlus,
    mdiSortClockAscendingOutline,
    mdiSortClockDescendingOutline,
  } from '@mdi/js';
  import { fly } from 'svelte/transition';
  import type { PageData } from './$types';
  import { t } from 'svelte-i18n';
  import { onDestroy } from 'svelte';
  import { confirmAlbumDelete } from '$lib/utils/album-utils';
  import TagAction from '$lib/components/photos-page/actions/tag-action.svelte';
  import { AssetInteraction } from '$lib/stores/asset-interaction.svelte';
  import { organizeAlbumByTags } from '$lib/utils/tag-organization';
  import { mdiAutoFix } from '@mdi/js'; // or any icon you prefer

  let isOrganizing = $state(false);

  import FilterBar from '$lib/components/shared-components/filter-bar.svelte';

  let isStarred = $state(false);
  let searchTerm = $state('');
  let globalSearchActive = $state(false);
  let isSearchingByFilename = $state(false);
  let filenameSearchResults: AssetResponseDto[] = $state([]);
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const filenameSearchViewport: Viewport = $state({ width: 0, height: 100_000 });
  const filenameSearchInteraction = new AssetInteraction();

  let albumSearchTerm = $state('');
  let albumSearchActive = $state(false);
  let albumAssetsForSearch: AssetResponseDto[] | undefined = $state();
  let isLoadingAlbumSearch = $state(false);
  let albumSearchResults: AssetResponseDto[] = $state([]);
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const albumSearchViewport: Viewport = $state({ width: 0, height: 100_000 });
  const albumSearchInteraction = new AssetInteraction();

  interface Props {
    data: PageData;
  }

  let { data = $bindable() }: Props = $props();

  let { isViewing: showAssetViewer, gridScrollTarget } = assetViewingStore;

  let oldAt: AssetGridRouteSearchParams | null | undefined = $state();

  let backUrl: string = $state(AppRoute.ALBUMS);
  let viewMode: AlbumPageViewMode = $state(AlbumPageViewMode.VIEW);
  let isCreatingSharedAlbum = $state(false);
  let isShowActivity = $state(false);
  let isLiked: ActivityResponseDto | null = $state(null);
  let reactions: ActivityResponseDto[] = $state([]);
  let albumOrder: AssetOrder | undefined = $state(data.album.order);

  const DURATION_SORT_LIMIT = 50;

  let showDurationSort = $state(false);
  let durationSortDirection: 'desc' | 'asc' = $state('desc');
  let isLoadingDurationSort = $state(false);
  let durationSortedAssets: AssetResponseDto[] = $state([]);
  let durationSortAllAssets: AssetResponseDto[] = $state([]);
  let durationSortPage = $state(0);
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const durationSortViewport: Viewport = $state({ width: 0, height: 100_000 });

  const assetInteraction = new AssetInteraction();
  const timelineInteraction = new AssetInteraction();
  const durationSortInteraction = new AssetInteraction();

  afterNavigate(({ from }) => {
    let url: string | undefined = from?.url?.pathname;

    const route = from?.route?.id;
    if (isSearchRoute(route)) {
      url = from?.url.href;
    }

    if (isAlbumsRoute(route) || isPeopleRoute(route)) {
      url = AppRoute.ALBUMS;
    }

    backUrl = url || AppRoute.ALBUMS;

    if (backUrl === AppRoute.SHARING && album.albumUsers.length === 0 && !album.hasSharedLink) {
      isCreatingSharedAlbum = true;
    } else if (backUrl === AppRoute.SHARED_LINKS) {
      backUrl = history.state?.backUrl || AppRoute.ALBUMS;
    }
  });

  const handleToggleEnableActivity = async () => {
    try {
      const updateAlbum = await updateAlbumInfo({
        id: album.id,
        updateAlbumDto: {
          isActivityEnabled: !album.isActivityEnabled,
        },
      });

      album = { ...album, isActivityEnabled: updateAlbum.isActivityEnabled };

      await refreshAlbum();
      notificationController.show({
        type: NotificationType.Info,
        message: $t('activity_changed', { values: { enabled: album.isActivityEnabled } }),
      });
    } catch (error) {
      handleError(error, $t('errors.cant_change_activity', { values: { enabled: album.isActivityEnabled } }));
    }
  };

  const handleFavorite = async () => {
    try {
      if (isLiked) {
        const activityId = isLiked.id;
        await deleteActivity({ id: activityId });
        reactions = reactions.filter((reaction) => reaction.id !== activityId);
        isLiked = null;
      } else {
        isLiked = await createActivity({
          activityCreateDto: { albumId: album.id, type: ReactionType.Like },
        });
        reactions = [...reactions, isLiked];
      }
    } catch (error) {
      handleError(error, $t('errors.cant_change_asset_favorite'));
    }
  };

  const getFavorite = async () => {
    if ($user) {
      try {
        const data = await getActivities({
          userId: $user.id,
          albumId: album.id,
          $type: ReactionType.Like,
          level: ReactionLevel.Album,
        });
        if (data.length > 0) {
          isLiked = data[0];
        }
      } catch (error) {
        handleError(error, $t('errors.unable_to_load_liked_status'));
      }
    }
  };

  const getNumberOfComments = async () => {
    try {
      const { comments } = await getActivityStatistics({ albumId: album.id });
      setNumberOfComments(comments);
    } catch (error) {
      handleError(error, $t('errors.cant_get_number_of_comments'));
    }
  };

  const handleOpenAndCloseActivityTab = () => {
    isShowActivity = !isShowActivity;
  };

  const handleEscape = async () => {
    assetStore.suspendTransitions = true;
    if (viewMode === AlbumPageViewMode.SELECT_USERS) {
      viewMode = AlbumPageViewMode.VIEW;
      return;
    }
    if (viewMode === AlbumPageViewMode.SELECT_THUMBNAIL) {
      viewMode = AlbumPageViewMode.VIEW;
      return;
    }
    if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
      await handleCloseSelectAssets();
      return;
    }
    if (viewMode === AlbumPageViewMode.LINK_SHARING) {
      viewMode = AlbumPageViewMode.VIEW;
      return;
    }
    if (viewMode === AlbumPageViewMode.OPTIONS) {
      viewMode = AlbumPageViewMode.VIEW;
      return;
    }
    if ($showAssetViewer) {
      return;
    }
    if (assetInteraction.selectionActive) {
      cancelMultiselect(assetInteraction);
      return;
    }
    await goto(backUrl);
    return;
  };

  const refreshAlbum = async () => {
    album = await getAlbumInfo({ id: album.id, withoutAssets: true });
  };
  const handleAddAssets = async () => {
    const assetIds = timelineInteraction.selectedAssets.map((asset) => asset.id);

    try {
      const results = await addAssetsToAlbum({
        id: album.id,
        bulkIdsDto: { ids: assetIds },
      });

      const count = results.filter(({ success }) => success).length;
      notificationController.show({
        type: NotificationType.Info,
        message: $t('assets_added_count', { values: { count } }),
      });

      await refreshAlbum();

      timelineInteraction.clearMultiselect();
      await setModeToView();
    } catch (error) {
      handleError(error, $t('errors.error_adding_assets_to_album'));
    }
  };

  const setModeToView = async () => {
    assetStore.suspendTransitions = true;
    viewMode = AlbumPageViewMode.VIEW;
    await navigate(
      { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: { at: oldAt?.at } },
      { replaceState: true, forceNavigate: true },
    );
    oldAt = null;
  };

  const handleCloseSelectAssets = async () => {
    timelineInteraction.clearMultiselect();
    await setModeToView();
  };

  const handleSelectFromComputer = async () => {
    await openFileUploadDialog({ albumId: album.id });
    timelineInteraction.clearMultiselect();
    await setModeToView();
  };

  const handleAddUsers = async (albumUsers: AlbumUserAddDto[]) => {
    try {
      await addUsersToAlbum({
        id: album.id,
        addUsersDto: {
          albumUsers,
        },
      });
      await refreshAlbum();

      viewMode = AlbumPageViewMode.VIEW;
    } catch (error) {
      handleError(error, $t('errors.error_adding_users_to_album'));
    }
  };

  const handleRemoveUser = async (userId: string, nextViewMode: AlbumPageViewMode) => {
    if (userId == 'me' || userId === $user.id) {
      await goto(backUrl);
      return;
    }

    try {
      await refreshAlbum();

      // Dynamically set the view mode based on the passed argument
      viewMode = album.albumUsers.length > 0 ? nextViewMode : AlbumPageViewMode.VIEW;
    } catch (error) {
      handleError(error, $t('errors.error_deleting_shared_user'));
    }
  };

  const handleDownloadAlbum = async () => {
    await downloadAlbum(album);
  };

  const sortByDuration = (assets: AssetResponseDto[], direction: 'desc' | 'asc') =>
    assets
      .slice()
      .sort((a, b) =>
        direction === 'desc'
          ? timeToSeconds(b.duration) - timeToSeconds(a.duration)
          : timeToSeconds(a.duration) - timeToSeconds(b.duration),
      );

  const toggleDurationSort = async (direction: 'desc' | 'asc') => {
    if (showDurationSort && durationSortDirection === direction) {
      showDurationSort = false;
      cancelMultiselect(durationSortInteraction);
      return;
    }

    durationSortDirection = direction;

    if (showDurationSort) {
      cancelMultiselect(durationSortInteraction);
      durationSortPage = 0;
      durationSortAllAssets = sortByDuration(durationSortAllAssets, direction);
      durationSortedAssets = durationSortAllAssets.slice(0, DURATION_SORT_LIMIT);
      return;
    }

    showDurationSort = true;
    isLoadingDurationSort = true;
    durationSortedAssets = [];
    durationSortAllAssets = [];
    durationSortPage = 0;

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      durationSortAllAssets = sortByDuration(fullAlbum.assets, direction);
      durationSortedAssets = durationSortAllAssets.slice(0, DURATION_SORT_LIMIT);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      showDurationSort = false;
    } finally {
      isLoadingDurationSort = false;
    }
  };

  const hasMoreDurationSortedAssets = $derived(
    (durationSortPage + 1) * DURATION_SORT_LIMIT < durationSortAllAssets.length,
  );

  const loadNextDurationSortPage = () => {
    durationSortPage += 1;
    durationSortedAssets = durationSortAllAssets.slice(
      durationSortPage * DURATION_SORT_LIMIT,
      (durationSortPage + 1) * DURATION_SORT_LIMIT,
    );
  };

  const handleRemoveAlbum = async () => {
    const isConfirmed = await confirmAlbumDelete(album);

    if (!isConfirmed) {
      viewMode = AlbumPageViewMode.VIEW;
      return;
    }

    try {
      await deleteAlbum({ id: album.id });
      await goto(backUrl);
    } catch (error) {
      handleError(error, $t('errors.unable_to_delete_album'));
    } finally {
      viewMode = AlbumPageViewMode.VIEW;
    }
  };

  const handleOrganizeByTags = async () => {
    if (isOrganizing) return;

    isOrganizing = true;
    try {
      await organizeAlbumByTags(album.id);
      // Refresh the album data after organization
      await refreshAlbum();
    } catch (error) {
      handleError(error, 'Failed to organize album by tags');
    } finally {
      isOrganizing = false;
    }
  };

  const handleRemoveAssets = async (assetIds: string[]) => {
    assetStore.removeAssets(assetIds);
    await refreshAlbum();
  };

  const handleUpdateThumbnail = async (assetId: string) => {
    if (viewMode !== AlbumPageViewMode.SELECT_THUMBNAIL) {
      return;
    }

    await updateThumbnail(assetId);

    viewMode = AlbumPageViewMode.VIEW;
    assetInteraction.clearMultiselect();
  };

  const updateThumbnailUsingCurrentSelection = async () => {
    if (assetInteraction.selectedAssets.length === 1) {
      const [firstAsset] = assetInteraction.selectedAssets;
      assetInteraction.clearMultiselect();
      await updateThumbnail(firstAsset.id);
    }
  };

  const updateThumbnail = async (assetId: string) => {
    try {
      await updateAlbumInfo({
        id: album.id,
        updateAlbumDto: {
          albumThumbnailAssetId: assetId,
        },
      });
      notificationController.show({
        type: NotificationType.Info,
        message: $t('album_cover_updated'),
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_album_cover'));
    }
  };

  onNavigate(async ({ to }) => {
    if (!isAlbumsRoute(to?.route.id) && album.assetCount === 0 && !album.albumName) {
      await deleteAlbum(album);
    }
  });

  let album = $derived(data.album);
  let albumId = $derived(album.id);

  $effect(() => {
    if (!album.isActivityEnabled && $numberOfComments === 0) {
      isShowActivity = false;
    }
  });

  let assetStore = new AssetStore();

  $effect(() => {
    if (viewMode === AlbumPageViewMode.VIEW) {
      void assetStore.updateOptions({ albumId, order: albumOrder, isFavorite: isStarred });
    } else if (viewMode === AlbumPageViewMode.SELECT_ASSETS) {
      void assetStore.updateOptions({ isArchived: false, withPartners: true, timelineAlbumId: albumId });
    }
  });

  onDestroy(() => assetStore.destroy());

  const handleGlobalSearch = async () => {
    const term = searchTerm.trim();
    if (!term) {
      return;
    }

    globalSearchActive = true;
    isSearchingByFilename = true;
    try {
      const { assets } = await searchAssets({
        metadataSearchDto: { albumIds: [album.id], originalFileName: term },
      });
      filenameSearchResults = assets.items;
    } catch (error) {
      handleError(error, $t('errors.unable_to_search_for_assets'));
    } finally {
      isSearchingByFilename = false;
    }
  };

  const handleGlobalSearchClear = () => {
    filenameSearchResults = [];
    globalSearchActive = false;
  };

  const loadAlbumAssetsForSearch = async () => {
    if (albumAssetsForSearch !== undefined || isLoadingAlbumSearch) {
      return;
    }

    isLoadingAlbumSearch = true;
    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      albumAssetsForSearch = fullAlbum.assets;
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
    } finally {
      isLoadingAlbumSearch = false;
    }
  };

  const handleAlbumSearch = async () => {
    const term = albumSearchTerm.trim().toLowerCase();
    if (!term) {
      return;
    }

    albumSearchActive = true;
    await loadAlbumAssetsForSearch();
    albumSearchResults = (albumAssetsForSearch ?? []).filter((asset) =>
      asset.originalFileName.toLowerCase().includes(term),
    );
  };

  const handleAlbumSearchClear = () => {
    albumSearchResults = [];
    albumSearchActive = false;
  };

  let isOwned = $derived($user.id == album.ownerId);

  let showActivityStatus = $derived(
    album.albumUsers.length > 0 && !$showAssetViewer && (album.isActivityEnabled || $numberOfComments > 0),
  );
  let isEditor = $derived(
    album.albumUsers.find(({ user: { id } }) => id === $user.id)?.role === AlbumUserRole.Editor ||
      album.ownerId === $user.id,
  );

  let albumHasViewers = $derived(album.albumUsers.some(({ role }) => role === AlbumUserRole.Viewer));
  $effect(() => {
    if (album.albumUsers.length > 0) {
      handlePromiseError(getFavorite());
      handlePromiseError(getNumberOfComments());
    }
  });
  const isShared = $derived(viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : album.albumUsers.length > 0);
  const isSelectionMode = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? true : viewMode === AlbumPageViewMode.SELECT_THUMBNAIL,
  );
  const singleSelect = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : viewMode === AlbumPageViewMode.SELECT_THUMBNAIL,
  );
  const showArchiveIcon = $derived(viewMode !== AlbumPageViewMode.SELECT_ASSETS);
  const onSelect = ({ id }: { id: string }) => {
    if (viewMode !== AlbumPageViewMode.SELECT_ASSETS) {
      void handleUpdateThumbnail(id);
    }
  };
  const currentAssetIntersection = $derived(
    viewMode === AlbumPageViewMode.SELECT_ASSETS ? timelineInteraction : assetInteraction,
  );
</script>

<div class="flex overflow-hidden" use:scrollMemoryClearer={{ routeStartsWith: AppRoute.ALBUMS }}>
  <div class="relative w-full shrink">
    {#if assetInteraction.selectionActive}
      <AssetSelectControlBar
        assets={assetInteraction.selectedAssets}
        clearSelect={() => assetInteraction.clearMultiselect()}
      >
        <CreateSharedLink />
        <SelectAllAssets {assetStore} {assetInteraction} />
        <ButtonContextMenu icon={mdiPlus} title={$t('add_to')}>
          <AddToAlbum />
          <AddToAlbum shared />
        </ButtonContextMenu>
        {#if assetInteraction.isAllUserOwned}
          <FavoriteAction
            removeFavorite={assetInteraction.isAllFavorite}
            onFavorite={(ids, isFavorite) =>
              assetStore.updateAssetOperation(ids, (asset) => {
                asset.isFavorite = isFavorite;
                return { remove: false };
              })}
          ></FavoriteAction>
        {/if}
        <ButtonContextMenu icon={mdiDotsVertical} title={$t('menu')}>
          <DownloadAction menuItem filename="{album.albumName}.zip" />
          {#if assetInteraction.isAllUserOwned}
            <ChangeDate menuItem />
            <ChangeLocation menuItem />
            {#if assetInteraction.selectedAssets.length === 1}
              <MenuOption
                text={$t('set_as_album_cover')}
                icon={mdiImageOutline}
                onClick={() => updateThumbnailUsingCurrentSelection()}
              />
            {/if}
            <ArchiveAction menuItem unarchive={assetInteraction.isAllArchived} />
          {/if}

          {#if $preferences.tags.enabled && assetInteraction.isAllUserOwned}
            <TagAction menuItem />
          {/if}

          {#if isOwned || assetInteraction.isAllUserOwned}
            <RemoveFromAlbum menuItem bind:album onRemove={handleRemoveAssets} />
          {/if}
          {#if assetInteraction.isAllUserOwned}
            <DeleteAssets menuItem onAssetDelete={handleRemoveAssets} />
          {/if}
        </ButtonContextMenu>
      </AssetSelectControlBar>
    {:else}
      {#if viewMode === AlbumPageViewMode.VIEW}
        <ControlAppBar showBackButton backIcon={mdiArrowLeft} onClose={() => goto(backUrl)}>
          {#snippet trailing()}
            {#if isEditor}
              <CircleIconButton
                title={$t('add_photos')}
                onclick={async () => {
                  assetStore.suspendTransitions = true;
                  viewMode = AlbumPageViewMode.SELECT_ASSETS;
                  oldAt = { at: $gridScrollTarget?.at };
                  await navigate(
                    { targetRoute: 'current', assetId: null, assetGridRouteSearchParams: { at: null } },
                    { replaceState: true },
                  );
                }}
                icon={mdiImagePlusOutline}
              />
            {/if}

            {#if album.assetCount > 0}
              <CircleIconButton title={$t('download')} onclick={handleDownloadAlbum} icon={mdiFolderDownloadOutline} />
              <CircleIconButton
                title={showDurationSort && durationSortDirection === 'desc' ? $t('close') : $t('sort_by_duration')}
                onclick={() => toggleDurationSort('desc')}
                icon={showDurationSort && durationSortDirection === 'desc' ? mdiClose : mdiSortClockDescendingOutline}
                color={showDurationSort && durationSortDirection === 'desc' ? 'primary' : undefined}
              />
              <CircleIconButton
                title={showDurationSort && durationSortDirection === 'asc'
                  ? $t('close')
                  : $t('sort_by_duration_ascending')}
                onclick={() => toggleDurationSort('asc')}
                icon={showDurationSort && durationSortDirection === 'asc' ? mdiClose : mdiSortClockAscendingOutline}
                color={showDurationSort && durationSortDirection === 'asc' ? 'primary' : undefined}
              />

              {#if isOwned}
                <CircleIconButton
                  title={$t('organize_by_tags')}
                  onclick={handleOrganizeByTags}
                  icon={mdiAutoFix}
                  disabled={isOrganizing}
                />
              {/if}
            {/if}

            {#if isOwned}
              <ButtonContextMenu icon={mdiDotsVertical} title={$t('album_options')}>
                {#if album.assetCount > 0}
                  <MenuOption
                    icon={mdiImageOutline}
                    text={$t('select_album_cover')}
                    onClick={() => (viewMode = AlbumPageViewMode.SELECT_THUMBNAIL)}
                  />
                  <MenuOption
                    icon={mdiCogOutline}
                    text={$t('options')}
                    onClick={() => (viewMode = AlbumPageViewMode.OPTIONS)}
                  />
                {/if}

                <MenuOption icon={mdiDeleteOutline} text={$t('delete_album')} onClick={() => handleRemoveAlbum()} />
              </ButtonContextMenu>
            {/if}

            {#if isCreatingSharedAlbum && album.albumUsers.length === 0}
              <Button
                size="sm"
                rounded="lg"
                disabled={album.assetCount === 0}
                onclick={() => (viewMode = AlbumPageViewMode.SELECT_USERS)}
              >
                {$t('share')}
              </Button>
            {/if}
          {/snippet}
        </ControlAppBar>
      {/if}

      {#if viewMode === AlbumPageViewMode.SELECT_ASSETS}
        <ControlAppBar onClose={handleCloseSelectAssets}>
          {#snippet leading()}
            <p class="text-lg dark:text-immich-dark-fg">
              {#if !timelineInteraction.selectionActive}
                {$t('add_to_album')}
              {:else}
                {$t('selected_count', { values: { count: timelineInteraction.selectedAssets.length } })}
              {/if}
            </p>
          {/snippet}

          {#snippet trailing()}
            <button
              type="button"
              onclick={handleSelectFromComputer}
              class="rounded-lg px-6 py-2 text-sm font-medium text-immich-primary transition-all hover:bg-immich-primary/10 dark:text-immich-dark-primary dark:hover:bg-immich-dark-primary/25"
            >
              {$t('select_from_computer')}
            </button>
            <Button size="sm" rounded="lg" disabled={!timelineInteraction.selectionActive} onclick={handleAddAssets}
              >{$t('done')}</Button
            >
          {/snippet}
        </ControlAppBar>
      {/if}

      {#if viewMode === AlbumPageViewMode.SELECT_THUMBNAIL}
        <ControlAppBar onClose={() => (viewMode = AlbumPageViewMode.VIEW)}>
          {#snippet leading()}
            {$t('select_album_cover')}
          {/snippet}
        </ControlAppBar>
      {/if}
    {/if}

    <main
      class="relative h-dvh overflow-hidden bg-immich-bg px-6 max-md:pt-[var(--navbar-height-md)] pt-[var(--navbar-height)] dark:bg-immich-dark-bg"
    >
      {#if albumSearchActive}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={albumSearchViewport.width}>
          <FilterBar
            bind:searchTerm
            bind:albumSearchTerm
            bind:isStarred
            onsearch={handleGlobalSearch}
            onAlbumSearch={handleAlbumSearch}
            onclear={handleGlobalSearchClear}
            onAlbumClear={handleAlbumSearchClear}
          />

          {#if isLoadingAlbumSearch}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if albumSearchResults.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              bind:assets={albumSearchResults}
              assetInteraction={albumSearchInteraction}
              viewport={albumSearchViewport}
            />
          {/if}
        </section>
      {:else if globalSearchActive}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={filenameSearchViewport.width}>
          <FilterBar
            bind:searchTerm
            bind:albumSearchTerm
            bind:isStarred
            onsearch={handleGlobalSearch}
            onAlbumSearch={handleAlbumSearch}
            onclear={handleGlobalSearchClear}
            onAlbumClear={handleAlbumSearchClear}
          />

          {#if isSearchingByFilename}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if filenameSearchResults.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              bind:assets={filenameSearchResults}
              assetInteraction={filenameSearchInteraction}
              viewport={filenameSearchViewport}
            />
          {/if}
        </section>
      {:else if showDurationSort}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={durationSortViewport.width}>
          {#if isLoadingDurationSort}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else}
            <GalleryViewer
              bind:assets={durationSortedAssets}
              assetInteraction={durationSortInteraction}
              viewport={durationSortViewport}
            />
            {#if hasMoreDurationSortedAssets}
              <div class="flex justify-center pb-4">
                <Button onclick={loadNextDurationSortPage}>{$t('next')}</Button>
              </div>
            {/if}
          {/if}
        </section>
      {/if}

      <div class:hidden={albumSearchActive || globalSearchActive || showDurationSort} class="h-full">
        <AssetGrid
          enableRouting={viewMode === AlbumPageViewMode.SELECT_ASSETS ? false : true}
          {album}
          {assetStore}
          assetInteraction={currentAssetIntersection}
          {isShared}
          {isSelectionMode}
          {singleSelect}
          {showArchiveIcon}
          {onSelect}
          onEscape={handleEscape}
        >
          {#if viewMode !== AlbumPageViewMode.SELECT_ASSETS}
            {#if viewMode !== AlbumPageViewMode.SELECT_THUMBNAIL}
              <!-- ALBUM TITLE -->
              <section class="pt-8 md:pt-24">
                <AlbumTitle
                  id={album.id}
                  albumName={album.albumName}
                  {isOwned}
                  onUpdate={(albumName) => (album.albumName = albumName)}
                />

                {#if album.assetCount > 0}
                  <AlbumSummary {album} />
                {/if}

                <!-- ALBUM SHARING -->
                {#if album.albumUsers.length > 0 || (album.hasSharedLink && isOwned)}
                  <div class="my-3 flex gap-x-1">
                    <!-- link -->
                    {#if album.hasSharedLink && isOwned}
                      <CircleIconButton
                        title={$t('create_link_to_share')}
                        color="gray"
                        size="20"
                        icon={mdiLink}
                        onclick={() => (viewMode = AlbumPageViewMode.LINK_SHARING)}
                      />
                    {/if}

                    <!-- owner -->
                    <button type="button" onclick={() => (viewMode = AlbumPageViewMode.VIEW_USERS)}>
                      <UserAvatar user={album.owner} size="md" />
                    </button>

                    <!-- users with write access (collaborators) -->
                    {#each album.albumUsers.filter(({ role }) => role === AlbumUserRole.Editor) as { user } (user.id)}
                      <button type="button" onclick={() => (viewMode = AlbumPageViewMode.VIEW_USERS)}>
                        <UserAvatar {user} size="md" />
                      </button>
                    {/each}

                    <!-- display ellipsis if there are readonly users too -->
                    {#if albumHasViewers}
                      <CircleIconButton
                        title={$t('view_all_users')}
                        color="gray"
                        size="20"
                        icon={mdiDotsVertical}
                        onclick={() => (viewMode = AlbumPageViewMode.VIEW_USERS)}
                      />
                    {/if}

                    {#if isOwned}
                      <CircleIconButton
                        color="gray"
                        size="20"
                        icon={mdiPlus}
                        onclick={() => (viewMode = AlbumPageViewMode.SELECT_USERS)}
                        title={$t('add_more_users')}
                      />
                    {/if}
                  </div>
                {/if}
                <!-- ALBUM DESCRIPTION -->
                <AlbumDescription id={album.id} bind:description={album.description} {isOwned} />
              </section>
            {/if}

            {#if album.assetCount > 0 && viewMode === AlbumPageViewMode.VIEW}
              <section class="mt-4">
                <FilterBar
                  bind:searchTerm
                  bind:albumSearchTerm
                  bind:isStarred
                  onsearch={handleGlobalSearch}
                  onAlbumSearch={handleAlbumSearch}
                  onclear={handleGlobalSearchClear}
                  onAlbumClear={handleAlbumSearchClear}
                />
              </section>
            {/if}

            {#if album.assetCount === 0}
              <section id="empty-album" class=" mt-[200px] flex place-content-center place-items-center">
                <div class="w-[300px]">
                  <p class="text-xs dark:text-immich-dark-fg">{$t('add_photos').toUpperCase()}</p>
                  <button
                    type="button"
                    onclick={() => (viewMode = AlbumPageViewMode.SELECT_ASSETS)}
                    class="mt-5 flex w-full place-items-center gap-6 rounded-md border bg-immich-bg px-8 py-8 text-immich-fg transition-all hover:bg-gray-100 hover:text-immich-primary dark:border-none dark:bg-immich-dark-gray dark:text-immich-dark-fg dark:hover:text-immich-dark-primary"
                  >
                    <span class="text-text-immich-primary dark:text-immich-dark-primary"
                      ><Icon path={mdiPlus} size="24" />
                    </span>
                    <span class="text-lg">{$t('select_photos')}</span>
                  </button>
                </div>
              </section>
            {/if}
          {/if}
        </AssetGrid>
      </div>

      {#if showActivityStatus}
        <div class="absolute z-[2] bottom-0 right-0 mb-6 mr-6 justify-self-end">
          <ActivityStatus
            disabled={!album.isActivityEnabled}
            {isLiked}
            numberOfComments={$numberOfComments}
            onFavorite={handleFavorite}
            onOpenActivityTab={handleOpenAndCloseActivityTab}
          />
        </div>
      {/if}
    </main>
  </div>
  {#if album.albumUsers.length > 0 && album && isShowActivity && $user && !$showAssetViewer}
    <div class="flex">
      <div
        transition:fly={{ duration: 150 }}
        id="activity-panel"
        class="z-[2] w-[360px] md:w-[460px] overflow-y-auto bg-immich-bg transition-all dark:border-l dark:border-l-immich-dark-gray dark:bg-immich-dark-bg"
        translate="yes"
      >
        <ActivityViewer
          user={$user}
          disabled={!album.isActivityEnabled}
          albumOwnerId={album.ownerId}
          albumId={album.id}
          {isLiked}
          bind:reactions
          onAddComment={() => updateNumberOfComments(1)}
          onDeleteComment={() => updateNumberOfComments(-1)}
          onDeleteLike={() => (isLiked = null)}
          onClose={handleOpenAndCloseActivityTab}
        />
      </div>
    </div>
  {/if}
</div>
{#if viewMode === AlbumPageViewMode.SELECT_USERS}
  <UserSelectionModal
    {album}
    onSelect={handleAddUsers}
    onShare={() => (viewMode = AlbumPageViewMode.LINK_SHARING)}
    onClose={() => (viewMode = AlbumPageViewMode.VIEW)}
  />
{/if}

{#if viewMode === AlbumPageViewMode.LINK_SHARING}
  <CreateSharedLinkModal albumId={album.id} onClose={() => (viewMode = AlbumPageViewMode.VIEW)} />
{/if}

{#if viewMode === AlbumPageViewMode.VIEW_USERS}
  <ShareInfoModal
    onClose={() => (viewMode = AlbumPageViewMode.VIEW)}
    {album}
    onRemove={(userId) => handleRemoveUser(userId, AlbumPageViewMode.VIEW_USERS)}
    onRefreshAlbum={refreshAlbum}
  />
{/if}

{#if viewMode === AlbumPageViewMode.OPTIONS && $user}
  <AlbumOptions
    {album}
    order={albumOrder}
    user={$user}
    onChangeOrder={async (order) => {
      albumOrder = order;
      await setModeToView();
    }}
    onRemove={(userId) => handleRemoveUser(userId, AlbumPageViewMode.OPTIONS)}
    onRefreshAlbum={refreshAlbum}
    onClose={() => (viewMode = AlbumPageViewMode.VIEW)}
    onToggleEnabledActivity={handleToggleEnableActivity}
    onShowSelectSharedUser={() => (viewMode = AlbumPageViewMode.SELECT_USERS)}
  />
{/if}

<style>
  ::placeholder {
    color: rgb(60, 60, 60);
    opacity: 0.6;
  }

  ::-ms-input-placeholder {
    /* Edge 12 -18 */
    color: white;
  }
</style>
