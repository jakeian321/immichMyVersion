<script lang="ts">
  import AssetPageControls from '$lib/components/album-page/asset-page-controls.svelte';
  import TagFilterModal from '$lib/components/album-page/tag-filter-modal.svelte';
  import Button from '$lib/components/elements/buttons/button.svelte';
  import CircleIconButton from '$lib/components/elements/buttons/circle-icon-button.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/gallery-viewer.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import { AssetInteraction } from '$lib/stores/asset-interaction.svelte';
  import type { Viewport } from '$lib/stores/assets-store.svelte';
  import { clearVideoRotateMode, isVideoRotateMode, toggleVideoRotateMode } from '$lib/stores/video-rotation.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { ASSET_PAGE_SIZE, PagedAssetView } from '$lib/utils/paged-asset-view.svelte';
  import { searchAssets, type AssetResponseDto } from '@immich/sdk';
  import { mdiPhoneRotateLandscape } from '@mdi/js';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  // the search API pages server-side, so ask for whole pages of the size the pager uses
  const SEARCH_PAGE_SIZE = 250;

  let isPickerOpen = $state(false);
  let selectedTagIds: string[] = $state([]);
  let isLoading = $state(false);

  const view = new PagedAssetView();
  const assetInteraction = new AssetInteraction();
  // height is set arbitrarily large so GalleryViewer renders the whole page of assets
  // instead of virtualizing against a scroll position it doesn't track
  const viewport: Viewport = $state({ width: 0, height: 100_000 });

  let tagOptions = $derived(data.tags.map((tag) => ({ id: tag.id, value: tag.value })));
  let selectedTagNames = $derived(tagOptions.filter((tag) => selectedTagIds.includes(tag.id)).map((tag) => tag.value));

  const handleApply = async (tagIds: string[]) => {
    isPickerOpen = false;
    selectedTagIds = tagIds;

    if (tagIds.length === 0) {
      view.reset();
      return;
    }

    isLoading = true;
    view.reset();

    try {
      // the server filters by tag for us, so this only walks result pages rather than
      // checking every asset the way the album page has to
      const found: AssetResponseDto[] = [];
      for (let page = 1; ; page++) {
        const { assets } = await searchAssets({
          metadataSearchDto: { tagIds, page, size: SEARCH_PAGE_SIZE },
        });
        found.push(...assets.items);
        if (assets.nextPage === null || assets.items.length === 0) {
          break;
        }
      }
      view.setAll(found);
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_assets'));
      view.reset();
    } finally {
      isLoading = false;
    }
  };

  onDestroy(clearVideoRotateMode);
</script>

<UserPageLayout title={data.meta.title}>
  {#snippet buttons()}
    <div class="flex place-items-center gap-2">
      <CircleIconButton
        title={$t('rotate_playback_to_fill')}
        onclick={toggleVideoRotateMode}
        icon={mdiPhoneRotateLandscape}
        color={isVideoRotateMode.value ? 'primary' : undefined}
        size="20"
        padding="2"
      />
      <Button size="sm" onclick={() => (isPickerOpen = true)}>
        {selectedTagIds.length === 0 ? $t('select_tags') : $t('edit_filters')}
      </Button>
    </div>
  {/snippet}

  <section class="immich-scrollbar h-full overflow-y-auto" bind:clientWidth={viewport.width}>
    {#if selectedTagNames.length > 0}
      <p class="pb-2 text-sm text-gray-500 dark:text-gray-400">{selectedTagNames.join(', ')}</p>
    {/if}

    {#if isLoading}
      <div class="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    {:else if selectedTagIds.length === 0}
      <div class="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p class="text-sm text-gray-500 dark:text-gray-400">{$t('slideshow_pick_tag_hint')}</p>
        <Button onclick={() => (isPickerOpen = true)}>{$t('select_tags')}</Button>
      </div>
    {:else if view.matched.length === 0}
      <p class="pt-8 text-center text-sm text-gray-500 dark:text-gray-400">{$t('no_results')}</p>
    {:else}
      <GalleryViewer assets={view.pageAssets} {assetInteraction} {viewport} disableAssetSelect />
      {#if view.matched.length > ASSET_PAGE_SIZE}
        <AssetPageControls {view} />
      {/if}
    {/if}
  </section>
</UserPageLayout>

{#if isPickerOpen}
  <TagFilterModal
    {tagOptions}
    initialSelectedIds={selectedTagIds}
    onApply={handleApply}
    onClose={() => (isPickerOpen = false)}
  />
{/if}
