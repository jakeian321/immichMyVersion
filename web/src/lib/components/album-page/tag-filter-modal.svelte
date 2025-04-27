

<script lang="ts">

  //I MADE THIS ENTIRE FILE SO MAYBE DELETE IF NOT NEEDED 888999888
  
    import { mdiClose, mdiFilterOutline, mdiFilterRemoveOutline } from '@mdi/js';
    import { t } from 'svelte-i18n';
    import Button from '../elements/buttons/button.svelte';
    import Combobox, { type ComboBoxOption } from '../shared-components/combobox.svelte';
    import FullScreenModal from '../shared-components/full-screen-modal.svelte';
    import { onMount } from 'svelte';
    import { getAllTags, type TagResponseDto } from '@immich/sdk';
    import Icon from '$lib/components/elements/icon.svelte';
    import { SvelteSet } from 'svelte/reactivity';
  
    interface Props {
      onFilter: (tagIds: string[]) => void;
      onCancel: () => void;
      initialTags?: string[];
    }
  
    let { onFilter, onCancel, initialTags = [] }: Props = $props();
  
    let allTags: TagResponseDto[] = $state([]);
    let tagMap = $derived(Object.fromEntries(allTags.map((tag) => [tag.id, tag])));
    let selectedIds = new SvelteSet<string>(initialTags);
  
    onMount(async () => {
      allTags = await getAllTags();
    });
  
    const handleSubmit = () => onFilter([...selectedIds]);
  
    const handleSelect = (option?: ComboBoxOption) => {
      if (!option || !option.id) return;
      selectedIds.add(option.value);
    };
  
    const handleRemove = (tag: string) => {
      selectedIds.delete(tag);
    };
  
    const clearFilters = () => {
      selectedIds.clear();
    };
  
    const onsubmit = (event: Event) => {
      event.preventDefault();
      handleSubmit();
    };
  </script>
  
  <FullScreenModal title={$t('filter_by_tags')} icon={mdiFilterOutline} onClose={onCancel}>
    <form {onsubmit} autocomplete="off" id="filter-tag-form">
      <div class="my-4 flex flex-col gap-2">
        <Combobox
          onSelect={handleSelect}
          label={$t('select_tags')}
          defaultFirstOption
          options={allTags.map((tag) => ({ id: tag.id, label: tag.value, value: tag.id }))}
          placeholder={$t('search_tags')}
        />
      </div>
    </form>
  
    {#if selectedIds.size > 0}
      <div class="mb-3 flex justify-between items-center">
        <h3 class="text-sm font-medium">{$t('selected_filters')}</h3>
        <button 
          type="button" 
          class="text-sm text-immich-primary dark:text-immich-dark-primary flex items-center gap-1"
          onclick={clearFilters}
        >
          <Icon path={mdiFilterRemoveOutline} size="16" />
          {$t('clear_all')}
        </button>
      </div>
    {/if}
  
    <section class="flex flex-wrap pt-2 gap-1">
      {#each selectedIds as tagId (tagId)}
        {@const tag = tagMap[tagId]}
        {#if tag}
          <div class="flex group transition-all">
            <span
              class="inline-block h-min whitespace-nowrap pl-3 pr-1 group-hover:pl-3 py-1 text-center align-baseline leading-none text-gray-100 dark:text-immich-dark-gray bg-immich-primary dark:bg-immich-dark-primary rounded-tl-full rounded-bl-full hover:bg-immich-primary/80 dark:hover:bg-immich-dark-primary/80 transition-all"
            >
              <p class="text-sm">
                {tag.value}
              </p>
            </span>
  
            <button
              type="button"
              class="text-gray-100 dark:text-immich-dark-gray bg-immich-primary/95 dark:bg-immich-dark-primary/95 rounded-tr-full rounded-br-full place-items-center place-content-center pr-2 pl-1 py-1 hover:bg-immich-primary/80 dark:hover:bg-immich-dark-primary/80 transition-all"
              title="Remove tag"
              onclick={() => handleRemove(tagId)}
            >
              <Icon path={mdiClose} />
            </button>
          </div>
        {/if}
      {/each}
    </section>
  
    {#snippet stickyBottom()}
      <Button color="gray" fullwidth onclick={onCancel}>{$t('cancel')}</Button>
      <Button type="submit" fullwidth form="filter-tag-form">{$t('apply_filters')}</Button>
    {/snippet}
  </FullScreenModal>