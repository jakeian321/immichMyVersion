<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import AddAlbumsToCollectionsModal from '$lib/components/album-page/add-albums-to-collections-modal.svelte';
  import AlbumCover from '$lib/components/album-page/album-cover.svelte';
  import Button from '$lib/components/elements/buttons/button.svelte';
  import Icon from '$lib/components/elements/icon.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import { AppRoute } from '$lib/constants';
  import { getCollectionAlbumIds, getSavedRanges, isCollectionAlbum, isRangesAlbum } from '$lib/utils/album-utils';
  import { handleError } from '$lib/utils/handle-error';
  import Thumbnail from '$lib/components/assets/thumbnail/thumbnail.svelte';
  import { getAlbumInfo, getAllAlbums, searchAssets, type AlbumResponseDto, type AssetResponseDto } from '@immich/sdk';
  import { Input } from '@immich/ui';
  import { mdiCheckCircle, mdiCircleOutline, mdiClose, mdiMagnify } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let collections = $derived(
    data.albums.filter((album) => isCollectionAlbum(album)).sort((a, b) => a.albumName.localeCompare(b.albumName)),
  );
  let rangesAlbum = $derived(data.albums.find((album) => isRangesAlbum(album)));
  let savedRanges = $derived(rangesAlbum ? getSavedRanges(rangesAlbum) : []);
  // the marker albums (collections, ranges) are configuration, not content
  let displayAlbums = $derived(data.albums.filter((album) => !isCollectionAlbum(album) && !isRangesAlbum(album)));

  // which collections each album belongs to
  let albumCollectionIds = $derived.by(() => {
    const map = new Map<string, Set<string>>();
    for (const collection of collections) {
      for (const albumId of getCollectionAlbumIds(collection)) {
        let ids = map.get(albumId);
        if (!ids) {
          ids = new Set();
          map.set(albumId, ids);
        }
        ids.add(collection.id);
      }
    }
    return map;
  });

  // ---- filters ----
  let selectedRangeIndex = $state<number | null>(null);
  let notInAnyCollection = $state(false);
  let selectedCollectionIds = new SvelteSet<string>();

  let filenameTerm = $state('');
  let filenameMatchedAlbumIds = $state<Set<string> | null>(null);
  let isSearchingFilenames = $state(false);

  let selectedRange = $derived.by(() => {
    const range = selectedRangeIndex === null ? undefined : savedRanges[selectedRangeIndex];
    return range ? { min: range.min, max: range.max ?? Number.POSITIVE_INFINITY } : null;
  });

  const toggleRange = (index: number) => {
    selectedRangeIndex = selectedRangeIndex === index ? null : index;
  };

  const toggleNotInAnyCollection = () => {
    notInAnyCollection = !notInAnyCollection;
    if (notInAnyCollection) {
      selectedCollectionIds.clear();
    }
    clearCollectionFileSearch();
  };

  const toggleCollectionFilter = (collectionId: string) => {
    if (selectedCollectionIds.has(collectionId)) {
      selectedCollectionIds.delete(collectionId);
    } else {
      selectedCollectionIds.add(collectionId);
      notInAnyCollection = false;
    }
    // the results below belong to the previous selection, so they'd be misleading
    clearCollectionFileSearch();
  };

  // find albums containing at least one asset whose filename matches the term: search
  // assets globally, then resolve which albums each matching asset belongs to
  const searchFilenames = async () => {
    const term = filenameTerm.trim();
    if (!term) {
      filenameMatchedAlbumIds = null;
      return;
    }

    isSearchingFilenames = true;
    try {
      const result = await searchAssets({ metadataSearchDto: { originalFileName: term, size: 100 } });
      const matches = result.assets.items;
      const ids = new Set<string>();

      const CHUNK = 10;
      for (let index = 0; index < matches.length; index += CHUNK) {
        const chunk = matches.slice(index, index + CHUNK);
        const results = await Promise.all(
          chunk.map(({ id }) => getAllAlbums({ assetId: id }).catch(() => [] as AlbumResponseDto[])),
        );
        for (const albumsOfAsset of results) {
          for (const album of albumsOfAsset) {
            ids.add(album.id);
          }
        }
      }

      filenameMatchedAlbumIds = ids;
    } catch (error) {
      handleError(error, $t('errors.unable_to_search_for_assets'));
    } finally {
      isSearchingFilenames = false;
    }
  };

  const clearFilenameSearch = () => {
    filenameTerm = '';
    filenameMatchedAlbumIds = null;
  };

  // ---- filename search scoped to the selected collection ----

  // one album holding hundreds of matches would bury every other album in the
  // collection, so each album contributes at most this many before it's summarised
  const MAX_FILES_PER_ALBUM = 4;
  // albums are fetched a few at a time: enough to stay quick over a collection of
  // dozens without opening one request per album at once
  const ALBUM_FETCH_CHUNK = 5;

  type AlbumFileMatches = { album: AlbumResponseDto; assets: AssetResponseDto[]; total: number };

  let collectionFileTerm = $state('');
  let collectionFileResults = $state<AlbumFileMatches[] | null>(null);
  let isSearchingCollectionFiles = $state(false);

  const clearCollectionFileSearch = () => {
    collectionFileTerm = '';
    collectionFileResults = null;
  };

  // unlike the search above, this reads the albums' own asset lists rather than the
  // global asset search, which caps its response and so can't be trusted to have found
  // every match inside a given album
  const searchCollectionFiles = async () => {
    const term = collectionFileTerm.trim().toLowerCase();
    if (!term) {
      collectionFileResults = null;
      return;
    }

    isSearchingCollectionFiles = true;
    try {
      const targets = filteredAlbums;
      const results: AlbumFileMatches[] = [];

      for (let index = 0; index < targets.length; index += ALBUM_FETCH_CHUNK) {
        const chunk = targets.slice(index, index + ALBUM_FETCH_CHUNK);
        const infos = await Promise.all(
          chunk.map((album) => getAlbumInfo({ id: album.id, withoutAssets: false }).catch(() => null)),
        );

        for (const [position, info] of infos.entries()) {
          if (!info) {
            continue;
          }
          const matches = info.assets.filter((asset) => asset.originalFileName.toLowerCase().includes(term));
          if (matches.length > 0) {
            results.push({
              album: chunk[position],
              assets: matches.slice(0, MAX_FILES_PER_ALBUM),
              total: matches.length,
            });
          }
        }
      }

      collectionFileResults = results.sort((a, b) => b.total - a.total);
    } catch (error) {
      handleError(error, $t('errors.unable_to_search_for_assets'));
    } finally {
      isSearchingCollectionFiles = false;
    }
  };

  // until any filter is chosen the page shows a plain list; thumbnails only appear
  // once a range, collection filter, or filename search narrows things down
  let hasActiveFilter = $derived(
    selectedRange !== null || notInAnyCollection || selectedCollectionIds.size > 0 || filenameMatchedAlbumIds !== null,
  );

  // default: most assets first; toggle switches to alphabetical
  let sortByName = $state(false);

  let filteredAlbums = $derived.by(() => {
    const matches = displayAlbums.filter((album) => {
      if (selectedRange && (album.assetCount < selectedRange.min || album.assetCount > selectedRange.max)) {
        return false;
      }

      const memberOf = albumCollectionIds.get(album.id);
      if (notInAnyCollection && memberOf && memberOf.size > 0) {
        return false;
      }
      if (selectedCollectionIds.size > 0 && (!memberOf || ![...selectedCollectionIds].some((id) => memberOf.has(id)))) {
        return false;
      }

      if (filenameMatchedAlbumIds && !filenameMatchedAlbumIds.has(album.id)) {
        return false;
      }

      return true;
    });

    return sortByName
      ? matches.sort((a, b) => a.albumName.localeCompare(b.albumName))
      : matches.sort((a, b) => b.assetCount - a.assetCount);
  });

  // ---- selection mode ----
  let selectionMode = $state(false);
  let selectedAlbumIds = new SvelteSet<string>();
  let isBulkModalOpen = $state(false);

  let selectedAlbums = $derived(displayAlbums.filter((album) => selectedAlbumIds.has(album.id)));

  const toggleSelectionMode = () => {
    selectionMode = !selectionMode;
    selectedAlbumIds.clear();
  };

  const handleCardClick = async (album: AlbumResponseDto) => {
    if (!selectionMode) {
      await goto(`${AppRoute.ALBUMS}/${album.id}`);
      return;
    }

    if (selectedAlbumIds.has(album.id)) {
      selectedAlbumIds.delete(album.id);
    } else {
      selectedAlbumIds.add(album.id);
    }
  };

  const handleBulkSuccess = async () => {
    selectedAlbumIds.clear();
    selectionMode = false;
    await invalidateAll();
  };

  const formatRange = (range: { min: number; max: number | null }) => `${range.min} – ${range.max ?? '∞'}`;

  const chipClass = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition-all ${
      active
        ? 'bg-immich-primary text-white dark:bg-immich-dark-primary dark:text-immich-dark-gray'
        : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
    }`;
</script>

<UserPageLayout title={data.meta.title}>
  <div class="flex flex-col gap-4">
    <!-- filename search: albums containing a matching file -->
    <form
      class="flex max-w-md items-center gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        void searchFilenames();
      }}
    >
      <Input
        class="flex-1"
        bind:value={filenameTerm}
        placeholder={$t('search_by_filename')}
        aria-label={$t('search_by_filename')}
      />
      <Button type="submit" size="sm" disabled={isSearchingFilenames}>
        <Icon path={mdiMagnify} size="18" />
      </Button>
      {#if filenameMatchedAlbumIds}
        <Button type="button" size="sm" color="gray" onclick={clearFilenameSearch}>
          <Icon path={mdiClose} size="18" />
        </Button>
      {/if}
    </form>
    {#if isSearchingFilenames}
      <p class="text-sm text-gray-500 dark:text-gray-400">{$t('loading')}</p>
    {/if}

    <!-- saved count ranges -->
    {#if savedRanges.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each savedRanges as range, index (`${range.min}-${range.max}-${index}`)}
          <button type="button" class={chipClass(selectedRangeIndex === index)} onclick={() => toggleRange(index)}>
            {formatRange(range)}
          </button>
        {/each}
      </div>
    {/if}

    <!-- collection membership -->
    <div class="flex flex-wrap gap-2">
      <button type="button" class={chipClass(notInAnyCollection)} onclick={toggleNotInAnyCollection}>
        {$t('not_in_any_collection')}
      </button>
      {#each collections as collection (collection.id)}
        <button
          type="button"
          class={chipClass(selectedCollectionIds.has(collection.id))}
          onclick={() => toggleCollectionFilter(collection.id)}
        >
          {collection.albumName}
        </button>
      {/each}
    </div>

    <!-- filename search scoped to the albums of the selected collection -->
    {#if selectedCollectionIds.size > 0}
      <form
        class="flex max-w-md items-center gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void searchCollectionFiles();
        }}
      >
        <Input
          class="flex-1"
          bind:value={collectionFileTerm}
          placeholder={$t('search_files_in_collection')}
          aria-label={$t('search_files_in_collection')}
        />
        <Button type="submit" size="sm" disabled={isSearchingCollectionFiles}>
          <Icon path={mdiMagnify} size="18" />
        </Button>
        {#if collectionFileResults}
          <Button type="button" size="sm" color="gray" onclick={clearCollectionFileSearch}>
            <Icon path={mdiClose} size="18" />
          </Button>
        {/if}
      </form>
    {/if}

    <!-- selection controls -->
    <div class="flex items-center gap-2">
      <Button size="sm" color={selectionMode ? 'primary' : 'gray'} onclick={toggleSelectionMode}>
        {selectionMode ? $t('cancel') : $t('select')}
      </Button>
      {#if selectionMode && selectedAlbumIds.size > 0}
        <Button size="sm" onclick={() => (isBulkModalOpen = true)}>
          {$t('add_to_collections')} ({selectedAlbumIds.size})
        </Button>
      {/if}
      <button
        type="button"
        class="ml-auto rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 transition-all hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        onclick={() => (sortByName = !sortByName)}
      >
        {sortByName ? $t('sort_by_item_count') : $t('sort_by_name')}
      </button>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {$t('items_count', { values: { count: filteredAlbums.length } })}
      </p>
    </div>

    <!-- results: matching files grouped by album, once a collection search has run -->
    {#if isSearchingCollectionFiles}
      <p class="text-sm text-gray-500 dark:text-gray-400">{$t('loading')}</p>
    {:else if collectionFileResults}
      {#if collectionFileResults.length === 0}
        <p class="text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
      {:else}
        <div class="flex flex-col gap-6">
          {#each collectionFileResults as result (result.album.id)}
            <div class="flex flex-col gap-2">
              <button
                type="button"
                class="flex items-baseline gap-2 text-start"
                onclick={() => goto(`${AppRoute.ALBUMS}/${result.album.id}`)}
              >
                <span class="line-clamp-1 text-sm font-medium text-black dark:text-white">
                  {result.album.albumName}
                </span>
                <span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                  {result.total > result.assets.length
                    ? $t('showing_of_matches', { values: { shown: result.assets.length, total: result.total } })
                    : $t('items_count', { values: { count: result.total } })}
                </span>
              </button>
              <div class="flex flex-wrap gap-2">
                {#each result.assets as asset (asset.id)}
                  <Thumbnail
                    {asset}
                    thumbnailSize={120}
                    readonly
                    onClick={() => goto(`${AppRoute.ALBUMS}/${result.album.id}`)}
                  />
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <!-- results: thumbnails once filtered, a compact list before that -->
    {:else if hasActiveFilter}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {#each filteredAlbums as album (album.id)}
          <div class="relative">
            <button type="button" class="w-full text-start" onclick={() => handleCardClick(album)}>
              <div
                class={selectionMode && selectedAlbumIds.has(album.id)
                  ? 'rounded-xl ring-4 ring-immich-primary dark:ring-immich-dark-primary'
                  : ''}
              >
                <AlbumCover {album} swipeable={!selectionMode} />
              </div>
              <p class="mt-1 line-clamp-1 text-sm font-medium text-black dark:text-white">{album.albumName}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {$t('items_count', { values: { count: album.assetCount } })}
              </p>
            </button>

            {#if selectionMode}
              <div class="pointer-events-none absolute right-2 top-2 z-10">
                <Icon
                  path={selectedAlbumIds.has(album.id) ? mdiCheckCircle : mdiCircleOutline}
                  size="24"
                  class={selectedAlbumIds.has(album.id) ? 'text-immich-primary' : 'text-white'}
                />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="flex flex-col divide-y divide-gray-200 dark:divide-gray-800">
        {#each filteredAlbums as album (album.id)}
          <button
            type="button"
            class="flex items-center justify-between gap-2 px-2 py-3 text-start"
            onclick={() => handleCardClick(album)}
          >
            <span class="line-clamp-1 text-sm font-medium text-black dark:text-white">{album.albumName}</span>
            <span class="flex shrink-0 items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {$t('items_count', { values: { count: album.assetCount } })}
              {#if selectionMode}
                <Icon
                  path={selectedAlbumIds.has(album.id) ? mdiCheckCircle : mdiCircleOutline}
                  size="20"
                  class={selectedAlbumIds.has(album.id) ? 'text-immich-primary' : ''}
                />
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if filteredAlbums.length === 0 && !collectionFileResults && !isSearchingCollectionFiles}
      <p class="text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
    {/if}
  </div>
</UserPageLayout>

{#if isBulkModalOpen}
  <AddAlbumsToCollectionsModal
    albums={selectedAlbums}
    {collections}
    onClose={() => (isBulkModalOpen = false)}
    onSuccess={handleBulkSuccess}
  />
{/if}
