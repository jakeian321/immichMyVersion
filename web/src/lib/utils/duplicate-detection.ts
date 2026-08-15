import type { AssetResponseDto } from '@immich/sdk';

/**
 * Finding likely duplicates inside a single album.
 *
 * Byte-identical copies don't occur here - Immich refuses them at upload - so the real
 * duplicates are re-encodes and re-downloads of the same clip. No single property
 * identifies those: a filename can repeat across genuinely different videos, and plenty
 * of unrelated clips share a duration. Two assets are therefore treated as duplicates
 * only when at least two of three independent properties agree.
 */

/**
 * Downloads are prefixed with a per-asset sequence number (a000000001_), which differs
 * between two copies of the same video and would otherwise stop their names matching.
 */
const SEQUENCE_PREFIX = /^a\d+_/;

/** what Immich reports for assets that aren't video; not a real duration to compare */
const EMPTY_DURATION = '0:00:00.00000';

export type DuplicateGroup = {
  /** ordered largest file first, so the best copy leads */
  assets: AssetResponseDto[];
};

export const normalizeFilename = (fileName: string): string =>
  fileName.replace(SEQUENCE_PREFIX, '').trim().toLowerCase();

const fileSizeOf = (asset: AssetResponseDto): number | null => asset.exifInfo?.fileSizeInByte ?? null;

const durationOf = (asset: AssetResponseDto): string | null => {
  const duration = asset.duration;
  return !duration || duration === EMPTY_DURATION ? null : duration;
};

/** how many of {name, duration, size} two assets agree on; null properties never match */
const sharedSignals = (a: AssetResponseDto, b: AssetResponseDto): number => {
  let shared = 0;

  if (normalizeFilename(a.originalFileName) === normalizeFilename(b.originalFileName)) {
    shared += 1;
  }

  const durationA = durationOf(a);
  if (durationA !== null && durationA === durationOf(b)) {
    shared += 1;
  }

  const sizeA = fileSizeOf(a);
  if (sizeA !== null && sizeA === fileSizeOf(b)) {
    shared += 1;
  }

  return shared;
};

export const REQUIRED_SIGNALS = 2;

/**
 * Groups an album's assets into clusters of likely duplicates.
 *
 * Any qualifying pair shares at least two properties, so it must share either the name
 * or the size - comparing only within name buckets and size buckets therefore finds
 * every pair without the quadratic sweep over the whole album that would otherwise be
 * needed. Duration is never bucketed on its own, which matters because hundreds of clips
 * can share exactly 15 seconds.
 *
 * Matching isn't transitive (A and B may agree on name+duration while B and C agree on
 * duration+size), so matched pairs are merged with a union-find and each connected
 * component becomes one group.
 */
export const findDuplicateGroups = (assets: AssetResponseDto[]): DuplicateGroup[] => {
  const parent = new Map<string, string>();

  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) as string;
    }
    // path compression, so repeated lookups over a long chain stay cheap
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootA, rootB);
    }
  };

  for (const asset of assets) {
    parent.set(asset.id, asset.id);
  }

  const byName = new Map<string, AssetResponseDto[]>();
  const bySize = new Map<number, AssetResponseDto[]>();

  for (const asset of assets) {
    const name = normalizeFilename(asset.originalFileName);
    const existingByName = byName.get(name);
    if (existingByName) {
      existingByName.push(asset);
    } else {
      byName.set(name, [asset]);
    }

    const size = fileSizeOf(asset);
    if (size !== null) {
      const existingBySize = bySize.get(size);
      if (existingBySize) {
        existingBySize.push(asset);
      } else {
        bySize.set(size, [asset]);
      }
    }
  }

  for (const bucket of [...byName.values(), ...bySize.values()]) {
    if (bucket.length < 2) {
      continue;
    }
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        if (sharedSignals(bucket[i], bucket[j]) >= REQUIRED_SIGNALS) {
          union(bucket[i].id, bucket[j].id);
        }
      }
    }
  }

  const clusters = new Map<string, AssetResponseDto[]>();
  for (const asset of assets) {
    const root = find(asset.id);
    const existing = clusters.get(root);
    if (existing) {
      existing.push(asset);
    } else {
      clusters.set(root, [asset]);
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const members of clusters.values()) {
    if (members.length < 2) {
      continue;
    }
    groups.push({
      assets: members.slice().sort((a, b) => {
        const sizeDifference = (fileSizeOf(b) ?? 0) - (fileSizeOf(a) ?? 0);
        return sizeDifference === 0 ? a.originalFileName.localeCompare(b.originalFileName) : sizeDifference;
      }),
    });
  }

  // album order, judged by each group's earliest member, so paging through the results
  // follows the album rather than an arbitrary hash order
  const position = new Map(assets.map((asset, index) => [asset.id, index]));
  const earliest = (group: DuplicateGroup) => Math.min(...group.assets.map((a) => position.get(a.id) ?? 0));
  return groups.sort((a, b) => earliest(a) - earliest(b));
};

export type DuplicateSelection = {
  /** the copies to delete: everything except one keeper per group */
  selectedIds: string[];
  /** groups deliberately left alone because more than one copy carries tags */
  flaggedGroups: DuplicateGroup[];
};

/**
 * Chooses which copies to select for deletion.
 *
 * A tagged copy is always the keeper - tagging is work, and the untagged copies are the
 * disposable ones. When several copies are tagged the group is left entirely untouched
 * and reported instead, so tagging is never destroyed by a bulk action. Otherwise the
 * largest file survives, being the least-compressed encode.
 */
export const chooseDuplicatesToSelect = (
  groups: DuplicateGroup[],
  taggedAssetIds: ReadonlySet<string>,
): DuplicateSelection => {
  const selectedIds: string[] = [];
  const flaggedGroups: DuplicateGroup[] = [];

  for (const group of groups) {
    const tagged = group.assets.filter((asset) => taggedAssetIds.has(asset.id));

    if (tagged.length > 1) {
      flaggedGroups.push(group);
      continue;
    }

    // groups are already ordered largest first, so the head is the fallback keeper
    const keeper = tagged.length === 1 ? tagged[0] : group.assets[0];
    for (const asset of group.assets) {
      if (asset.id !== keeper.id) {
        selectedIds.push(asset.id);
      }
    }
  }

  return { selectedIds, flaggedGroups };
};

/**
 * Packs groups into pages of at most `pageSize` assets without ever splitting a group,
 * so the copies of one clip always appear side by side on the same page. A single group
 * larger than a page still gets its own page rather than being cut in half.
 */
export const paginateDuplicateGroups = (groups: DuplicateGroup[], pageSize: number): DuplicateGroup[][] => {
  const pages: DuplicateGroup[][] = [];
  let current: DuplicateGroup[] = [];
  let count = 0;

  for (const group of groups) {
    if (current.length > 0 && count + group.assets.length > pageSize) {
      pages.push(current);
      current = [];
      count = 0;
    }
    current.push(group);
    count += group.assets.length;
  }

  if (current.length > 0) {
    pages.push(current);
  }

  return pages;
};
