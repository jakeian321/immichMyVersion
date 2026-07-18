<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import Albums from '$lib/components/album-page/albums-list.svelte';
  import Button from '$lib/components/elements/buttons/button.svelte';
  import Icon from '$lib/components/elements/icon.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import { albumViewSettings } from '$lib/stores/preferences.store';
  import {
    getSavedRanges,
    isCollectionAlbum,
    isRangesAlbum,
    saveRanges,
    type SavedCountRange,
  } from '$lib/utils/album-utils';
  import { Input } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let rangesAlbum = $derived(data.albums.find((album) => isRangesAlbum(album)));
  let ranges = $derived(rangesAlbum ? getSavedRanges(rangesAlbum) : []);
  // the marker albums (collections, ranges) are configuration, not content
  let displayAlbums = $derived(data.albums.filter((album) => !isCollectionAlbum(album) && !isRangesAlbum(album)));

  let newRangeInput = $state('');
  let selectedIndex = $state<number | null>(null);
  let albumGroups: string[] = $state([]);

  let selectedRange = $derived.by(() => {
    const range = selectedIndex === null ? undefined : ranges[selectedIndex];
    return range ? { min: range.min, max: range.max ?? Number.POSITIVE_INFINITY } : null;
  });

  // parses "300:400" (between), "300" (300 and up), ":400" (up to 400)
  const parseRange = (input: string): SavedCountRange | null => {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    let min = 0;
    let max: number | null = null;

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

    if (Number.isNaN(min) || min < 0 || (max !== null && (Number.isNaN(max) || max < min))) {
      return null;
    }
    return { min, max };
  };

  const formatRange = (range: SavedCountRange) => `${range.min} – ${range.max ?? '∞'}`;

  const handleAddRange = async () => {
    const range = parseRange(newRangeInput);
    if (!range) {
      return;
    }

    const updated = await saveRanges(rangesAlbum, [...ranges, range]);
    if (updated) {
      newRangeInput = '';
      await invalidateAll();
    }
  };

  const handleDeleteRange = async (index: number) => {
    const updated = await saveRanges(
      rangesAlbum,
      ranges.filter((_, rangeIndex) => rangeIndex !== index),
    );
    if (!updated) {
      return;
    }

    if (selectedIndex === index) {
      selectedIndex = null;
    } else if (selectedIndex !== null && selectedIndex > index) {
      selectedIndex -= 1;
    }
    await invalidateAll();
  };

  const handleSelectRange = (index: number) => {
    selectedIndex = selectedIndex === index ? null : index;
  };
</script>

<UserPageLayout title={data.meta.title}>
  <div class="flex flex-col gap-4">
    <form
      class="flex max-w-md items-center gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        void handleAddRange();
      }}
    >
      <Input class="flex-1" bind:value={newRangeInput} placeholder="300:400" aria-label={$t('ranges')} />
      <Button type="submit" size="sm">{$t('add')}</Button>
    </form>
    <p class="text-sm text-gray-500 dark:text-gray-400">{$t('item_count_range_hint')}</p>

    {#if ranges.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each ranges as range, index (`${range.min}-${range.max}-${index}`)}
          <div class="flex items-center overflow-hidden rounded-full">
            <button
              type="button"
              class={`px-4 py-2 text-sm font-medium transition-all ${
                selectedIndex === index
                  ? 'bg-immich-primary text-white dark:bg-immich-dark-primary dark:text-immich-dark-gray'
                  : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
              }`}
              onclick={() => handleSelectRange(index)}
            >
              {formatRange(range)}
            </button>
            <button
              type="button"
              class="bg-gray-200 py-2 pl-1 pr-2 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
              title={$t('remove')}
              onclick={() => handleDeleteRange(index)}
            >
              <Icon path={mdiClose} size="16" />
            </button>
          </div>
        {/each}
      </div>
    {:else}
      <p class="text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
    {/if}

    {#if selectedRange}
      <Albums
        ownedAlbums={displayAlbums}
        userSettings={$albumViewSettings}
        allowEdit
        assetCountRange={selectedRange}
        bind:albumGroupIds={albumGroups}
      >
        {#snippet empty()}
          <p class="text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
        {/snippet}
      </Albums>
    {/if}
  </div>
</UserPageLayout>
