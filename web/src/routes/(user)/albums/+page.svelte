<script lang="ts">
  import type { PageData } from './$types';
  import { scrollMemory } from '$lib/actions/scroll-memory';
  import { AlbumFilter, albumViewSettings } from '$lib/stores/preferences.store';
  import { createAlbumAndRedirect } from '$lib/utils/album-utils';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import AlbumsControls from '$lib/components/album-page/albums-controls.svelte';
  import Albums from '$lib/components/album-page/albums-list.svelte';
  import Button from '$lib/components/elements/buttons/button.svelte';
  import CircleIconButton from '$lib/components/elements/buttons/circle-icon-button.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import FullScreenModal from '$lib/components/shared-components/full-screen-modal.svelte';
  import GroupTab from '$lib/components/elements/group-tab.svelte';
  import SearchBar from '$lib/components/elements/search-bar.svelte';
  import { AppRoute } from '$lib/constants';
  import { Input } from '@immich/ui';
  import { mdiClose, mdiCounter } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let searchQuery = $state('');
  let albumGroups: string[] = $state([]);

  let assetCountRange = $state<{ min: number; max: number } | null>(null);
  let isCountFilterOpen = $state(false);
  let countFilterInput = $state('');

  // parses an item-count range: "100:300" (between), "100" (100 and up), ":300" (up to 300)
  const parseCountRange = (input: string): { min: number; max: number } | null => {
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

  const toggleCountFilter = () => {
    if (assetCountRange) {
      assetCountRange = null;
      return;
    }
    countFilterInput = '';
    isCountFilterOpen = true;
  };

  const applyCountFilter = () => {
    const range = parseCountRange(countFilterInput);
    if (!range) {
      return;
    }
    assetCountRange = range;
    isCountFilterOpen = false;
  };
</script>

<UserPageLayout title={data.meta.title} use={[[scrollMemory, { routeStartsWith: AppRoute.ALBUMS }]]}>
  {#snippet buttons()}
    <div class="flex place-items-center gap-2">
      <CircleIconButton
        title={assetCountRange ? $t('close') : $t('filter_albums_by_count')}
        onclick={toggleCountFilter}
        icon={assetCountRange ? mdiClose : mdiCounter}
        color={assetCountRange ? 'primary' : undefined}
        size="20"
        padding="2"
      />
      <AlbumsControls {albumGroups} bind:searchQuery />
    </div>
  {/snippet}

  <div class="xl:hidden">
    <div class="w-fit h-14 dark:text-immich-dark-fg py-2">
      <GroupTab
        label={$t('show_albums')}
        filters={Object.keys(AlbumFilter)}
        selected={$albumViewSettings.filter}
        onSelect={(selected) => ($albumViewSettings.filter = selected)}
      />
    </div>
    <div class="w-60">
      <SearchBar placeholder={$t('search_albums')} bind:name={searchQuery} showLoadingSpinner={false} />
    </div>
  </div>

  {#if assetCountRange}
    <p class="pt-2 text-sm text-gray-500 dark:text-gray-400">
      {assetCountRange.min} – {assetCountRange.max === Number.POSITIVE_INFINITY ? '∞' : assetCountRange.max}
    </p>
  {/if}

  <Albums
    ownedAlbums={data.albums}
    sharedAlbums={data.sharedAlbums}
    userSettings={$albumViewSettings}
    allowEdit
    {searchQuery}
    {assetCountRange}
    bind:albumGroupIds={albumGroups}
  >
    {#snippet empty()}
      <EmptyPlaceholder text={$t('no_albums_message')} onClick={() => createAlbumAndRedirect()} />
    {/snippet}
  </Albums>
</UserPageLayout>

{#if isCountFilterOpen}
  <FullScreenModal title={$t('filter_albums_by_count')} icon={mdiCounter} onClose={() => (isCountFilterOpen = false)}>
    <form
      id="count-filter-form"
      autocomplete="off"
      onsubmit={(event) => {
        event.preventDefault();
        applyCountFilter();
      }}
    >
      <div class="my-4 flex flex-col gap-2">
        <Input
          bind:value={countFilterInput}
          autofocus
          placeholder="100:300"
          aria-label={$t('filter_albums_by_count')}
        />
        <p class="text-sm text-gray-500 dark:text-gray-300">{$t('item_count_range_hint')}</p>
      </div>
    </form>

    {#snippet stickyBottom()}
      <Button color="gray" fullwidth onclick={() => (isCountFilterOpen = false)}>{$t('cancel')}</Button>
      <Button type="submit" form="count-filter-form" fullwidth>{$t('search')}</Button>
    {/snippet}
  </FullScreenModal>
{/if}
