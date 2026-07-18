<script lang="ts">
  import { getAssetThumbnailUrl } from '$lib/utils';
  import { getAlbumInfo, type AlbumResponseDto } from '@immich/sdk';
  import NoCover from '$lib/components/sharedlinks-page/covers/no-cover.svelte';
  import AssetCover from '$lib/components/sharedlinks-page/covers/asset-cover.svelte';
  import { swipe } from 'svelte-gestures';
  import type { SwipeCustomEvent } from 'svelte-gestures';
  import { t } from 'svelte-i18n';

  interface Props {
    album: AlbumResponseDto;
    preload?: boolean;
    /** allow swiping left/right on the cover to preview other thumbnails from the album */
    swipeable?: boolean;
    class?: string;
  }

  let { album, preload = false, swipeable = false, class: className = '' }: Props = $props();

  // swiping cycles through the album's assets in a shuffled order, purely as a local
  // preview — the album's actual cover is never changed
  let cycleAssetIds: string[] | null = $state(null);
  let cycleIndex = $state(-1);
  let overrideAssetId = $state<string | null>(null);
  let isLoadingCycle = false;

  let alt = $derived(album.albumName || $t('unnamed_album'));
  let thumbnailAssetId = $derived(overrideAssetId ?? album.albumThumbnailAssetId);
  let thumbnailUrl = $derived(thumbnailAssetId ? getAssetThumbnailUrl({ id: thumbnailAssetId }) : null);

  const loadCycleAssets = async () => {
    if (cycleAssetIds || isLoadingCycle) {
      return;
    }

    isLoadingCycle = true;
    try {
      const fullAlbum = await getAlbumInfo({ id: album.id, withoutAssets: false });
      const ids = fullAlbum.assets.map(({ id }) => id);
      // Fisher-Yates shuffle so each swipe reveals a random asset
      for (let index = ids.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
      }
      cycleAssetIds = ids;
    } catch {
      // leave the default cover if the album can't be loaded
    } finally {
      isLoadingCycle = false;
    }
  };

  const cycleCover = async (direction: 1 | -1) => {
    await loadCycleAssets();
    if (!cycleAssetIds || cycleAssetIds.length === 0) {
      return;
    }

    cycleIndex = (cycleIndex + direction + cycleAssetIds.length) % cycleAssetIds.length;
    overrideAssetId = cycleAssetIds[cycleIndex];
  };

  const onSwipe = (event: SwipeCustomEvent) => {
    if (event.detail.direction === 'right') {
      void cycleCover(1);
    } else if (event.detail.direction === 'left') {
      void cycleCover(-1);
    }
  };
</script>

{#snippet cover()}
  {#if thumbnailUrl}
    <AssetCover {alt} class={className} src={thumbnailUrl} {preload} />
  {:else}
    <NoCover {alt} class={className} {preload} />
  {/if}
{/snippet}

{#if swipeable}
  <!-- pan-y keeps vertical scrolling working while horizontal swipes cycle the preview -->
  <div class="touch-pan-y" use:swipe={() => ({ timeframe: 300, minSwipeDistance: 30 })} onswipe={onSwipe}>
    {@render cover()}
  </div>
{:else}
  {@render cover()}
{/if}
