<script lang="ts">
  import { afterNavigate, goto, onNavigate } from '$app/navigation';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import AddToCollectionsModal from '$lib/components/album-page/add-to-collections-modal.svelte';
  import AssetPageControls from '$lib/components/album-page/asset-page-controls.svelte';
  import TagFilterModal, { type TagFilterMode } from '$lib/components/album-page/tag-filter-modal.svelte';
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
  import FullScreenModal from '$lib/components/shared-components/full-screen-modal.svelte';
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
  import { cancelMultiselect } from '$lib/utils/asset-utils';
  import { timeToSeconds } from '$lib/utils/date-time';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { handleError } from '$lib/utils/handle-error';
  import { PagedAssetView } from '$lib/utils/paged-asset-view.svelte';
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
    getAllTags,
    getAssetInfo,
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
    mdiFolderMultiplePlusOutline,
    mdiImageOutline,
    mdiImagePlusOutline,
    mdiLink,
    mdiPlus,
    mdiSortAlphabeticalAscending,
    mdiSortAlphabeticalDescending,
    mdiSortNumericAscending,
    mdiSortNumericDescending,
    mdiFileAlertOutline,
    mdiSortCalendarAscending,
    mdiSortCalendarDescending,
    mdiNumeric,
    mdiSortClockAscendingOutline,
    mdiSortClockDescendingOutline,
    mdiTagMultipleOutline,
    mdiTimerOutline,
  } from '@mdi/js';
  import { Input } from '@immich/ui';
  import {
    filenameAgeAnchor,
    parseAgeAnchor,
    stringifyAgeAnchor,
    stripAgeAnchor,
  } from '$lib/stores/filename-age.store';
  import { fly } from 'svelte/transition';
  import type { PageData } from './$types';
  import { t } from 'svelte-i18n';
  import { onDestroy } from 'svelte';
  import { confirmAlbumDelete, isCollectionAlbum } from '$lib/utils/album-utils';
  import TagAction from '$lib/components/photos-page/actions/tag-action.svelte';
  import { AssetInteraction } from '$lib/stores/asset-interaction.svelte';
  import { organizeAlbumByTags } from '$lib/utils/tag-organization';
  import { mdiAutoFix } from '@mdi/js'; // or any icon you prefer

  let isOrganizing = $state(false);
  let isShowingCollectionsModal = $state(false);

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

  // these sort views render every asset at once (no virtualization), so on open or when
  // navigating between assets, give the video player a moment to settle before autoplaying
  // instead of competing with everything else still mounted for decode resources
  const VIDEO_AUTOPLAY_DELAY_MS = 600;

  // the sort views are review queues like the frame-preview-all feed: media that already
  // carries a tag is excluded. The album payload doesn't include tags, so each asset is
  // checked once via getAssetInfo (batched, cached for the lifetime of this page).
  const CONCURRENT_TAG_CHECKS = 10;
  const taggedAssetCache = new Map<string, boolean>();

  const isAssetTagged = async (assetId: string): Promise<boolean> => {
    const cached = taggedAssetCache.get(assetId);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const info = await getAssetInfo({ id: assetId });
      const tagged = (info.tags ?? []).length > 0;
      taggedAssetCache.set(assetId, tagged);
      return tagged;
    } catch {
      // if the check fails, keep the asset in the view rather than silently dropping it
      return false;
    }
  };

  const isUntaggedAsset = async (asset: AssetResponseDto) => !(await isAssetTagged(asset.id));

  let showDurationSort = $state(false);
  let durationSortDirection: 'desc' | 'asc' = $state('desc');
  let durationSortAllAssets: AssetResponseDto[] = $state([]);
  const durationSortView = new PagedAssetView();
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const durationSortViewport: Viewport = $state({ width: 0, height: 100_000 });

  // matches an 8-digit YYYYMMDD run in a filename, e.g. "... - 20240919 - ..." without
  // matching into longer digit runs like a numeric post ID
  const FILENAME_DATE_PATTERN = /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/;

  let showFilenameDateSort = $state(false);
  let filenameDateSortDirection: 'desc' | 'asc' = $state('desc');
  let filenameDateSortAllAssets: AssetResponseDto[] = $state([]);
  const filenameDateSortView = new PagedAssetView();
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const filenameDateSortViewport: Viewport = $state({ width: 0, height: 100_000 });

  // matches a likes count written into the filename, e.g. "... - 1902 likes - ..."
  const FILENAME_LIKES_PATTERN = /(\d+)\s*likes/i;

  let showLikesSort = $state(false);
  let likesSortDirection: 'desc' | 'asc' = $state('desc');
  let likesSortAllAssets: AssetResponseDto[] = $state([]);
  const likesSortView = new PagedAssetView();
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const likesSortViewport: Viewport = $state({ width: 0, height: 100_000 });

  let showDurationFilter = $state(false);
  const durationFilterView = new PagedAssetView();
  let durationFilterRange = $state<{ min: number; max: number } | null>(null);
  let isDurationFilterPromptOpen = $state(false);
  let durationFilterInput = $state('');
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const durationFilterViewport: Viewport = $state({ width: 0, height: 100_000 });

  // per-asset tags, cached for the lifetime of this page visit so re-checking an asset
  // (e.g. after changing the tag selection) never re-fetches it
  const assetTagsCache = new Map<string, { id: string; value: string }[]>();

  let showFilenameIssues = $state(false);
  const filenameIssuesView = new PagedAssetView();
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const filenameIssuesViewport: Viewport = $state({ width: 0, height: 100_000 });

  let showTagFilter = $state(false);
  let isTagFilterPickerOpen = $state(false);
  // brief: just fetching the full tag list, not scanning the album
  let isLoadingTagFilterPickerOptions = $state(false);
  let tagFilterPickerOptions: { id: string; value: string }[] = $state([]);
  let selectedTagFilterIds: string[] = $state([]);
  let tagFilterMode = $state<TagFilterMode>('all');
  let tagFilterCount = $state<number | null>(null);
  const tagFilterView = new PagedAssetView();
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const tagFilterViewport: Viewport = $state({ width: 0, height: 100_000 });

  let showNameSort = $state(false);
  let nameSortDirection: 'desc' | 'asc' = $state('asc');
  let nameSortAllAssets: AssetResponseDto[] = $state([]);
  const nameSortView = new PagedAssetView();
  // height is set arbitrarily large so GalleryViewer renders every asset instead of
  // virtualizing based on window scroll position, which doesn't track this view's scroll container
  const nameSortViewport: Viewport = $state({ width: 0, height: 100_000 });

  const assetInteraction = new AssetInteraction();
  const timelineInteraction = new AssetInteraction();
  const durationSortInteraction = new AssetInteraction();
  const filenameDateSortInteraction = new AssetInteraction();
  const likesSortInteraction = new AssetInteraction();
  const nameSortInteraction = new AssetInteraction();
  const durationFilterInteraction = new AssetInteraction();
  const tagFilterInteraction = new AssetInteraction();
  const filenameIssuesInteraction = new AssetInteraction();

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
      durationSortAllAssets = sortByDuration(durationSortAllAssets, direction);
      durationSortView.scan(durationSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
      return;
    }

    showFilenameDateSort = false;
    showNameSort = false;
    showLikesSort = false;
    showDurationFilter = false;
    showTagFilter = false;
    showFilenameIssues = false;

    showDurationSort = true;
    durationSortAllAssets = [];
    durationSortView.beginLoading();

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      durationSortAllAssets = sortByDuration(fullAlbum.assets, direction);
      durationSortView.scan(durationSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      durationSortView.reset();
      showDurationSort = false;
    }
  };

  const getFilenameDate = (filename: string): number | null => {
    const match = filename.match(FILENAME_DATE_PATTERN);
    if (!match) {
      return null;
    }

    const [, year, month, day] = match;
    const monthNum = Number(month);
    const dayNum = Number(day);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return null;
    }

    const timestamp = new Date(Number(year), monthNum - 1, dayNum).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  };

  const sortByFilenameDate = (assets: AssetResponseDto[], direction: 'desc' | 'asc') =>
    assets
      .map((asset) => ({ asset, date: getFilenameDate(asset.originalFileName) }))
      .filter((entry): entry is { asset: AssetResponseDto; date: number } => entry.date !== null)
      .sort((a, b) => (direction === 'desc' ? b.date - a.date : a.date - b.date))
      .map((entry) => entry.asset);

  const toggleFilenameDateSort = async (direction: 'desc' | 'asc') => {
    if (showFilenameDateSort && filenameDateSortDirection === direction) {
      showFilenameDateSort = false;
      cancelMultiselect(filenameDateSortInteraction);
      return;
    }

    filenameDateSortDirection = direction;

    if (showFilenameDateSort) {
      cancelMultiselect(filenameDateSortInteraction);
      filenameDateSortAllAssets = sortByFilenameDate(filenameDateSortAllAssets, direction);
      filenameDateSortView.scan(filenameDateSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
      return;
    }

    showDurationSort = false;
    showNameSort = false;
    showLikesSort = false;
    showDurationFilter = false;
    showTagFilter = false;
    showFilenameIssues = false;

    showFilenameDateSort = true;
    filenameDateSortAllAssets = [];
    filenameDateSortView.beginLoading();

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      filenameDateSortAllAssets = sortByFilenameDate(fullAlbum.assets, direction);
      filenameDateSortView.scan(filenameDateSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      filenameDateSortView.reset();
      showFilenameDateSort = false;
    }
  };

  const getFilenameLikes = (filename: string): number | null => {
    const match = filename.match(FILENAME_LIKES_PATTERN);
    return match ? Number(match[1]) : null;
  };

  const sortByLikes = (assets: AssetResponseDto[], direction: 'desc' | 'asc') =>
    assets
      .map((asset) => ({ asset, likes: getFilenameLikes(asset.originalFileName) }))
      .filter((entry): entry is { asset: AssetResponseDto; likes: number } => entry.likes !== null)
      .sort((a, b) => (direction === 'desc' ? b.likes - a.likes : a.likes - b.likes))
      .map((entry) => entry.asset);

  const toggleLikesSort = async (direction: 'desc' | 'asc') => {
    if (showLikesSort && likesSortDirection === direction) {
      showLikesSort = false;
      cancelMultiselect(likesSortInteraction);
      return;
    }

    likesSortDirection = direction;

    if (showLikesSort) {
      cancelMultiselect(likesSortInteraction);
      likesSortAllAssets = sortByLikes(likesSortAllAssets, direction);
      likesSortView.scan(likesSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
      return;
    }

    // the sort views render in a fixed priority order, so close the others to make
    // sure this one actually becomes visible
    showDurationSort = false;
    showFilenameDateSort = false;
    showNameSort = false;
    showDurationFilter = false;
    showTagFilter = false;
    showFilenameIssues = false;

    showLikesSort = true;
    likesSortAllAssets = [];
    likesSortView.beginLoading();

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      likesSortAllAssets = sortByLikes(fullAlbum.assets, direction);
      likesSortView.scan(likesSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      likesSortView.reset();
      showLikesSort = false;
    }
  };

  // the naming convention carries both a date and a like count, e.g.
  // "... - 20260620 - ... - 0 likes - ...". Anything missing either part is what this
  // view surfaces, so it can be renamed. Filenames are in the album payload, so unlike
  // the other views this needs no per-asset request at all.
  const hasNamingConvention = (filename: string) =>
    getFilenameDate(filename) !== null && getFilenameLikes(filename) !== null;

  const toggleFilenameIssues = async () => {
    if (showFilenameIssues) {
      showFilenameIssues = false;
      cancelMultiselect(filenameIssuesInteraction);
      return;
    }

    showDurationSort = false;
    showFilenameDateSort = false;
    showNameSort = false;
    showLikesSort = false;
    showDurationFilter = false;
    showTagFilter = false;

    showFilenameIssues = true;
    filenameIssuesView.beginLoading();

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      filenameIssuesView.setAll(fullAlbum.assets.filter((asset) => !hasNamingConvention(asset.originalFileName)));
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      filenameIssuesView.reset();
      showFilenameIssues = false;
    }
  };

  // parses a duration range in seconds: "5:10" (5 to 10), "10" (10 and up), ":7" (up to 7)
  const parseDurationRange = (input: string): { min: number; max: number } | null => {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    let min = 0;
    let max = Number.POSITIVE_INFINITY;

    if (trimmed.includes(':')) {
      const [minPart, maxPart] = trimmed.split(':', 2).map((part) => part.trim());
      if (minPart) {
        min = Number(minPart);
      }
      if (maxPart) {
        max = Number(maxPart);
      }
    } else {
      min = Number(trimmed);
    }

    if (Number.isNaN(min) || Number.isNaN(max) || min < 0 || max < min) {
      return null;
    }
    return { min, max };
  };

  const toggleDurationFilter = () => {
    if (showDurationFilter) {
      showDurationFilter = false;
      cancelMultiselect(durationFilterInteraction);
      return;
    }
    durationFilterInput = '';
    isDurationFilterPromptOpen = true;
  };

  const applyDurationFilter = async () => {
    const range = parseDurationRange(durationFilterInput);
    if (!range) {
      return;
    }

    isDurationFilterPromptOpen = false;
    durationFilterRange = range;

    // the sort views render in a fixed priority order, so close the others to make
    // sure this one actually becomes visible
    showDurationSort = false;
    showFilenameDateSort = false;
    showNameSort = false;
    showLikesSort = false;
    showTagFilter = false;
    showFilenameIssues = false;

    showDurationFilter = true;
    durationFilterView.beginLoading();

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      const candidates = fullAlbum.assets
        .filter((asset) => {
          const seconds = timeToSeconds(asset.duration ?? '0:00:00.00000');
          return seconds >= range.min && seconds <= range.max;
        })
        .sort((a, b) => timeToSeconds(a.duration) - timeToSeconds(b.duration));
      durationFilterView.scan(candidates, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      durationFilterView.reset();
      showDurationFilter = false;
    }
  };

  const getAssetTags = async (assetId: string): Promise<{ id: string; value: string }[]> => {
    const cached = assetTagsCache.get(assetId);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const info = await getAssetInfo({ id: assetId });
      const tags = (info.tags ?? []).map((tag) => ({ id: tag.id, value: tag.value }));
      assetTagsCache.set(assetId, tags);
      return tags;
    } catch {
      return [];
    }
  };

  // opens the picker right away using the full (small) system-wide tag list, rather than
  // scanning every asset in the album up front just to know which tags to show - matches
  // how every other filter view here works: prompt first, compute after you submit
  const openTagFilter = async () => {
    if (showTagFilter) {
      showTagFilter = false;
      showFilenameIssues = false;
      cancelMultiselect(tagFilterInteraction);
      return;
    }

    if (tagFilterPickerOptions.length === 0 && !isLoadingTagFilterPickerOptions) {
      isLoadingTagFilterPickerOptions = true;
      try {
        const tags = await getAllTags();
        tagFilterPickerOptions = tags.map((tag) => ({ id: tag.id, value: tag.value }));
      } catch (error) {
        handleError(error, $t('errors.unable_to_load_tags'));
      } finally {
        isLoadingTagFilterPickerOptions = false;
      }
    }

    isTagFilterPickerOpen = true;
  };

  const handleTagFilterApply = async (tagIds: string[], mode: TagFilterMode, tagCount: number | null) => {
    isTagFilterPickerOpen = false;
    selectedTagFilterIds = tagIds;
    tagFilterMode = mode;
    tagFilterCount = tagCount;

    if (tagIds.length === 0 && tagCount === null) {
      showTagFilter = false;
      showFilenameIssues = false;
      return;
    }

    // the sort/filter views render in a fixed priority order, so close the others to
    // make sure this one actually becomes visible
    showDurationSort = false;
    showFilenameDateSort = false;
    showNameSort = false;
    showLikesSort = false;
    showDurationFilter = false;

    showTagFilter = true;
    tagFilterView.beginLoading();

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      const matches = async (asset: AssetResponseDto) => {
        const tags = await getAssetTags(asset.id);
        // 'all' needs every selected tag present, 'any' just one of them
        const hasTags =
          tagIds.length === 0 ||
          (mode === 'all'
            ? tagIds.every((tagId) => tags.some((tag) => tag.id === tagId))
            : tagIds.some((tagId) => tags.some((tag) => tag.id === tagId)));
        // the count is the asset's total number of tags, so "2" with semitop selected
        // means semitop plus exactly one other tag
        const hasCount = tagCount === null || tags.length === tagCount;
        return hasTags && hasCount;
      };
      tagFilterView.scan(fullAlbum.assets, matches, CONCURRENT_TAG_CHECKS);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      tagFilterView.reset();
      showTagFilter = false;
      showFilenameIssues = false;
    }
  };

  // natural-order compare so numbered filenames like a000000002_... sort by their
  // sequence number rather than as plain strings
  const sortByName = (assets: AssetResponseDto[], direction: 'desc' | 'asc') =>
    assets.slice().sort((a, b) => {
      const comparison = a.originalFileName.localeCompare(b.originalFileName, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return direction === 'desc' ? -comparison : comparison;
    });

  const toggleNameSort = async (direction: 'desc' | 'asc') => {
    if (showNameSort && nameSortDirection === direction) {
      showNameSort = false;
      cancelMultiselect(nameSortInteraction);
      return;
    }

    nameSortDirection = direction;

    if (showNameSort) {
      cancelMultiselect(nameSortInteraction);
      nameSortAllAssets = sortByName(nameSortAllAssets, direction);
      nameSortView.scan(nameSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
      return;
    }

    // the sort views render in a fixed priority order, so close the others to make
    // sure this one actually becomes visible
    showDurationSort = false;
    showFilenameDateSort = false;
    showLikesSort = false;
    showDurationFilter = false;
    showTagFilter = false;
    showFilenameIssues = false;

    showNameSort = true;
    nameSortAllAssets = [];
    nameSortView.beginLoading();

    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      nameSortAllAssets = sortByName(fullAlbum.assets, direction);
      nameSortView.scan(nameSortAllAssets, isUntaggedAsset, CONCURRENT_TAG_CHECKS);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_album'));
      nameSortView.reset();
      showNameSort = false;
    }
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
    if (isOrganizing) {
      return;
    }

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

  onDestroy(() => {
    assetStore.destroy();
    filenameAgeAnchor.set(null);
  });

  // publish this album's age-number anchor (if configured) so thumbnails show badges
  $effect(() => {
    filenameAgeAnchor.set(parseAgeAnchor(album.description));
  });

  let isAgeNumberPromptOpen = $state(false);
  let ageNumberInput = $state('');

  const openAgeNumberPrompt = () => {
    const anchor = parseAgeAnchor(album.description);
    ageNumberInput = anchor
      ? `${anchor.age}:${anchor.year}${String(anchor.month).padStart(2, '0')}${String(anchor.day).padStart(2, '0')}`
      : '';
    isAgeNumberPromptOpen = true;
  };

  const applyAgeNumber = async () => {
    const trimmed = ageNumberInput.trim();
    let marker = '';

    if (trimmed) {
      const match = trimmed.match(/^(\d+)\s*:\s*(\d{8})$/);
      const anchor = match ? parseAgeAnchor(`[agenum:${match[1]}:${match[2]}]`) : null;
      if (!anchor) {
        return;
      }
      marker = stringifyAgeAnchor(anchor);
    }

    const base = stripAgeAnchor(album.description);
    const description = marker ? (base ? `${base}\n${marker}` : marker) : base;

    try {
      await updateAlbumInfo({ id: album.id, updateAlbumDto: { description } });
      isAgeNumberPromptOpen = false;
      await refreshAlbum();
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_album_info'));
    }
  };

  // Wrapping a term in quotes turns a substring search into a whole-word one: "son"
  // matches "my_son.mp4" but not "season.mp4". Word edges are anything that isn't a
  // letter or digit, so spaces, underscores, hyphens and punctuation all count as
  // separators - and the unicode classes keep that true for non-latin filenames.
  const parseSearchTerm = (raw: string) => {
    const trimmed = raw.trim();
    const isQuoted = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
    return { term: isQuoted ? trimmed.slice(1, -1).trim() : trimmed, wholeWord: isQuoted };
  };

  const matchesSearchTerm = (filename: string, term: string, wholeWord: boolean) => {
    if (!wholeWord) {
      return filename.toLowerCase().includes(term.toLowerCase());
    }
    const escaped = term.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    return new RegExp(String.raw`(?<![\p{L}\p{N}])${escaped}(?![\p{L}\p{N}])`, 'iu').test(filename);
  };

  const handleGlobalSearch = async () => {
    const { term, wholeWord } = parseSearchTerm(searchTerm);
    if (!term) {
      return;
    }

    globalSearchActive = true;
    isSearchingByFilename = true;
    try {
      // the server only does substring matching, so a quoted term is narrowed here
      const { assets } = await searchAssets({
        metadataSearchDto: { albumIds: [album.id], originalFileName: term },
      });
      filenameSearchResults = wholeWord
        ? assets.items.filter((asset) => matchesSearchTerm(asset.originalFileName, term, true))
        : assets.items;
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
    const { term, wholeWord } = parseSearchTerm(albumSearchTerm);
    if (!term) {
      return;
    }

    albumSearchActive = true;
    await loadAlbumAssetsForSearch();
    albumSearchResults = (albumAssetsForSearch ?? []).filter((asset) =>
      matchesSearchTerm(asset.originalFileName, term, wholeWord),
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
            <!-- two rows on phones (sorts on top, actions underneath), one row on wider screens -->
            <div class="flex flex-col items-end gap-1 md:flex-row md:items-center">
              {#if album.assetCount > 0}
                <div class="flex place-items-center gap-1">
                  <CircleIconButton
                    title={showDurationSort && durationSortDirection === 'desc' ? $t('close') : $t('sort_by_duration')}
                    onclick={() => toggleDurationSort('desc')}
                    icon={showDurationSort && durationSortDirection === 'desc'
                      ? mdiClose
                      : mdiSortClockDescendingOutline}
                    color={showDurationSort && durationSortDirection === 'desc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showDurationSort && durationSortDirection === 'asc'
                      ? $t('close')
                      : $t('sort_by_duration_ascending')}
                    onclick={() => toggleDurationSort('asc')}
                    icon={showDurationSort && durationSortDirection === 'asc' ? mdiClose : mdiSortClockAscendingOutline}
                    color={showDurationSort && durationSortDirection === 'asc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showFilenameDateSort && filenameDateSortDirection === 'desc'
                      ? $t('close')
                      : $t('sort_by_filename_date')}
                    onclick={() => toggleFilenameDateSort('desc')}
                    icon={showFilenameDateSort && filenameDateSortDirection === 'desc'
                      ? mdiClose
                      : mdiSortCalendarDescending}
                    color={showFilenameDateSort && filenameDateSortDirection === 'desc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showFilenameDateSort && filenameDateSortDirection === 'asc'
                      ? $t('close')
                      : $t('sort_by_filename_date_ascending')}
                    onclick={() => toggleFilenameDateSort('asc')}
                    icon={showFilenameDateSort && filenameDateSortDirection === 'asc'
                      ? mdiClose
                      : mdiSortCalendarAscending}
                    color={showFilenameDateSort && filenameDateSortDirection === 'asc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showNameSort && nameSortDirection === 'asc' ? $t('close') : $t('sort_by_name')}
                    onclick={() => toggleNameSort('asc')}
                    icon={showNameSort && nameSortDirection === 'asc' ? mdiClose : mdiSortAlphabeticalAscending}
                    color={showNameSort && nameSortDirection === 'asc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showNameSort && nameSortDirection === 'desc' ? $t('close') : $t('sort_by_name_descending')}
                    onclick={() => toggleNameSort('desc')}
                    icon={showNameSort && nameSortDirection === 'desc' ? mdiClose : mdiSortAlphabeticalDescending}
                    color={showNameSort && nameSortDirection === 'desc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showLikesSort && likesSortDirection === 'desc' ? $t('close') : $t('sort_by_likes')}
                    onclick={() => toggleLikesSort('desc')}
                    icon={showLikesSort && likesSortDirection === 'desc' ? mdiClose : mdiSortNumericDescending}
                    color={showLikesSort && likesSortDirection === 'desc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showLikesSort && likesSortDirection === 'asc' ? $t('close') : $t('sort_by_likes_ascending')}
                    onclick={() => toggleLikesSort('asc')}
                    icon={showLikesSort && likesSortDirection === 'asc' ? mdiClose : mdiSortNumericAscending}
                    color={showLikesSort && likesSortDirection === 'asc' ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showDurationFilter ? $t('close') : $t('filter_by_duration')}
                    onclick={toggleDurationFilter}
                    icon={showDurationFilter ? mdiClose : mdiTimerOutline}
                    color={showDurationFilter ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                  <CircleIconButton
                    title={showFilenameIssues ? $t('close') : $t('filter_unnamed')}
                    onclick={toggleFilenameIssues}
                    icon={showFilenameIssues ? mdiClose : mdiFileAlertOutline}
                    color={showFilenameIssues ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                </div>
              {/if}

              <div class="flex place-items-center gap-1">
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
                    size="20"
                    padding="2"
                  />
                {/if}

                {#if album.assetCount > 0 && isOwned}
                  <CircleIconButton
                    title={$t('organize_by_tags')}
                    onclick={handleOrganizeByTags}
                    icon={mdiAutoFix}
                    disabled={isOrganizing}
                    size="20"
                    padding="2"
                  />
                {/if}

                {#if album.assetCount > 0}
                  <CircleIconButton
                    title={showTagFilter ? $t('close') : $t('filter_by_tags')}
                    onclick={() => openTagFilter()}
                    icon={showTagFilter ? mdiClose : mdiTagMultipleOutline}
                    color={showTagFilter ? 'primary' : undefined}
                    disabled={isLoadingTagFilterPickerOptions}
                    size="20"
                    padding="2"
                  />
                {/if}

                {#if isOwned && !isCollectionAlbum(album)}
                  <CircleIconButton
                    title={$t('add_to_collections')}
                    onclick={() => (isShowingCollectionsModal = true)}
                    icon={mdiFolderMultiplePlusOutline}
                    size="20"
                    padding="2"
                  />
                {/if}

                {#if isOwned}
                  <CircleIconButton
                    title={$t('album_number')}
                    onclick={openAgeNumberPrompt}
                    icon={mdiNumeric}
                    color={parseAgeAnchor(album.description) ? 'primary' : undefined}
                    size="20"
                    padding="2"
                  />
                {/if}

                {#if isOwned}
                  <ButtonContextMenu icon={mdiDotsVertical} title={$t('album_options')} size="20" padding="2">
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
              </div>
            </div>
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
      class="relative h-dvh overflow-hidden bg-immich-bg px-6 max-md:pt-[calc(var(--navbar-height-md)+2.5rem)] pt-[var(--navbar-height)] dark:bg-immich-dark-bg"
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
          {#if durationSortView.isLoading}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if durationSortView.matched.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              assets={durationSortView.pageAssets}
              assetInteraction={durationSortInteraction}
              viewport={durationSortViewport}
              videoAutoplayDelayMs={VIDEO_AUTOPLAY_DELAY_MS}
              disableAssetSelect
            />
            <AssetPageControls view={durationSortView} />
          {/if}
        </section>
      {:else if showFilenameDateSort}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={filenameDateSortViewport.width}>
          {#if filenameDateSortView.isLoading}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if filenameDateSortView.matched.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              assets={filenameDateSortView.pageAssets}
              assetInteraction={filenameDateSortInteraction}
              viewport={filenameDateSortViewport}
              videoAutoplayDelayMs={VIDEO_AUTOPLAY_DELAY_MS}
              disableAssetSelect
            />
            <AssetPageControls view={filenameDateSortView} />
          {/if}
        </section>
      {:else if showNameSort}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={nameSortViewport.width}>
          {#if nameSortView.isLoading}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if nameSortView.matched.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              assets={nameSortView.pageAssets}
              assetInteraction={nameSortInteraction}
              viewport={nameSortViewport}
              videoAutoplayDelayMs={VIDEO_AUTOPLAY_DELAY_MS}
              disableAssetSelect
            />
            <AssetPageControls view={nameSortView} />
          {/if}
        </section>
      {:else if showLikesSort}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={likesSortViewport.width}>
          {#if likesSortView.isLoading}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if likesSortView.matched.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              assets={likesSortView.pageAssets}
              assetInteraction={likesSortInteraction}
              viewport={likesSortViewport}
              videoAutoplayDelayMs={VIDEO_AUTOPLAY_DELAY_MS}
              disableAssetSelect
            />
            <AssetPageControls view={likesSortView} />
          {/if}
        </section>
      {:else if showDurationFilter}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={durationFilterViewport.width}>
          {#if durationFilterRange}
            <p class="pb-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {durationFilterRange.min}s –
              {durationFilterRange.max === Number.POSITIVE_INFINITY ? '∞' : `${durationFilterRange.max}s`}
            </p>
          {/if}
          {#if durationFilterView.isLoading}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if durationFilterView.matched.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              assets={durationFilterView.pageAssets}
              assetInteraction={durationFilterInteraction}
              viewport={durationFilterViewport}
              videoAutoplayDelayMs={VIDEO_AUTOPLAY_DELAY_MS}
              disableAssetSelect
            />
            <AssetPageControls view={durationFilterView} />
          {/if}
        </section>
      {:else if showFilenameIssues}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={filenameIssuesViewport.width}>
          <p class="pb-2 text-center text-sm text-gray-500 dark:text-gray-400">{$t('filter_unnamed_hint')}</p>
          {#if filenameIssuesView.isLoading}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if filenameIssuesView.matched.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              assets={filenameIssuesView.pageAssets}
              assetInteraction={filenameIssuesInteraction}
              viewport={filenameIssuesViewport}
              videoAutoplayDelayMs={VIDEO_AUTOPLAY_DELAY_MS}
              disableAssetSelect
              showAssetName
            />
            <AssetPageControls view={filenameIssuesView} />
          {/if}
        </section>
      {:else if showTagFilter}
        <section class="immich-scrollbar h-full overflow-y-auto pt-4" bind:clientWidth={tagFilterViewport.width}>
          <div class="flex justify-end pb-2">
            <button
              type="button"
              class="text-sm text-immich-primary dark:text-immich-dark-primary"
              onclick={() => (isTagFilterPickerOpen = true)}
            >
              {$t('edit_filters')}
            </button>
          </div>

          {#if tagFilterView.isLoading}
            <div class="flex h-full items-center justify-center">
              <LoadingSpinner />
            </div>
          {:else if tagFilterView.matched.length === 0}
            <p class="text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
          {:else}
            <GalleryViewer
              assets={tagFilterView.pageAssets}
              assetInteraction={tagFilterInteraction}
              viewport={tagFilterViewport}
              videoAutoplayDelayMs={VIDEO_AUTOPLAY_DELAY_MS}
              disableAssetSelect
            />
            <AssetPageControls view={tagFilterView} />
          {/if}
        </section>
      {/if}

      <div
        class:hidden={albumSearchActive ||
          globalSearchActive ||
          showDurationSort ||
          showFilenameDateSort ||
          showNameSort ||
          showLikesSort ||
          showDurationFilter ||
          showTagFilter ||
          showFilenameIssues}
        class="h-full"
      >
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
{#if isShowingCollectionsModal}
  <AddToCollectionsModal {album} onClose={() => (isShowingCollectionsModal = false)} />
{/if}

{#if isAgeNumberPromptOpen}
  <FullScreenModal title={$t('album_number')} icon={mdiNumeric} onClose={() => (isAgeNumberPromptOpen = false)}>
    <form
      id="age-number-form"
      autocomplete="off"
      onsubmit={(event) => {
        event.preventDefault();
        void applyAgeNumber();
      }}
    >
      <div class="my-4 flex flex-col gap-2">
        <Input bind:value={ageNumberInput} autofocus placeholder="90:20260216" aria-label={$t('album_number')} />
        <p class="text-sm text-gray-500 dark:text-gray-300">{$t('album_number_hint')}</p>
      </div>
    </form>

    {#snippet stickyBottom()}
      <Button color="gray" fullwidth onclick={() => (isAgeNumberPromptOpen = false)}>{$t('cancel')}</Button>
      <Button type="submit" form="age-number-form" fullwidth>{$t('save')}</Button>
    {/snippet}
  </FullScreenModal>
{/if}

{#if isDurationFilterPromptOpen}
  <FullScreenModal
    title={$t('filter_by_duration')}
    icon={mdiTimerOutline}
    onClose={() => (isDurationFilterPromptOpen = false)}
  >
    <form
      id="duration-filter-form"
      autocomplete="off"
      onsubmit={(event) => {
        event.preventDefault();
        void applyDurationFilter();
      }}
    >
      <div class="my-4 flex flex-col gap-2">
        <Input bind:value={durationFilterInput} autofocus placeholder="5:10" aria-label={$t('filter_by_duration')} />
        <p class="text-sm text-gray-500 dark:text-gray-300">{$t('duration_range_hint')}</p>
      </div>
    </form>

    {#snippet stickyBottom()}
      <Button color="gray" fullwidth onclick={() => (isDurationFilterPromptOpen = false)}>{$t('cancel')}</Button>
      <Button type="submit" form="duration-filter-form" fullwidth>{$t('search')}</Button>
    {/snippet}
  </FullScreenModal>
{/if}

{#if isTagFilterPickerOpen}
  <TagFilterModal
    tagOptions={tagFilterPickerOptions}
    initialSelectedIds={selectedTagFilterIds}
    showAdvanced
    initialMode={tagFilterMode}
    initialTagCount={tagFilterCount}
    onApply={handleTagFilterApply}
    onClose={() => (isTagFilterPickerOpen = false)}
  />
{/if}

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
