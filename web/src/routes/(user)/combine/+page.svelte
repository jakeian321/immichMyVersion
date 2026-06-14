<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import Combobox, { type ComboBoxOption } from '$lib/components/shared-components/combobox.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import { addAssetsToAlbum } from '$lib/utils/asset-utils';
  import { COMBINE_ALBUM_NAME, createAlbum, getCombinedAssetIds } from '$lib/utils/album-utils';
  import { invalidateAll } from '$app/navigation';
  import { getAlbumInfo } from '@immich/sdk';
  import { Button, Field, Input } from '@immich/ui';
  import { mdiClose, mdiSetMerge } from '@mdi/js';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let selectedIds = new SvelteSet<string>();
  let albumName = $state(COMBINE_ALBUM_NAME);
  let isCombining = $state(false);

  let albumMap = $derived(new Map(data.albums.map((album) => [album.id, album])));

  let comboboxOptions = $derived(
    data.albums
      .filter((album) => !selectedIds.has(album.id) && album.albumName !== albumName.trim())
      .map((album) => ({ id: album.id, label: album.albumName, value: album.id })),
  );

  let canCombine = $derived(selectedIds.size > 0 && albumName.trim().length > 0);

  const handleSelect = (option?: ComboBoxOption) => {
    if (option?.id) {
      selectedIds.add(option.id);
    }
  };

  const handleRemove = (albumId: string) => {
    selectedIds.delete(albumId);
  };

  const handleCombine = async () => {
    const name = albumName.trim();

    isCombining = true;
    try {
      // getAllAlbums() doesn't include each album's assets, so fetch them individually
      const selectedAlbums = await Promise.all([...selectedIds].map((id) => getAlbumInfo({ id })));
      const assetIds = getCombinedAssetIds(selectedAlbums);
      if (assetIds.length === 0) {
        return;
      }

      const existingAlbum = data.albums.find((album) => album.albumName === name);
      const targetAlbum = existingAlbum ?? (await createAlbum(name));
      if (!targetAlbum) {
        return;
      }

      await addAssetsToAlbum(targetAlbum.id, assetIds);

      selectedIds.clear();
      await invalidateAll();
    } finally {
      isCombining = false;
    }
  };
</script>

<UserPageLayout title={data.meta.title}>
  {#if data.albums.length === 0}
    <EmptyPlaceholder text={$t('no_albums_message')} fullWidth />
  {:else}
    <div class="mx-auto flex max-w-2xl flex-col gap-4">
      <Combobox
        label={$t('albums')}
        placeholder={$t('search_albums')}
        options={comboboxOptions}
        onSelect={handleSelect}
      />

      {#if selectedIds.size > 0}
        <section class="flex flex-wrap gap-2">
          {#each selectedIds as albumId (albumId)}
            {@const album = albumMap.get(albumId)}
            {#if album}
              <div class="group flex transition-all">
                <span
                  class="inline-block h-min whitespace-nowrap rounded-bl-full rounded-tl-full bg-immich-primary py-1 pl-3 pr-1 text-center align-baseline leading-none text-gray-100 transition-all hover:bg-immich-primary/80 dark:bg-immich-dark-primary dark:text-immich-dark-gray dark:hover:bg-immich-dark-primary/80 group-hover:pl-3"
                >
                  <p class="text-sm">{album.albumName}</p>
                </span>

                <button
                  type="button"
                  class="place-items-center place-content-center rounded-br-full rounded-tr-full bg-immich-primary/95 py-1 pl-1 pr-2 text-gray-100 transition-all hover:bg-immich-primary/80 dark:bg-immich-dark-primary/95 dark:text-immich-dark-gray dark:hover:bg-immich-dark-primary/80"
                  title={$t('remove')}
                  onclick={() => handleRemove(albumId)}
                >
                  <Icon path={mdiClose} />
                </button>
              </div>
            {/if}
          {/each}
        </section>
      {/if}

      <Field label={$t('name')}>
        <Input bind:value={albumName} placeholder={COMBINE_ALBUM_NAME} />
      </Field>

      <div>
        <Button leadingIcon={mdiSetMerge} disabled={!canCombine} loading={isCombining} onclick={handleCombine}>
          {$t('combine')}
        </Button>
      </div>
    </div>
  {/if}
</UserPageLayout>
