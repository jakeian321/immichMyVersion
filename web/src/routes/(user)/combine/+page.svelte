<script lang="ts">
  import Icon from '$lib/components/elements/icon.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import Combobox, { type ComboBoxOption } from '$lib/components/shared-components/combobox.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import { addAssetsToAlbum } from '$lib/utils/asset-utils';
  import {
    COMBINE_ALBUM_NAME,
    createAlbum,
    getCombinedAssetIds,
    getCollectionAlbumIds,
    isCollectionAlbum,
  } from '$lib/utils/album-utils';
  import { invalidateAll } from '$app/navigation';
  import { getAlbumInfo, type AlbumResponseDto } from '@immich/sdk';
  import { Button, Field, Input } from '@immich/ui';
  import { mdiClose, mdiSetMerge } from '@mdi/js';
  import { SvelteSet } from 'svelte/reactivity';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // per-album asset cap when combining via a collection
  const COLLECTION_ASSET_LIMIT = 300;

  type Mode = 'albums' | 'collection';
  let mode = $state<Mode>('albums');

  // ── Albums mode ────────────────────────────────────────────────────────────
  let selectedIds = new SvelteSet<string>();
  let albumName = $state(COMBINE_ALBUM_NAME);
  let isCombining = $state(false);

  let albumMap = $derived(new Map(data.albums.map((album) => [album.id, album])));
  let regularAlbums = $derived(data.albums.filter((album) => !isCollectionAlbum(album)));

  let comboboxOptions = $derived(
    regularAlbums
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

  // ── Collection mode ────────────────────────────────────────────────────────
  let collections = $derived(data.albums.filter((album) => isCollectionAlbum(album)));
  let collectionOptions = $derived(
    collections.map((album) => ({ id: album.id, label: album.albumName, value: album.id })),
  );

  let selectedCollection = $state<AlbumResponseDto | null>(null);
  let collectionCombineName = $state('');
  let isCollectionCombining = $state(false);

  let linkedAlbums = $derived(
    selectedCollection
      ? getCollectionAlbumIds(selectedCollection)
          .map((id) => albumMap.get(id))
          .filter((a): a is AlbumResponseDto => a !== undefined)
      : [],
  );

  $effect(() => {
    collectionCombineName = selectedCollection ? `${selectedCollection.albumName}_combined` : '';
  });

  const handleSelectCollection = (option?: ComboBoxOption) => {
    if (option?.id) {
      selectedCollection = albumMap.get(option.id) ?? null;
    }
  };

  const handleClearCollection = () => {
    selectedCollection = null;
  };

  const handleCollectionCombine = async () => {
    if (!selectedCollection || linkedAlbums.length === 0) {
      return;
    }

    const name = collectionCombineName.trim();
    if (!name) {
      return;
    }

    isCollectionCombining = true;
    try {
      const fullAlbums = await Promise.all(linkedAlbums.map((album) => getAlbumInfo({ id: album.id })));
      const assetIds = getCombinedAssetIds(fullAlbums, COLLECTION_ASSET_LIMIT);

      if (assetIds.length === 0) {
        return;
      }

      const existingAlbum = data.albums.find((album) => album.albumName === name);
      const targetAlbum = existingAlbum ?? (await createAlbum(name));
      if (!targetAlbum) {
        return;
      }

      await addAssetsToAlbum(targetAlbum.id, assetIds);

      selectedCollection = null;
      await invalidateAll();
    } finally {
      isCollectionCombining = false;
    }
  };
</script>

<UserPageLayout title={data.meta.title}>
  {#if data.albums.length === 0}
    <EmptyPlaceholder text={$t('no_albums_message')} fullWidth />
  {:else}
    <div class="mx-auto flex max-w-2xl flex-col gap-4">
      <!-- Mode tabs -->
      <div class="flex gap-1 rounded-xl bg-gray-100 p-1 dark:bg-immich-dark-gray">
        <button
          type="button"
          onclick={() => (mode = 'albums')}
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all {mode === 'albums'
            ? 'bg-white shadow dark:bg-immich-dark-bg'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
        >
          {$t('albums')}
        </button>
        <button
          type="button"
          onclick={() => (mode = 'collection')}
          class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all {mode === 'collection'
            ? 'bg-white shadow dark:bg-immich-dark-bg'
            : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'}"
        >
          {$t('collections')}
        </button>
      </div>

      {#if mode === 'albums'}
        <!-- ── Albums mode ─────────────────────────────────────────────── -->
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
                    class="place-content-center place-items-center rounded-br-full rounded-tr-full bg-immich-primary/95 py-1 pl-1 pr-2 text-gray-100 transition-all hover:bg-immich-primary/80 dark:bg-immich-dark-primary/95 dark:text-immich-dark-gray dark:hover:bg-immich-dark-primary/80"
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
      {:else}
        <!-- ── Collection mode ─────────────────────────────────────────── -->
        {#if collections.length === 0}
          <p class="text-center text-sm text-gray-500 dark:text-gray-400">
            No collections yet — create one in the Collections tab first.
          </p>
        {:else}
          <Combobox
            label={$t('collections')}
            placeholder={$t('select_collection')}
            options={collectionOptions}
            onSelect={handleSelectCollection}
          />

          {#if selectedCollection}
            <!-- Selected collection badge -->
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-immich-primary dark:text-immich-dark-primary">
                {selectedCollection.albumName}
              </span>
              <button
                type="button"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title={$t('remove')}
                onclick={handleClearCollection}
              >
                <Icon path={mdiClose} size="1rem" />
              </button>
            </div>

            <!-- Linked albums preview -->
            {#if linkedAlbums.length === 0}
              <p class="text-sm text-gray-500 dark:text-gray-400">This collection has no linked albums.</p>
            {:else}
              <section class="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <p class="mb-2 text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Albums in this collection (up to {COLLECTION_ASSET_LIMIT} assets each)
                </p>
                <ul class="flex flex-col gap-1">
                  {#each linkedAlbums as album (album.id)}
                    <li class="flex items-center justify-between text-sm">
                      <span>{album.albumName}</span>
                      <span class="text-gray-500 dark:text-gray-400">
                        {Math.min(album.assetCount, COLLECTION_ASSET_LIMIT)} / {album.assetCount} assets
                      </span>
                    </li>
                  {/each}
                </ul>
              </section>
            {/if}

            <Field label={$t('name')}>
              <Input bind:value={collectionCombineName} placeholder="{selectedCollection.albumName}_combined" />
            </Field>

            <div>
              <Button
                leadingIcon={mdiSetMerge}
                disabled={linkedAlbums.length === 0 || !collectionCombineName.trim()}
                loading={isCollectionCombining}
                onclick={handleCollectionCombine}
              >
                {$t('combine')}
              </Button>
            </div>
          {/if}
        {/if}
      {/if}
    </div>
  {/if}
</UserPageLayout>
