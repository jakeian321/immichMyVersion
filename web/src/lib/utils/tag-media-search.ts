import type { DurationRange, TagFilterMode } from '$lib/components/album-page/tag-filter-modal.svelte';
import { timeToSeconds } from '$lib/utils/date-time';
import { getAssetInfo, searchAssets, type AssetResponseDto } from '@immich/sdk';

/** the search API pages server-side, so ask for whole pages rather than a trickle */
const SEARCH_PAGE_SIZE = 250;
/** how many tag lookups run at once when the total-tag count has to be checked */
const CONCURRENT_TAG_CHECKS = 8;

export type TagMediaFilter = {
  tagIds: string[];
  mode: TagFilterMode;
  /** the asset's total number of tags, not how many of the selected ones matched */
  tagCount: number | null;
  duration: DurationRange | null;
};

export const emptyTagMediaFilter = (): TagMediaFilter => ({
  tagIds: [],
  mode: 'all',
  tagCount: null,
  duration: null,
});

/** inclusive at both ends, so a maximum of 30 keeps a clip of exactly thirty seconds */
export const matchesDuration = (asset: AssetResponseDto, duration: DurationRange | null): boolean => {
  if (duration === null) {
    return true;
  }
  if (!asset.duration) {
    return false;
  }
  const seconds = timeToSeconds(asset.duration);
  return seconds >= duration.min && seconds <= duration.max;
};

const searchByTags = async (tagIds: string[]): Promise<AssetResponseDto[]> => {
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
  return found;
};

/**
 * The server intersects the tag ids it is given, which is exactly 'all'. There is no
 * union to ask it for, so 'any' is run as one search per tag and merged here - still
 * server-side filtering, just a query per tag rather than a walk over the library.
 */
const searchByMode = async (tagIds: string[], mode: TagFilterMode): Promise<AssetResponseDto[]> => {
  if (mode === 'all') {
    return searchByTags(tagIds);
  }

  const merged = new Map<string, AssetResponseDto>();
  for (const tagId of tagIds) {
    for (const asset of await searchByTags([tagId])) {
      merged.set(asset.id, asset);
    }
  }
  return [...merged.values()];
};

/**
 * Keeps only assets carrying exactly `tagCount` tags in total. Search results don't
 * always come with their tags attached, so the ones that arrive without are looked up -
 * a cost worth paying only because the tag search has already narrowed the field.
 */
const filterByTagCount = async (assets: AssetResponseDto[], tagCount: number): Promise<AssetResponseDto[]> => {
  const kept: AssetResponseDto[] = [];
  const queue = [...assets];

  const worker = async () => {
    for (let asset = queue.shift(); asset !== undefined; asset = queue.shift()) {
      let tags = asset.tags;
      if (tags === undefined) {
        try {
          const info = await getAssetInfo({ id: asset.id });
          tags = info.tags ?? [];
        } catch {
          continue;
        }
      }
      if (tags.length === tagCount) {
        kept.push(asset);
      }
    }
  };

  await Promise.all(Array.from({ length: CONCURRENT_TAG_CHECKS }, () => worker()));
  // the workers race, so restore the order the search returned
  const position = new Map(assets.map((asset, index) => [asset.id, index]));
  return kept.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
};

/**
 * Finds the media a tag filter describes. Tags are matched by the server, then the
 * duration bounds and the total-tag count are applied here - duration first, because it
 * reads data the search already returned while the count may cost a request per asset,
 * so every clip dropped on length is one that never has to be looked up.
 */
export const searchAssetsByTagFilter = async (filter: TagMediaFilter): Promise<AssetResponseDto[]> => {
  if (filter.tagIds.length === 0) {
    return [];
  }

  let assets = await searchByMode(filter.tagIds, filter.mode);

  if (filter.duration !== null) {
    assets = assets.filter((asset) => matchesDuration(asset, filter.duration));
  }

  if (filter.tagCount !== null) {
    assets = await filterByTagCount(assets, filter.tagCount);
  }

  return assets;
};
