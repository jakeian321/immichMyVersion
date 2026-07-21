<script lang="ts">
  import AlbumCover from '$lib/components/album-page/album-cover.svelte';
  import CircleIconButton from '$lib/components/elements/buttons/circle-icon-button.svelte';
  import Icon from '$lib/components/elements/icon.svelte';
  import Combobox, { type ComboBoxOption } from '$lib/components/shared-components/combobox.svelte';
  import { dialogController } from '$lib/components/shared-components/dialog/dialog';
  import { AppRoute } from '$lib/constants';
  import {
    deleteCollection,
    getCollectionAlbumIds,
    renameCollection,
    setCollectionAlbums,
  } from '$lib/utils/album-utils';
  import { goto } from '$app/navigation';
  import type { AlbumResponseDto } from '@immich/sdk';
  import { Button, Input } from '@immich/ui';
  import { mdiClose, mdiPencilOutline, mdiTrashCanOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    collection: AlbumResponseDto;
    albumMap: Map<string, AlbumResponseDto>;
    linkableAlbums: AlbumResponseDto[];
    onChange: () => Promise<void>;
  }

  let { collection, albumMap, linkableAlbums, onChange }: Props = $props();

  let isEditingName = $state(false);
  let editedName = $state(collection.albumName);

  let linkedAlbumIds = $derived(getCollectionAlbumIds(collection));
  let linkedAlbums = $derived(
    linkedAlbumIds.map((id) => albumMap.get(id)).filter((album): album is AlbumResponseDto => album !== undefined),
  );

  // default: most assets first; toggle switches to alphabetical
  let sortByName = $state(false);
  let sortedLinkedAlbums = $derived(
    sortByName
      ? [...linkedAlbums].sort((a, b) => a.albumName.localeCompare(b.albumName))
      : [...linkedAlbums].sort((a, b) => b.assetCount - a.assetCount),
  );

  let addOptions = $derived(
    linkableAlbums
      .filter((album) => !linkedAlbumIds.includes(album.id))
      .map((album) => ({ id: album.id, label: album.albumName, value: album.id })),
  );

  const startEditingName = () => {
    editedName = collection.albumName;
    isEditingName = true;
  };

  const handleSaveName = async () => {
    const name = editedName.trim();
    if (name && name !== collection.albumName) {
      const updated = await renameCollection(collection, name);
      if (updated) {
        await onChange();
      }
    }
    isEditingName = false;
  };

  const handleAddAlbum = async (option?: ComboBoxOption) => {
    if (!option?.id) {
      return;
    }

    const updated = await setCollectionAlbums(collection, [...linkedAlbumIds, option.id]);
    if (updated) {
      await onChange();
    }
  };

  const handleRemoveAlbum = async (albumId: string) => {
    const updated = await setCollectionAlbums(
      collection,
      linkedAlbumIds.filter((id) => id !== albumId),
    );
    if (updated) {
      await onChange();
    }
  };

  const handleDelete = async () => {
    const isConfirmed = await dialogController.show({
      prompt: $t('collection_delete_confirmation', { values: { collection: collection.albumName } }),
    });

    if (isConfirmed && (await deleteCollection(collection))) {
      await onChange();
    }
  };
</script>

<section class="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
  <div class="flex items-center justify-between gap-2">
    {#if isEditingName}
      <form
        class="flex flex-1 items-center gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void handleSaveName();
        }}
      >
        <Input class="flex-1" bind:value={editedName} autofocus aria-label={$t('name')} />
        <Button type="submit" size="small">{$t('save')}</Button>
        <Button type="button" size="small" color="secondary" onclick={() => (isEditingName = false)}>
          {$t('cancel')}
        </Button>
      </form>
    {:else}
      <button
        type="button"
        class="flex items-center gap-2 text-lg font-medium text-black hover:text-immich-primary dark:text-white dark:hover:text-immich-dark-primary"
        onclick={startEditingName}
      >
        {collection.albumName}
        <Icon path={mdiPencilOutline} size="18" />
      </button>

      <CircleIconButton icon={mdiTrashCanOutline} title={$t('delete')} onclick={handleDelete} />
    {/if}
  </div>

  {#if linkedAlbums.length > 0}
    <div class="flex justify-end">
      <button
        type="button"
        class="rounded-full bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 transition-all hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        onclick={() => (sortByName = !sortByName)}
      >
        {sortByName ? $t('sort_by_item_count') : $t('sort_by_name')}
      </button>
    </div>

    <div class="flex flex-wrap gap-3">
      {#each sortedLinkedAlbums as album (album.id)}
        <div class="group relative">
          <button
            type="button"
            class="flex w-24 flex-col items-center gap-1"
            onclick={() => goto(`${AppRoute.ALBUMS}/${album.id}`)}
          >
            <AlbumCover {album} class="h-24 w-24 rounded-lg" />
            <p class="line-clamp-1 w-full text-center text-sm" title={album.albumName}>{album.albumName}</p>
          </button>

          <button
            type="button"
            class="absolute -right-2 -top-2 rounded-full bg-immich-primary p-1 text-gray-100 opacity-0 transition-all group-hover:opacity-100 dark:bg-immich-dark-primary dark:text-immich-dark-gray"
            title={$t('remove')}
            onclick={() => handleRemoveAlbum(album.id)}
          >
            <Icon path={mdiClose} size="16" />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <Combobox
    label={$t('albums')}
    hideLabel
    placeholder={$t('search_albums')}
    options={addOptions}
    onSelect={handleAddAlbum}
  />
</section>
