<script lang="ts" module>
  export type TagFilterMode = 'all' | 'any';
  /** seconds, inclusive at both ends; an open end is 0 or Infinity */
  export type DurationRange = { min: number; max: number };
</script>

<script lang="ts">
  import Button from '$lib/components/elements/buttons/button.svelte';
  import Checkbox from '$lib/components/elements/checkbox.svelte';
  import FullScreenModal from '$lib/components/shared-components/full-screen-modal.svelte';
  import LoadingSpinner from '$lib/components/shared-components/loading-spinner.svelte';
  import { mdiTagMultipleOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    tagOptions: { id: string; value: string }[];
    initialSelectedIds?: string[];
    /** shows the match-mode and tag-count controls; off for callers that only do AND */
    showAdvanced?: boolean;
    initialMode?: TagFilterMode;
    initialTagCount?: number | null;
    /** the option list is still being worked out, so show progress instead of "no tags" */
    isLoading?: boolean;
    loadingLabel?: string;
    /** shows the duration bounds; off for callers that filter on tags alone */
    showDuration?: boolean;
    initialDuration?: DurationRange | null;
    onApply: (tagIds: string[], mode: TagFilterMode, tagCount: number | null, duration: DurationRange | null) => void;
    onClose: () => void;
  }

  let {
    tagOptions,
    initialSelectedIds = [],
    showAdvanced = false,
    initialMode = 'all',
    initialTagCount = null,
    isLoading = false,
    loadingLabel = '',
    showDuration = false,
    initialDuration = null,
    onApply,
    onClose,
  }: Props = $props();

  let selectedIds = new SvelteSet<string>(initialSelectedIds);
  let mode = $state<TagFilterMode>(initialMode);
  let tagCountInput = $state(initialTagCount === null ? '' : String(initialTagCount));
  let minDurationInput = $state(initialDuration && initialDuration.min > 0 ? String(initialDuration.min) : '');
  let maxDurationInput = $state(
    initialDuration && Number.isFinite(initialDuration.max) ? String(initialDuration.max) : '',
  );
  // the options can arrive after the modal opens, so this has to track them
  let sortedOptions = $derived([...tagOptions].sort((a, b) => a.value.localeCompare(b.value)));

  const handleToggle = (tagId: string) => {
    if (selectedIds.has(tagId)) {
      selectedIds.delete(tagId);
    } else {
      selectedIds.add(tagId);
    }
  };

  // an empty box means "no bound this side" rather than zero, so each end falls back to
  // the widest value it could have had
  const readSeconds = (input: string, fallback: number) => {
    const parsed = Number(input.trim());
    return input.trim() === '' || Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
  };

  const handleApply = () => {
    const parsed = Number.parseInt(tagCountInput, 10);
    const tagCount = Number.isNaN(parsed) || parsed < 1 ? null : parsed;

    const min = readSeconds(minDurationInput, 0);
    const max = readSeconds(maxDurationInput, Number.POSITIVE_INFINITY);
    // both ends open is the same as not filtering, and a backwards range would match
    // nothing at all, which reads as a broken filter rather than an empty one
    const duration =
      !showDuration || (min === 0 && max === Number.POSITIVE_INFINITY) || max < min ? null : { min, max };

    onApply([...selectedIds], mode, tagCount, duration);
  };
</script>

<FullScreenModal title={$t('filter_by_tags')} icon={mdiTagMultipleOutline} {onClose}>
  <p class="text-sm text-gray-500 dark:text-gray-300">
    {showAdvanced && mode === 'any' ? $t('filter_by_tags_any_hint') : $t('filter_by_tags_hint')}
  </p>

  {#if showAdvanced}
    <div class="my-3 flex flex-wrap items-center gap-3">
      <div class="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
        <button
          type="button"
          class={['px-3 py-1 text-sm', mode === 'all' ? 'bg-immich-primary text-white' : '']}
          style="touch-action: manipulation"
          onclick={() => (mode = 'all')}
        >
          {$t('match_all_tags')}
        </button>
        <button
          type="button"
          class={['px-3 py-1 text-sm', mode === 'any' ? 'bg-immich-primary text-white' : '']}
          style="touch-action: manipulation"
          onclick={() => (mode = 'any')}
        >
          {$t('match_any_tag')}
        </button>
      </div>

      <label class="flex items-center gap-2 text-sm">
        {$t('total_tag_count')}
        <input
          class="w-16 rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-center text-sm dark:border-gray-600 dark:text-immich-dark-fg"
          type="text"
          inputmode="numeric"
          placeholder={$t('any')}
          bind:value={tagCountInput}
        />
      </label>
    </div>
    <p class="text-xs text-gray-500 dark:text-gray-400">{$t('total_tag_count_hint')}</p>
  {/if}

  {#if showDuration}
    <div class="my-3 flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-sm">
        {$t('duration_seconds')}
        <input
          class="w-20 rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-center text-sm dark:border-gray-600 dark:text-immich-dark-fg"
          type="text"
          inputmode="numeric"
          placeholder={$t('duration_from')}
          bind:value={minDurationInput}
        />
        <span class="text-gray-500 dark:text-gray-400">-</span>
        <input
          class="w-20 rounded-lg border border-gray-300 bg-transparent px-2 py-1 text-center text-sm dark:border-gray-600 dark:text-immich-dark-fg"
          type="text"
          inputmode="numeric"
          placeholder={$t('duration_to')}
          bind:value={maxDurationInput}
        />
      </label>
    </div>
    <p class="text-xs text-gray-500 dark:text-gray-400">{$t('duration_seconds_hint')}</p>
  {/if}

  {#if isLoading}
    <div class="flex flex-col items-center gap-3 py-8">
      <LoadingSpinner />
      {#if loadingLabel}
        <p class="text-sm text-gray-500 dark:text-gray-400">{loadingLabel}</p>
      {/if}
    </div>
  {:else if sortedOptions.length === 0}
    <p class="py-4 text-sm">{$t('no_tags_exist')}</p>
  {:else}
    <div class="my-4 flex max-h-96 flex-col gap-3 overflow-y-auto">
      {#each sortedOptions as tag (tag.id)}
        <Checkbox
          id="tag-filter-{tag.id}-checkbox"
          label={tag.value}
          labelClass="text-sm dark:text-immich-dark-fg"
          checked={selectedIds.has(tag.id)}
          onchange={() => handleToggle(tag.id)}
        />
      {/each}
    </div>
  {/if}

  {#snippet stickyBottom()}
    <Button color="gray" fullwidth onclick={onClose}>{$t('cancel')}</Button>
    <Button fullwidth disabled={isLoading || sortedOptions.length === 0} onclick={handleApply}>
      {$t('apply')}
    </Button>
  {/snippet}
</FullScreenModal>
