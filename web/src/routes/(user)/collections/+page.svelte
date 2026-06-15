<script lang="ts">
  import CollectionCard from '$lib/components/collections-page/collection-card.svelte';
  import Icon from '$lib/components/elements/icon.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import Combobox, { type ComboBoxOption } from '$lib/components/shared-components/combobox.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import { createCollection, isCollectionAlbum } from '$lib/utils/album-utils';
  import { invalidateAll } from '$app/navigation';
  import { Button, Input } from '@immich/ui';
  import { mdiClose, mdiFolderMultiplePlusOutline } from '@mdi/js';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let newCollectionName = $state('');
  let newCollectionAlbumIds = new SvelteSet<string>();
  let isCreating = $state(false);

  let albumMap = $derived(new Map(data.albums.map((album) => [album.id, album])));
  let collections = $derived(data.albums.filter((album) => isCollectionAlbum(album)));
  let linkableAlbums = $derived(data.albums.filter((album) => !isCollectionAlbum(album)));

  let newCollectionOptions = $derived(
    linkableAlbums
      .filter((album) => !newCollectionAlbumIds.has(album.id))
      .map((album) => ({ id: album.id, label: album.albumName, value: album.id })),
  );

  const handleSelectNewAlbum = (option?: ComboBoxOption) => {
    if (option?.id) {
      newCollectionAlbumIds.add(option.id);
    }
  };

  const handleRemoveNewAlbum = (albumId: string) => {
    newCollectionAlbumIds.delete(albumId);
  };

  const handleCreate = async () => {
    const name = newCollectionName.trim();
    if (!name) {
      return;
    }

    isCreating = true;
    try {
      const collection = await createCollection(name, [...newCollectionAlbumIds]);
      if (collection) {
        newCollectionName = '';
        newCollectionAlbumIds.clear();
        await invalidateAll();
      }
    } finally {
      isCreating = false;
    }
  };
</script>

<UserPageLayout title={data.meta.title}>
  {#if data.albums.length === 0}
    <EmptyPlaceholder text={$t('no_albums_message')} fullWidth />
  {:else}
    <div class="mx-auto flex max-w-2xl flex-col gap-8">
      {#each collections as collection (collection.id)}
        <CollectionCard {collection} {albumMap} {linkableAlbums} onChange={invalidateAll} />
      {/each}

      <section class="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
        <p class="text-lg font-medium text-black dark:text-white">{$t('new_collection')}</p>

        <Input bind:value={newCollectionName} placeholder={$t('name')} aria-label={$t('name')} />

        <Combobox
          label={$t('albums')}
          placeholder={$t('search_albums')}
          options={newCollectionOptions}
          onSelect={handleSelectNewAlbum}
        />

        {#if newCollectionAlbumIds.size > 0}
          <section class="flex flex-wrap gap-2">
            {#each newCollectionAlbumIds as albumId (albumId)}
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
                    onclick={() => handleRemoveNewAlbum(albumId)}
                  >
                    <Icon path={mdiClose} />
                  </button>
                </div>
              {/if}
            {/each}
          </section>
        {/if}

        <div>
          <Button
            leadingIcon={mdiFolderMultiplePlusOutline}
            disabled={!newCollectionName.trim()}
            loading={isCreating}
            onclick={handleCreate}
          >
            {$t('create')}
          </Button>
        </div>
      </section>
    </div>
  {/if}
</UserPageLayout>
