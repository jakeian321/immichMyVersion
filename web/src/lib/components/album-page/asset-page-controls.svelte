<script lang="ts">
  import Button from '$lib/components/elements/buttons/button.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import type { PagedAssetView } from '$lib/utils/paged-asset-view.svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    view: PagedAssetView;
  }

  let { view }: Props = $props();

  let pageInput = $state('1');
  let container: HTMLElement | undefined = $state();

  // follow the view whenever the page changes from the back/next buttons, so the box
  // always shows where we actually are rather than the last thing that was typed
  $effect(() => {
    pageInput = String(view.page + 1);
  });

  // these views live in their own scroll container, and the controls sit below the grid —
  // without this a new page opens scrolled to its end
  const scrollToTop = () => {
    for (let element = container?.parentElement; element; element = element.parentElement) {
      if (element.scrollHeight > element.clientHeight && /auto|scroll/.test(getComputedStyle(element).overflowY)) {
        element.scrollTo({ top: 0 });
        return;
      }
    }
  };

  const goToPage = (page: number) => {
    view.goToPage(page);
    scrollToTop();
  };

  const submitPage = () => {
    const requested = Number.parseInt(pageInput, 10);
    if (Number.isNaN(requested)) {
      pageInput = String(view.page + 1);
      return;
    }
    goToPage(requested - 1);
    pageInput = String(view.page + 1);
  };
</script>

<div class="flex flex-col items-center gap-2 py-4" bind:this={container}>
  <div class="flex flex-wrap items-center justify-center gap-2">
    <Button size="sm" color="gray" disabled={!view.hasPrevious} onclick={() => goToPage(view.page - 1)}>
      {$t('previous')}
    </Button>

    <form
      class="flex items-center gap-2"
      onsubmit={(event) => {
        event.preventDefault();
        submitPage();
      }}
    >
      <input
        class="w-16 rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-center text-sm dark:border-gray-600 dark:text-immich-dark-fg"
        type="text"
        inputmode="numeric"
        aria-label={$t('page_number')}
        bind:value={pageInput}
      />
      <Button size="sm" type="submit">{$t('submit')}</Button>
    </form>

    <Button size="sm" color="gray" disabled={!view.hasNext} onclick={() => goToPage(view.page + 1)}>
      {$t('next')}
    </Button>
  </div>

  <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
    <span>{$t('page_of_pages', { values: { current: view.page + 1, total: view.pageCount } })}</span>
    <span>·</span>
    <span>{$t('items_count', { values: { count: view.matched.length } })}</span>
    {#if view.isScanning}
      <LoadingSpinner />
    {/if}
  </div>
</div>
