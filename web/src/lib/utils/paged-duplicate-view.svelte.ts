import { paginateDuplicateGroups, type DuplicateGroup } from '$lib/utils/duplicate-detection';
import type { AssetResponseDto } from '@immich/sdk';

export const DUPLICATE_PAGE_SIZE = 50;

/**
 * Pages duplicate groups the way PagedAssetView pages plain assets, except that a page
 * boundary never falls inside a group - the copies of one clip have to stay side by side
 * to be compared, so a page holds up to DUPLICATE_PAGE_SIZE assets rather than exactly
 * that many.
 */
export class PagedDuplicateView {
  groups = $state<DuplicateGroup[]>([]);
  page = $state(0);
  isLoading = $state(false);
  /** never true here: the scan is synchronous, but the shared controls expect the field */
  readonly isScanning = false;

  pages = $derived(paginateDuplicateGroups(this.groups, DUPLICATE_PAGE_SIZE));
  pageGroups = $derived(this.pages[this.page] ?? []);
  pageAssets = $derived(this.pageGroups.flatMap((group) => group.assets));
  /** every duplicate asset across all pages; the controls show its length as the count */
  matched = $derived(this.groups.flatMap((group) => group.assets));
  pageCount = $derived(Math.max(1, this.pages.length));
  hasPrevious = $derived(this.page > 0);
  hasNext = $derived(this.page + 1 < this.pageCount);

  reset() {
    this.groups = [];
    this.page = 0;
    this.isLoading = false;
  }

  beginLoading() {
    this.reset();
    this.isLoading = true;
  }

  setGroups(groups: DuplicateGroup[]) {
    this.groups = groups;
    this.page = 0;
    this.isLoading = false;
  }

  goToPage(page: number) {
    this.page = Math.min(Math.max(page, 0), this.pageCount - 1);
  }

  /**
   * Drops assets that no longer exist (just deleted, say). A group that falls to a single
   * remaining copy isn't a duplicate any more and goes with them.
   */
  removeAssets(removedIds: ReadonlySet<string>) {
    const remaining: DuplicateGroup[] = [];
    for (const group of this.groups) {
      const assets = group.assets.filter((asset: AssetResponseDto) => !removedIds.has(asset.id));
      if (assets.length > 1) {
        remaining.push({ assets });
      }
    }
    this.groups = remaining;
    this.page = Math.min(this.page, this.pageCount - 1);
  }
}
