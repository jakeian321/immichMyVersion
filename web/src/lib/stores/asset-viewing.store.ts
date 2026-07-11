import { getKey } from '$lib/utils';
import { type AssetGridRouteSearchParams } from '$lib/utils/navigation';
import { getAssetInfo, type AssetResponseDto } from '@immich/sdk';
import { get, readonly, writable } from 'svelte/store';

function createAssetViewingStore() {
  const viewingAssetStoreState = writable<AssetResponseDto>();
  const preloadAssets = writable<AssetResponseDto[]>([]);
  const viewState = writable<boolean>(false);
  const gridScrollTarget = writable<AssetGridRouteSearchParams | null | undefined>();
  // extra delay before a video starts playing, used by non-virtualized grids (e.g. the
  // album page's duration/filename-date sort views) where many assets stay mounted at once
  // and can otherwise starve the viewer's video of decode resources right at playback start
  const videoAutoplayDelayMs = writable<number>(0);
  // the full ordered asset list of the view the asset was opened from, when the opener has
  // one (e.g. gallery viewer). Consumed by the frame-preview-all feed; empty when unknown.
  const feedAssets = writable<AssetResponseDto[]>([]);

  const setAsset = (
    asset: AssetResponseDto,
    assetsToPreload: AssetResponseDto[] = [],
    autoplayDelayMs = 0,
    // null keeps the current feed: several places re-set the already-viewed asset without
    // knowing the view context (e.g. the (user) layout after navigation), and that must
    // not wipe the feed the opening view provided. The feed is cleared on viewer close.
    feed: AssetResponseDto[] | null = null,
  ) => {
    preloadAssets.set(assetsToPreload);
    videoAutoplayDelayMs.set(autoplayDelayMs);
    if (feed) {
      feedAssets.set(feed);
    }
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
    if (!show) {
      feedAssets.set([]);
      pendingVideoSeek.set(null);
    }
  };

  // a one-shot seek request, applied (and cleared) by the video viewer when it loads the
  // matching asset. Set together with setAsset to open a video at a specific time, e.g.
  // when jumping to a frame of another video from the frame-preview-all feed.
  const pendingVideoSeek = writable<{ assetId: string; time: number } | null>(null);

  const setPendingVideoSeek = (assetId: string, time: number) => {
    pendingVideoSeek.set({ assetId, time });
  };

  const consumePendingVideoSeek = (assetId: string): number | null => {
    const pending = get(pendingVideoSeek);
    if (!pending || pending.assetId !== assetId) {
      return null;
    }
    pendingVideoSeek.set(null);
    return pending.time;
  };

  return {
    asset: readonly(viewingAssetStoreState),
    preloadAssets: readonly(preloadAssets),
    feedAssets: readonly(feedAssets),
    isViewing: viewState,
    gridScrollTarget,
    videoAutoplayDelayMs: readonly(videoAutoplayDelayMs),
    setAsset,
    setAssetId,
    showAssetViewer,
    setPendingVideoSeek,
    consumePendingVideoSeek,
  };
}

export const assetViewingStore = createAssetViewingStore();
