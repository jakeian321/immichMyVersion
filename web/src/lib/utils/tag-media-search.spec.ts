import { matchesDuration } from '$lib/utils/tag-media-search';
import type { AssetResponseDto } from '@immich/sdk';
import { describe, expect, it } from 'vitest';

const asset = (duration: string | null): AssetResponseDto => ({ duration }) as AssetResponseDto;

describe('matchesDuration', () => {
  it('keeps everything when no bounds are set', () => {
    expect(matchesDuration(asset(null), null)).toBe(true);
  });

  it('includes a clip sitting exactly on the maximum', () => {
    // "30 seconds and under" has to keep a clip of exactly thirty
    expect(matchesDuration(asset('0:00:30.00000'), { min: 0, max: 30 })).toBe(true);
  });

  it('includes a clip sitting exactly on the minimum', () => {
    expect(matchesDuration(asset('0:00:30.00000'), { min: 30, max: Number.POSITIVE_INFINITY })).toBe(true);
  });

  it('drops a clip past the maximum', () => {
    expect(matchesDuration(asset('0:00:31.00000'), { min: 0, max: 30 })).toBe(false);
  });

  it('drops a clip short of the minimum', () => {
    expect(matchesDuration(asset('0:00:29.00000'), { min: 30, max: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('reads minutes and hours, not just the seconds field', () => {
    expect(matchesDuration(asset('1:02:03.00000'), { min: 3722, max: 3724 })).toBe(true);
  });

  it('drops an asset with no duration once bounds are set', () => {
    // a photo has no length to compare, so it cannot satisfy a length filter
    expect(matchesDuration(asset(null), { min: 0, max: 30 })).toBe(false);
  });
});
