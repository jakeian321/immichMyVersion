<script lang="ts">
  import CircleIconButton from '$lib/components/elements/buttons/circle-icon-button.svelte';
  import Icon from '$lib/components/elements/icon.svelte';
  import { mdiClose, mdiMagnify, mdiStar, mdiStarOutline } from '@mdi/js';
  import { Input } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    searchTerm?: string;
    albumSearchTerm?: string;
    isStarred?: boolean;
    onsearch?: () => void;
    onAlbumSearch?: () => void;
    onclear?: () => void;
    onAlbumClear?: () => void;
  }

  let {
    searchTerm = $bindable(''),
    albumSearchTerm = $bindable(undefined),
    isStarred = $bindable(false),
    onsearch,
    onAlbumSearch,
    onclear,
    onAlbumClear,
  }: Props = $props();

  const toggleStarred = () => {
    isStarred = !isStarred;
  };

  const clearSearch = () => {
    searchTerm = '';
    onclear?.();
  };

  const clearAlbumSearch = () => {
    albumSearchTerm = '';
    onAlbumClear?.();
  };
</script>

<div class="mb-4 flex flex-wrap items-center gap-3">
  <form
    class="flex items-center gap-2"
    onsubmit={(e) => {
      e.preventDefault();
      onsearch?.();
    }}
  >
    <div class="relative w-full max-w-xs">
      <div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <Icon path={mdiMagnify} class="text-gray-500 dark:text-gray-400" />
      </div>
      <Input bind:value={searchTerm} placeholder={$t('search_by_filename')} class="pl-10 pr-9" />
      {#if searchTerm}
        <button
          type="button"
          class="absolute inset-y-0 right-2 flex items-center text-gray-500 dark:text-gray-400"
          title={$t('clear_value')}
          onclick={clearSearch}
        >
          <Icon path={mdiClose} />
        </button>
      {/if}
    </div>
    <button
      type="submit"
      class="flex-shrink-0 rounded-lg bg-immich-primary px-3 py-2 text-sm font-medium text-white transition-all hover:bg-immich-primary/90 dark:bg-immich-dark-primary dark:text-immich-dark-bg dark:hover:bg-immich-dark-primary/90"
    >
      <Icon path={mdiMagnify} size="1.1rem" />
    </button>
  </form>

  {#if albumSearchTerm !== undefined}
    <form
      class="flex items-center gap-2"
      onsubmit={(e) => {
        e.preventDefault();
        onAlbumSearch?.();
      }}
    >
      <div class="relative w-full max-w-xs">
        <div class="pointer-events-none absolute inset-y-0 left-3 flex items-center">
          <Icon path={mdiMagnify} class="text-gray-500 dark:text-gray-400" />
        </div>
        <Input bind:value={albumSearchTerm} placeholder={$t('search_in_album')} class="pl-10 pr-9" />
        {#if albumSearchTerm}
          <button
            type="button"
            class="absolute inset-y-0 right-2 flex items-center text-gray-500 dark:text-gray-400"
            title={$t('clear_value')}
            onclick={clearAlbumSearch}
          >
            <Icon path={mdiClose} />
          </button>
        {/if}
      </div>
      <button
        type="submit"
        class="flex-shrink-0 rounded-lg bg-immich-primary px-3 py-2 text-sm font-medium text-white transition-all hover:bg-immich-primary/90 dark:bg-immich-dark-primary dark:text-immich-dark-bg dark:hover:bg-immich-dark-primary/90"
      >
        <Icon path={mdiMagnify} size="1.1rem" />
      </button>
    </form>
  {/if}

  <div class="filter-section">
    <CircleIconButton
      title={isStarred ? $t('show_all') : $t('show_favorites')}
      icon={isStarred ? mdiStar : mdiStarOutline}
      color={isStarred ? 'primary' : 'gray'}
      onclick={toggleStarred}
    />
  </div>
</div>
