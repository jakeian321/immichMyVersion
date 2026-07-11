<script lang="ts">
  import Button from '$lib/components/elements/buttons/button.svelte';
  import Checkbox from '$lib/components/elements/checkbox.svelte';
  import FullScreenModal from '$lib/components/shared-components/full-screen-modal.svelte';
  import {
    NotificationType,
    notificationController,
  } from '$lib/components/shared-components/notification/notification';
  import { AppRoute } from '$lib/constants';
  import { getCollectionAlbumIds, isCollectionAlbum, setCollectionAlbums } from '$lib/utils/album-utils';
  import { goto } from '$app/navigation';
  import { getAllAlbums, type AlbumResponseDto } from '@immich/sdk';
  import { mdiFolderMultipleOutline } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    album: AlbumResponseDto;
    onClose: () => void;
  }

  let { album, onClose }: Props = $props();

  let collections: AlbumResponseDto[] = $state([]);
  let selectedIds = new SvelteSet<string>();
  let isLoading = $state(true);
  let isSaving = $state(false);

  onMount(async () => {
    const albums = await getAllAlbums({});
    collections = albums
      .filter((candidate) => isCollectionAlbum(candidate))
      .sort((a, b) => a.albumName.localeCompare(b.albumName));

    for (const collection of collections) {
      if (getCollectionAlbumIds(collection).includes(album.id)) {
        selectedIds.add(collection.id);
      }
    }
    isLoading = false;
  });

  const handleToggle = (collectionId: string) => {
    if (selectedIds.has(collectionId)) {
      selectedIds.delete(collectionId);
    } else {
      selectedIds.add(collectionId);
    }
  };

  const handleSave = async () => {
    isSaving = true;
    let updatedCount = 0;

    for (const collection of collections) {
      const albumIds = getCollectionAlbumIds(collection);
      const isLinked = albumIds.includes(album.id);
      const shouldLink = selectedIds.has(collection.id);
      if (isLinked === shouldLink) {
        continue;
      }

      const newAlbumIds = shouldLink ? [...albumIds, album.id] : albumIds.filter((id) => id !== album.id);
      const updated = await setCollectionAlbums(collection, newAlbumIds);
      if (updated) {
        updatedCount++;
      }
    }

    isSaving = false;
    if (updatedCount > 0) {
      notificationController.show({
        message: $t('collections_updated'),
        type: NotificationType.Info,
      });
    }
    onClose();
  };
</script>

<FullScreenModal title={$t('add_to_collections')} icon={mdiFolderMultipleOutline} {onClose}>
  <p class="text-sm text-gray-500 dark:text-gray-300">{album.albumName}</p>

  {#if isLoading}
    <p class="py-4 text-sm">{$t('loading')}</p>
  {:else if collections.length === 0}
    <div class="flex flex-col gap-4 py-4">
      <p class="text-sm">{$t('no_collections_message')}</p>
      <Button size="sm" onclick={() => goto(AppRoute.COLLECTIONS)}>{$t('new_collection')}</Button>
    </div>
  {:else}
    <div class="my-4 flex max-h-80 flex-col gap-3 overflow-y-auto">
      {#each collections as collection (collection.id)}
        <Checkbox
          id="collection-{collection.id}-checkbox"
          label={collection.albumName}
          labelClass="text-sm dark:text-immich-dark-fg"
          checked={selectedIds.has(collection.id)}
          onchange={() => handleToggle(collection.id)}
        />
      {/each}
    </div>
  {/if}

  {#snippet stickyBottom()}
    <Button color="gray" fullwidth onclick={onClose}>{$t('cancel')}</Button>
    <Button fullwidth disabled={isLoading || isSaving || collections.length === 0} onclick={() => handleSave()}>
      {$t('save')}
    </Button>
  {/snippet}
</FullScreenModal>
