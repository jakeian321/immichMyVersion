import { getKey } from '$lib/utils';
import { type AssetGridRouteSearchParams } from '$lib/utils/navigation';
import { getAssetInfo, type AssetResponseDto } from '@immich/sdk';
import { readonly, writable } from 'svelte/store';

function createAssetViewingStore() {
  const viewingAssetStoreState = writable<AssetResponseDto>();
  const preloadAssets = writable<AssetResponseDto[]>([]);
  const viewState = writable<boolean>(false);
  const gridScrollTarget = writable<AssetGridRouteSearchParams | null | undefined>();
  // extra delay before a video starts playing, used by non-virtualized grids (e.g. the
  // album page's duration/filename-date sort views) where many assets stay mounted at once
  // and can otherwise starve the viewer's video of decode resources right at playback start
  const videoAutoplayDelayMs = writable<number>(0);

  const setAsset = (asset: AssetResponseDto, assetsToPreload: AssetResponseDto[] = [], autoplayDelayMs = 0) => {
    preloadAssets.set(assetsToPreload);
    videoAutoplayDelayMs.set(autoplayDelayMs);
    viewingAssetStoreState.set(asset);
    viewState.set(true);
  };

  const setAssetId = async (id: string): Promise<AssetResponseDto> => {
    const asset = await getAssetInfo({ id, key: getKey() });
    setAsset(asset);
    return asset;
  };

  const showAssetViewer = (show: boolean) => {
    viewState.set(show);
  };

  return {
    asset: readonly(viewingAssetStoreState),
    preloadAssets: readonly(preloadAssets),
    isViewing: viewState,
    gridScrollTarget,
    videoAutoplayDelayMs: readonly(videoAutoplayDelayMs),
    setAsset,
    setAssetId,
    showAssetViewer,
  };
}

export const assetViewingStore = createAssetViewingStore();
