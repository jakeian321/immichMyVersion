import {
  chooseDuplicatesToSelect,
  findDuplicateGroups,
  normalizeFilename,
  paginateDuplicateGroups,
} from '$lib/utils/duplicate-detection';
import type { AssetResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';

const asset = (id: string, fileName: string, duration: string | null, size: number | null): AssetResponseDto =>
  ({
    id,
    originalFileName: fileName,
    duration: duration ?? '0:00:00.00000',
    exifInfo: size === null ? undefined : { fileSizeInByte: size },
  }) as AssetResponseDto;

describe('normalizeFilename', () => {
  it('strips the per-asset sequence prefix so two copies of a clip compare equal', () => {
    expect(normalizeFilename('a000000001_clip.mp4')).toBe('clip.mp4');
    expect(normalizeFilename('a000001847_clip.mp4')).toBe('clip.mp4');
  });

  it('leaves names without the prefix alone', () => {
    expect(normalizeFilename('video_dashinit.mp4')).toBe('video_dashinit.mp4');
  });
});

describe('findDuplicateGroups', () => {
  it('groups assets sharing name and duration but differing in size (a re-encode)', () => {
    const groups = findDuplicateGroups([
      asset('a', 'a000000001_clip.mp4', '00:00:15.000', 900),
      asset('b', 'a000000002_clip.mp4', '00:00:15.000', 500),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].assets.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('groups assets sharing duration and size under different names (a renamed copy)', () => {
    const groups = findDuplicateGroups([
      asset('a', 'video_dashinit.mp4', '00:00:01.700', 73_637),
      asset('b', 'video_dashinit 2.mp4', '00:00:01.700', 73_637),
    ]);

    expect(groups).toHaveLength(1);
  });

  it('does not group on a single shared property', () => {
    // same name only
    expect(
      findDuplicateGroups([asset('a', 'clip.mp4', '00:00:15.000', 900), asset('b', 'clip.mp4', '00:00:32.000', 500)]),
    ).toHaveLength(0);

    // same duration only - the case that would otherwise sweep up every 15s clip
    expect(
      findDuplicateGroups([asset('a', 'one.mp4', '00:00:15.000', 900), asset('b', 'two.mp4', '00:00:15.000', 500)]),
    ).toHaveLength(0);

    // same size only
    expect(
      findDuplicateGroups([asset('a', 'one.mp4', '00:00:15.000', 900), asset('b', 'two.mp4', '00:00:32.000', 900)]),
    ).toHaveLength(0);
  });

  it('never matches photos to each other on their empty duration', () => {
    const groups = findDuplicateGroups([
      asset('a', 'one.jpg', null, 900),
      asset('b', 'two.jpg', null, 500),
      asset('c', 'three.jpg', null, 100),
    ]);

    expect(groups).toHaveLength(0);
  });

  it('treats a missing file size as unknown rather than as a match', () => {
    const groups = findDuplicateGroups([
      asset('a', 'one.mp4', '00:00:15.000', null),
      asset('b', 'two.mp4', '00:00:15.000', null),
    ]);

    expect(groups).toHaveLength(0);
  });

  it('merges a chain into one group when matching is not transitive', () => {
    // a~b on name+duration, b~c on duration+size, a and c share only duration
    const groups = findDuplicateGroups([
      asset('a', 'a000000001_clip.mp4', '00:00:15.000', 900),
      asset('b', 'a000000002_clip.mp4', '00:00:15.000', 500),
      asset('c', 'other.mp4', '00:00:15.000', 500),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].assets).toHaveLength(3);
  });

  it('orders a group largest file first', () => {
    const groups = findDuplicateGroups([
      asset('small', 'a000000002_clip.mp4', '00:00:15.000', 500),
      asset('big', 'a000000001_clip.mp4', '00:00:15.000', 900),
    ]);

    expect(groups[0].assets.map((a) => a.id)).toEqual(['big', 'small']);
  });

  it('returns nothing for an album without duplicates', () => {
    expect(
      findDuplicateGroups([asset('a', 'one.mp4', '00:00:15.000', 900), asset('b', 'two.mp4', '00:00:32.000', 500)]),
    ).toHaveLength(0);
  });
});

describe('chooseDuplicatesToSelect', () => {
  const groups = findDuplicateGroups([
    asset('big', 'a000000001_clip.mp4', '00:00:15.000', 900),
    asset('small', 'a000000002_clip.mp4', '00:00:15.000', 500),
  ]);

  it('keeps the largest copy when none is tagged', () => {
    const { selectedIds, flaggedGroups } = chooseDuplicatesToSelect(groups, new Set());

    expect(selectedIds).toEqual(['small']);
    expect(flaggedGroups).toHaveLength(0);
  });

  it('keeps the tagged copy even when it is the smaller file', () => {
    const { selectedIds } = chooseDuplicatesToSelect(groups, new Set(['small']));

    expect(selectedIds).toEqual(['big']);
  });

  it('leaves a group alone and flags it when several copies are tagged', () => {
    const { selectedIds, flaggedGroups } = chooseDuplicatesToSelect(groups, new Set(['big', 'small']));

    expect(selectedIds).toEqual([]);
    expect(flaggedGroups).toHaveLength(1);
  });
});

describe('paginateDuplicateGroups', () => {
  const groupOf = (size: number): { assets: AssetResponseDto[] } => ({
    assets: Array.from({ length: size }, (_, index) => asset(`${size}-${index}`, 'x.mp4', null, null)),
  });

  it('never splits a group across pages', () => {
    const pages = paginateDuplicateGroups([groupOf(3), groupOf(2), groupOf(4)], 5);

    expect(pages.map((page) => page.reduce((total, group) => total + group.assets.length, 0))).toEqual([5, 4]);
  });

  it('gives a group larger than a page its own page rather than cutting it', () => {
    const pages = paginateDuplicateGroups([groupOf(7), groupOf(2)], 5);

    expect(pages).toHaveLength(2);
    expect(pages[0][0].assets).toHaveLength(7);
  });

  it('returns no pages for no groups', () => {
    expect(paginateDuplicateGroups([], 50)).toEqual([]);
  });
});
