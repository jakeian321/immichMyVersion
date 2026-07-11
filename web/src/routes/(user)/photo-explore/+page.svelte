<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  import type { AlbumResponseDto, AssetResponseDto } from '@immich/sdk';
  import { AssetMediaSize } from '@immich/sdk';
  import { getAssetThumbnailUrl } from '$lib/utils';
  import { AppRoute } from '$lib/constants';
  import { goto } from '$app/navigation';
  import { t } from 'svelte-i18n';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // Map albumId → first 9 assets
  let previewMap = $state<Record<string, AssetResponseDto[]>>({});
  let loadingPreviews = $state(true);
  let activeTab: 'explore' | 'photos' | 'sharing' = $state('explore');

  // All albums combined for the Explore tab
  let allAlbums = $derived([...data.albums, ...data.sharedAlbums]);

  onMount(async () => {
    // Fetch 9 preview assets per album using your custom endpoint
    const results = await Promise.all(
      allAlbums.map(async (album) => {
        try {
          const res = await fetch(`/api/albums/${album.id}/assets?take=9`);
          const assets: AssetResponseDto[] = await res.json();
          return { id: album.id, assets };
        } catch {
          return { id: album.id, assets: [] };
        }
      }),
    );

    const map: Record<string, AssetResponseDto[]> = {};
    for (const result of results) {
      map[result.id] = result.assets;
    }
    previewMap = map;
    loadingPreviews = false;
  });
</script>

<UserPageLayout title={data.meta.title}>
  {#snippet buttons()}
    <!-- You can add controls here later (sort, filter, etc.) -->
  {/snippet}

  <!-- Tab bar -->
  <div class="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
    {#each ['explore', 'photos', 'sharing'] as const as tab}
      <button
        type="button"
        class="px-5 py-2 text-sm font-medium capitalize transition-colors
          {activeTab === tab
          ? 'border-b-2 border-immich-primary text-immich-primary dark:border-immich-dark-primary dark:text-immich-dark-primary'
          : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'}"
        onclick={() => (activeTab = tab)}
      >
        {tab}
      </button>
    {/each}
  </div>

  <!-- EXPLORE TAB -->
  {#if activeTab === 'explore'}
    {#if loadingPreviews}
      <div class="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    {:else if allAlbums.length === 0}
      <div class="flex flex-col items-center justify-center h-64 text-gray-400 gap-2">
        <p>{$t('no_albums_message')}</p>
        <a href={AppRoute.ALBUMS} class="text-immich-primary hover:underline text-sm"> Go to Albums → </a>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 pb-8">
        {#each allAlbums as album (album.id)}
          {@const previews = previewMap[album.id] ?? []}
          <button
            type="button"
            class="group rounded-xl overflow-hidden bg-white dark:bg-immich-dark-gray shadow-sm
                   hover:shadow-md transition-all duration-200 text-left w-full"
            onclick={() => goto(`${AppRoute.ALBUMS}/${album.id}`)}
          >
            <!-- 3×3 thumbnail grid -->
            <div class="grid grid-cols-3 grid-rows-3 aspect-square w-full overflow-hidden">
              {#each Array(9) as _, i}
                {#if previews[i]}
                  <img
                    src={getAssetThumbnailUrl({
                      id: previews[i].id,
                      size: AssetMediaSize.Thumbnail,
                    })}
                    alt=""
                    class="w-full h-full object-cover"
                    loading="lazy"
                  />
                {:else}
                  <!-- Empty cell placeholder -->
                  <div class="w-full h-full bg-gray-100 dark:bg-gray-800" />
                {/if}
              {/each}
            </div>

            <!-- Album name + count -->
            <div class="p-3">
              <p
                class="font-semibold text-sm text-gray-900 dark:text-white truncate
                         group-hover:text-immich-primary dark:group-hover:text-immich-dark-primary
                         transition-colors"
              >
                {album.albumName}
              </p>
              <p class="text-xs text-gray-400 mt-0.5">
                {album.assetCount}
                {album.assetCount === 1 ? 'item' : 'items'}
              </p>
            </div>
          </button>
        {/each}
      </div>
    {/if}

    <!-- PHOTOS TAB -->
  {:else if activeTab === 'photos'}
    <div class="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
      <p class="text-base">Your full photo timeline lives here</p>
      <button
        type="button"
        onclick={() => goto(AppRoute.PHOTOS)}
        class="px-4 py-2 rounded-full bg-immich-primary text-white text-sm hover:bg-immich-primary/90 transition-colors"
      >
        Open Photos
      </button>
    </div>

    <!-- SHARING TAB -->
  {:else if activeTab === 'sharing'}
    <div class="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
      {#if data.sharedAlbums.length === 0}
        <p class="text-base">No shared albums yet</p>
      {:else}
        <p class="text-base">{data.sharedAlbums.length} shared album{data.sharedAlbums.length === 1 ? '' : 's'}</p>
      {/if}
      <button
        type="button"
        onclick={() => goto(AppRoute.SHARING)}
        class="px-4 py-2 rounded-full bg-immich-primary text-white text-sm hover:bg-immich-primary/90 transition-colors"
      >
        Open Sharing
      </button>
    </div>
  {/if}
</UserPageLayout>
