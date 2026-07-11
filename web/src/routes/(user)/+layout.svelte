<script lang="ts">
  import { run } from 'svelte/legacy';

  import UploadCover from '$lib/components/shared-components/drag-and-drop-upload-overlay.svelte';
  import { page } from '$app/stores';

  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import type { Snippet } from 'svelte';
  import { get } from 'svelte/store';
  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();
  let { isViewing: showAssetViewer, setAsset, gridScrollTarget } = assetViewingStore;

  // $page.data.asset is loaded by route specific +page.ts loaders if that
  // route contains the assetId path.
  run(() => {
    if ($page.data.asset) {
      // the component that opened the viewer (e.g. gallery viewer) usually calls setAsset
      // itself before navigating, with extra context such as the frame-preview feed and
      // autoplay delay; don't clobber that with a bare re-set of the same asset. Read the
      // store untracked so this effect only re-runs on page changes.
      if ($page.data.asset.id !== get(assetViewingStore.asset)?.id || !get(assetViewingStore.isViewing)) {
        setAsset($page.data.asset);
      }
    } else {
      // goes through the store helper (rather than a bare store write) so viewer-scoped
      // context like the frame-preview feed is cleared along with the viewer
      assetViewingStore.showAssetViewer(false);
    }
    const asset = $page.url.searchParams.get('at');
    $gridScrollTarget = { at: asset };
  });
</script>

<div class:display-none={$showAssetViewer}>
  {@render children?.()}
</div>
<UploadCover />

<style>
  .display-none {
    display: none;
  }
</style>
