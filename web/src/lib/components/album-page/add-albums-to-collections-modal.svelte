<script lang="ts">
  import Button from '$lib/components/elements/buttons/button.svelte';
  import Checkbox from '$lib/components/elements/checkbox.svelte';
  import FullScreenModal from '$lib/components/shared-components/full-screen-modal.svelte';
  import {
    NotificationType,
    notificationController,
  } from '$lib/components/shared-components/notification/notification';
  import { createCollection, getCollectionAlbumIds, setCollectionAlbums } from '$lib/utils/album-utils';
  import type { AlbumResponseDto } from '@immich/sdk';
  import { Input } from '@immich/ui';
  import { mdiFolderMultiplePlusOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    /** albums to add to the chosen collections */
    albums: AlbumResponseDto[];
    collections: AlbumResponseDto[];
    onClose: () => void;
    onSuccess: () => Promise<void> | void;
  }

  let { albums, collections, onClose, onSuccess }: Props = $props();

  let collectionList = $state([...collections].sort((a, b) => a.albumName.localeCompare(b.albumName)));
  let chosenIds = new SvelteSet<string>();
  let newCollectionName = $state('');
  let isCreating = $state(false);
  let isSaving = $state(false);

  const handleToggle = (collectionId: string) => {
    if (chosenIds.has(collectionId)) {
      chosenIds.delete(collectionId);
    } else {
      chosenIds.add(collectionId);
    }
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    if (!name || isCreating) {
      return;
    }

    isCreating = true;
    try {
      const created = await createCollection(name, []);
      if (created) {
        collectionList = [...collectionList, created].sort((a, b) => a.albumName.localeCompare(b.albumName));
        chosenIds.add(created.id);
        newCollectionName = '';
      }
    } finally {
      isCreating = false;
    }
  };

  const handleAdd = async () => {
    if (chosenIds.size === 0) {
      return;
    }

    isSaving = true;
    const albumIds = albums.map(({ id }) => id);
    let updatedCount = 0;

    for (const collection of collectionList) {
      if (!chosenIds.has(collection.id)) {
        continue;
      }

      const merged = [...new Set([...getCollectionAlbumIds(collection), ...albumIds])];
      const updated = await setCollectionAlbums(collection, merged);
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
    await onSuccess();
    onClose();
  };
</script>

<FullScreenModal title={$t('add_to_collections')} icon={mdiFolderMultiplePlusOutline} {onClose}>
  <p class="text-sm text-gray-500 dark:text-gray-300">
    {$t('selected_count', { values: { count: albums.length } })}
  </p>

  {#if collectionList.length === 0}
    <p class="py-4 text-sm">{$t('no_collections_message')}</p>
  {:else}
    <div class="my-4 flex max-h-80 flex-col gap-3 overflow-y-auto">
      {#each collectionList as collection (collection.id)}
        <Checkbox
          id="bulk-collection-{collection.id}-checkbox"
          label={collection.albumName}
          labelClass="text-sm dark:text-immich-dark-fg"
          checked={chosenIds.has(collection.id)}
          onchange={() => handleToggle(collection.id)}
        />
      {/each}
    </div>
  {/if}

  <!-- create a collection right here -->
  <form
    class="mb-4 flex items-center gap-2"
    onsubmit={(event) => {
      event.preventDefault();
      void handleCreateCollection();
    }}
  >
    <Input
      class="flex-1"
      bind:value={newCollectionName}
      placeholder={$t('new_collection')}
      aria-label={$t('new_collection')}
    />
    <Button type="submit" size="sm" disabled={isCreating || !newCollectionName.trim()}>{$t('create')}</Button>
  </form>

  {#snippet stickyBottom()}
    <Button color="gray" fullwidth onclick={onClose}>{$t('cancel')}</Button>
    <Button fullwidth disabled={isSaving || chosenIds.size === 0} onclick={() => handleAdd()}>
      {$t('add')}
    </Button>
  {/snippet}
</FullScreenModal>
