import type { AssetResponseDto } from '@immich/sdk';

export const ASSET_PAGE_SIZE = 50;

/**
 * What asset-page-controls needs from a pager. PagedAssetView and PagedDuplicateView
 * both satisfy it, so the same Back/page-number/Next bar drives either.
 */
export interface PagedView {
  page: number;
  pageCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  isScanning: boolean;
  matched: unknown[];
  goToPage(page: number): void;
}

/**
 * Paging for the album page's review views (sort by duration/date/name/likes, duration
 * range, tag filter).
 *
 * Every match is collected into one list so the pager can jump straight to any page and
 * walk backwards, which a forward-only scan can't do. Deciding whether an asset belongs
 * in a view needs a per-asset request, so the scan runs in the background and the first
 * page is published as soon as it fills — the grid renders just as quickly as it did
 * when only one page was ever fetched, and the total page count settles behind it.
 */
export class PagedAssetView {
  /** every asset that has matched so far, in candidate order */
  matched = $state<AssetResponseDto[]>([]);
  /** zero-based index of the page being shown */
  page = $state(0);
  /** true until there is something to render */
  isLoading = $state(false);
  /** true while matches are still being discovered behind the visible page */
  isScanning = $state(false);

  // bumped on every reset so an abandoned scan stops writing to state
  #generation = 0;

  pageAssets = $derived(this.matched.slice(this.page * ASSET_PAGE_SIZE, (this.page + 1) * ASSET_PAGE_SIZE));
  pageCount = $derived(Math.max(1, Math.ceil(this.matched.length / ASSET_PAGE_SIZE)));
  hasPrevious = $derived(this.page > 0);
  hasNext = $derived(this.page + 1 < this.pageCount);

  /** discards any in-flight scan and empties the view */
  reset() {
    this.#generation += 1;
    this.matched = [];
    this.page = 0;
    this.isLoading = false;
    this.isScanning = false;
  }

  /** replaces the contents in one go, for callers whose filtering already happened server-side */
  setAll(assets: AssetResponseDto[]) {
    this.reset();
    this.matched = assets;
  }

  /** clears the view and shows the loading state while its candidates are being fetched */
  beginLoading() {
    this.reset();
    this.isLoading = true;
  }

  goToPage(page: number) {
    this.page = Math.min(Math.max(page, 0), this.pageCount - 1);
  }

  /**
   * Walks `candidates` in order, keeping the ones `include` accepts. Returns immediately;
   * progress is reported through `isLoading`, `isScanning` and `matched`.
   */
  scan(
    candidates: AssetResponseDto[],
    include: (asset: AssetResponseDto) => Promise<boolean>,
    concurrency: number,
  ): void {
    this.reset();
    const generation = this.#generation;
    this.isLoading = true;
    this.isScanning = true;

    const run = async () => {
      const found: AssetResponseDto[] = [];

      for (let index = 0; index < candidates.length; index += concurrency) {
        const batch = candidates.slice(index, index + concurrency);
        const keeps = await Promise.all(batch.map((asset) => include(asset)));

        if (generation !== this.#generation) {
          return;
        }

        for (const [batchIndex, keep] of keeps.entries()) {
          if (keep) {
            found.push(batch[batchIndex]);
          }
        }

        this.matched = [...found];
        if (found.length >= ASSET_PAGE_SIZE) {
          this.isLoading = false;
        }
      }
    };

    void run().finally(() => {
      if (generation === this.#generation) {
        this.isLoading = false;
        this.isScanning = false;
      }
    });
  }
}
