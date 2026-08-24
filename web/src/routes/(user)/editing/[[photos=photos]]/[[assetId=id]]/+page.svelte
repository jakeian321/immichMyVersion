<script lang="ts">
  import AssetPageControls from '$lib/components/album-page/asset-page-controls.svelte';
  import TagFilterModal, {
    type DurationRange,
    type TagFilterMode,
  } from '$lib/components/album-page/tag-filter-modal.svelte';
  import VideoTrimEditor from '$lib/components/editing-page/video-trim-editor.svelte';
  import Button from '$lib/components/elements/buttons/button.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import GalleryViewer from '$lib/components/shared-components/gallery-viewer/gallery-viewer.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import Portal from '$lib/components/shared-components/portal/portal.svelte';
  import {
    notificationController,
    NotificationType,
  } from '$lib/components/shared-components/notification/notification';
  import { AssetInteraction } from '$lib/stores/asset-interaction.svelte';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import type { Viewport } from '$lib/stores/assets-store.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import { navigate } from '$lib/utils/navigation';
  import { queueEditRecipe, type EditCrop, type EditSegment } from '$lib/utils/edit-recipe';
  import { ASSET_PAGE_SIZE, PagedAssetView } from '$lib/utils/paged-asset-view.svelte';
  import { searchAssetsByTagFilter } from '$lib/utils/tag-media-search';
  import { AssetTypeEnum, type AssetResponseDto } from '@immich/sdk';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let isPickerOpen = $state(false);
  let selectedTagIds: string[] = $state([]);
  let tagMode = $state<TagFilterMode>('all');
  let tagCount = $state<number | null>(null);
  let durationRange = $state<DurationRange | null>(null);
  let isLoading = $state(false);

  const view = new PagedAssetView();
  const assetInteraction = new AssetInteraction();
  // height is set arbitrarily large so GalleryViewer renders the whole page of assets
  // instead of virtualizing against a scroll position it doesn't track
  const viewport: Viewport = $state({ width: 0, height: 100_000 });

  const { isViewing: isViewerOpen, asset: viewingAsset } = assetViewingStore;

  let editingAsset = $state<AssetResponseDto | null>(null);
  // the Edit button rides on top of the shared asset viewer rather than inside it, so
  // nothing about the viewer itself changes for the rest of the app
  let canEditCurrent = $derived($isViewerOpen && $viewingAsset?.type === AssetTypeEnum.Video && !editingAsset);

  // iOS Safari only decodes one <video> at a time, so the viewer's player has to be torn
  // down before the editor's capture element can seek - otherwise its seeks never
  // complete and frame generation hangs
  const openEditor = async () => {
    const asset = $viewingAsset;
    assetViewingStore.showAssetViewer(false);
    await navigate({ targetRoute: 'current', assetId: null });
    editingAsset = asset;
  };

  const handleQueueEdit = async (segments: EditSegment[], crop: EditCrop | null) => {
    const asset = editingAsset;
    if (!asset) {
      return;
    }

    try {
      await queueEditRecipe({
        assetId: asset.id,
        fileName: asset.originalFileName,
        segments,
        crop,
        queuedAt: new Date().toISOString(),
      });
      notificationController.show({
        message: $t('edit_queued', { values: { count: segments.length } }),
        type: NotificationType.Info,
      });
      editingAsset = null;
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_album'));
    }
  };

  let tagOptions = $derived(data.tags.map((tag) => ({ id: tag.id, value: tag.value })));
  let selectedTagNames = $derived(tagOptions.filter((tag) => selectedTagIds.includes(tag.id)).map((tag) => tag.value));

  const handleApply = async (
    tagIds: string[],
    mode: TagFilterMode,
    totalTags: number | null,
    duration: DurationRange | null,
  ) => {
    isPickerOpen = false;
    selectedTagIds = tagIds;
    tagMode = mode;
    tagCount = totalTags;
    durationRange = duration;

    if (tagIds.length === 0) {
      view.reset();
      return;
    }

    isLoading = true;
    view.reset();

    try {
      view.setAll(await searchAssetsByTagFilter({ tagIds, mode, tagCount: totalTags, duration }));
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_assets'));
      view.reset();
    } finally {
      isLoading = false;
    }
  };

  // reads back the filter as a sentence, so what is on screen is never a mystery
  let filterSummary = $derived.by(() => {
    const parts: string[] = [];
    if (selectedTagNames.length > 0) {
      parts.push(selectedTagNames.join(tagMode === 'all' ? ' + ' : ' / '));
    }
    if (tagCount !== null) {
      parts.push($t('total_tag_count') + ': ' + tagCount);
    }
    if (durationRange !== null) {
      const max = Number.isFinite(durationRange.max) ? durationRange.max + 's' : '∞';
      parts.push($t('duration') + ': ' + durationRange.min + 's - ' + max);
    }
    return parts.join('  ·  ');
  });
</script>

<UserPageLayout title={data.meta.title}>
  {#snippet buttons()}
    <div class="flex place-items-center gap-2">
      <Button size="sm" onclick={() => (isPickerOpen = true)}>
        {selectedTagIds.length === 0 ? $t('select_tags') : $t('edit_filters')}
      </Button>
    </div>
  {/snippet}

  <section class="immich-scrollbar h-full overflow-y-auto" bind:clientWidth={viewport.width}>
    {#if filterSummary}
      <p class="pb-2 text-sm text-gray-500 dark:text-gray-400">{filterSummary}</p>
    {/if}

    {#if isLoading}
      <div class="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    {:else if selectedTagIds.length === 0}
      <div class="flex h-full flex-col items-center justify-center gap-4 text-center">
        <p class="text-sm text-gray-500 dark:text-gray-400">{$t('editing_pick_tag_hint')}</p>
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
    showAdvanced
    showDuration
    initialMode={tagMode}
    initialTagCount={tagCount}
    initialDuration={durationRange}
    onApply={handleApply}
    onClose={() => (isPickerOpen = false)}
  />
{/if}

{#if canEditCurrent}
  <Portal target="body">
    <!-- sits above the viewer chrome, which tops out at z-[1002] -->
    <div class="fixed right-4 top-16 z-[1003]">
      <Button size="sm" onclick={openEditor}>{$t('edit')}</Button>
    </div>
  </Portal>
{/if}

{#if editingAsset}
  <Portal target="body">
    <VideoTrimEditor
      asset={editingAsset}
      onCancel={() => (editingAsset = null)}
      onSave={(segments, crop) => void handleQueueEdit(segments, crop)}
    />
  </Portal>
{/if}
