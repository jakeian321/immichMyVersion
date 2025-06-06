<!-- <script lang="ts">
  import { mdiClose, mdiTag } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import Button from '../elements/buttons/button.svelte';
  import Combobox, { type ComboBoxOption } from '../shared-components/combobox.svelte';
  import FullScreenModal from '../shared-components/full-screen-modal.svelte';
  import { onMount } from 'svelte';
  import { getAllTags, upsertTags, type TagResponseDto } from '@immich/sdk';
  import Icon from '$lib/components/elements/icon.svelte';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    onTag: (tagIds: string[]) => void;
    onCancel: () => void;
  }

  let { onTag, onCancel }: Props = $props();

  let allTags: TagResponseDto[] = $state([]);
  let tagMap = $derived(Object.fromEntries(allTags.map((tag) => [tag.id, tag])));
  let selectedIds = new SvelteSet<string>();
  let disabled = $derived(selectedIds.size === 0);
  let allowCreate: boolean = $state(true);

  onMount(async () => {
    allTags = await getAllTags();
  });

  const handleSubmit = () => onTag([...selectedIds]);

  const handleSelect = async (option?: ComboBoxOption) => {
    if (!option) {
      return;
    }

    if (option.id) {
      selectedIds.add(option.value);
    } else {
      const [newTag] = await upsertTags({ tagUpsertDto: { tags: [option.label] } });
      allTags.push(newTag);
      selectedIds.add(newTag.id);
    }
  };

  const handleRemove = (tag: string) => {
    selectedIds.delete(tag);
  };

  const onsubmit = (event: Event) => {
    event.preventDefault();
    handleSubmit();
  };
</script>

<FullScreenModal title={$t('tag_assets')} icon={mdiTag} onClose={onCancel}>
  <form {onsubmit} autocomplete="off" id="create-tag-form">
    <div class="my-4 flex flex-col gap-2">
      <Combobox
        onSelect={handleSelect}
        label={$t('tag')}
        {allowCreate}
        defaultFirstOption
        options={allTags.map((tag) => ({ id: tag.id, label: tag.value, value: tag.id }))}
        placeholder={$t('search_tags')}
      />
    </div>
  </form>

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
    <Button type="submit" fullwidth form="create-tag-form" {disabled}>{$t('tag_assets')}</Button>
  {/snippet}
</FullScreenModal> -->




<script lang="ts">
  import { mdiClose, mdiTag } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import Button from '../elements/buttons/button.svelte';
  import Combobox, { type ComboBoxOption } from '../shared-components/combobox.svelte';
  import FullScreenModal from '../shared-components/full-screen-modal.svelte';
  import { onMount } from 'svelte';
  import { getAllTags, upsertTags, type TagResponseDto } from '@immich/sdk';
  import Icon from '$lib/components/elements/icon.svelte';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    onTag: (tagIds: string[]) => void;
    onCancel: () => void;
  }

  let { onTag, onCancel }: Props = $props();

  let allTags: TagResponseDto[] = $state([]);
  let tagMap = $derived(Object.fromEntries(allTags.map((tag) => [tag.id, tag])));
  let selectedIds = new SvelteSet<string>();
  let disabled = $derived(selectedIds.size === 0);
  let allowCreate: boolean = $state(true);
  
  // Reference to the form element for outsideClick detection
  let formElement: HTMLFormElement;

  onMount(async () => {
    allTags = await getAllTags();
    
    // Set up the outsideClick handler after a short delay to prevent immediate triggering
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 100);
  });
  
  // Clean up event listener when component is unmounted
  const onDestroy = () => {
    document.removeEventListener('click', handleOutsideClick);
  };
  
  // Handle clicks outside the form
  const handleOutsideClick = (event: MouseEvent) => {
    // Check if formElement exists and contains the clicked element
    if (formElement && !formElement.contains(event.target as Node)) {
      // If we have selected tags and click outside, auto-save
      if (selectedIds.size > 0) {
        handleSubmit();
      } else {
        // If no tags selected, just close
        onCancel();
      }
      
      // Remove the event listener
      document.removeEventListener('click', handleOutsideClick);
    }
  };

  const handleSubmit = () => onTag([...selectedIds]);

  const handleSelect = async (option?: ComboBoxOption) => {
    if (!option) {
      return;
    }

    if (option.id) {
      selectedIds.add(option.value);
    } else {
      const [newTag] = await upsertTags({ tagUpsertDto: { tags: [option.label] } });
      allTags.push(newTag);
      selectedIds.add(newTag.id);
    }
  };

  const handleRemove = (tag: string) => {
    selectedIds.delete(tag);
  };

  const onsubmit = (event: Event) => {
    event.preventDefault();
    handleSubmit();
  };
</script>

<FullScreenModal title={$t('tag_assets')} icon={mdiTag} onClose={onCancel}>
  <form {onsubmit} autocomplete="off" id="create-tag-form" bind:this={formElement}>
    <div class="my-4 flex flex-col gap-2">
      <Combobox
        onSelect={handleSelect}
        label={$t('tag')}
        {allowCreate}
        defaultFirstOption
        options={allTags.map((tag) => ({ id: tag.id, label: tag.value, value: tag.id }))}
        placeholder={$t('search_tags')}
      />
    </div>
  </form>

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
    <Button type="submit" fullwidth form="create-tag-form" {disabled}>{$t('tag_assets')}</Button>
  {/snippet}
</FullScreenModal>