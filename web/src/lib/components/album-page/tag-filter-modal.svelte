<script lang="ts">
  import Button from '$lib/components/elements/buttons/button.svelte';
  import Checkbox from '$lib/components/elements/checkbox.svelte';
  import FullScreenModal from '$lib/components/shared-components/full-screen-modal.svelte';
  import { mdiTagMultipleOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    tagOptions: { id: string; value: string }[];
    initialSelectedIds?: string[];
    onApply: (tagIds: string[]) => void;
    onClose: () => void;
  }

  let { tagOptions, initialSelectedIds = [], onApply, onClose }: Props = $props();

  let selectedIds = new SvelteSet<string>(initialSelectedIds);
  let sortedOptions = [...tagOptions].sort((a, b) => a.value.localeCompare(b.value));

  const handleToggle = (tagId: string) => {
    if (selectedIds.has(tagId)) {
      selectedIds.delete(tagId);
    } else {
      selectedIds.add(tagId);
    }
  };

  const handleApply = () => onApply([...selectedIds]);
</script>

<FullScreenModal title={$t('filter_by_tags')} icon={mdiTagMultipleOutline} {onClose}>
  <p class="text-sm text-gray-500 dark:text-gray-300">{$t('filter_by_tags_hint')}</p>

  {#if sortedOptions.length === 0}
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
    <Button fullwidth disabled={sortedOptions.length === 0} onclick={handleApply}>
      {$t('apply')}
    </Button>
  {/snippet}
</FullScreenModal>
