
<!--  ORIGINAL CODE I EDITED 888999888 -->
<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import CircleIconButton from '$lib/components/elements/buttons/circle-icon-button.svelte';
  import { mdiInformationOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    onShowDetail: () => void;
  }

  let { onShowDetail }: Props = $props();
</script>

<svelte:window use:shortcut={{ shortcut: { key: 'i' }, onShortcut: onShowDetail }} />

<CircleIconButton color="opaque" icon={mdiInformationOutline} onclick={onShowDetail} title={$t('info')} />
 


<!-- my code 888999888

<script lang="ts">
  import { shortcut } from '$lib/actions/shortcut';
  import CircleIconButton from '$lib/components/elements/buttons/circle-icon-button.svelte';
  import { mdiInformationOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    onShowDetail: () => void;
  }

  let { onShowDetail }: Props = $props();
  
  // Always trigger the shortcut, prevent default behavior
  function handleShortcut() {
    onShowDetail();
    return false; // This prevents default behavior and stops propagation
  }
</script>

<svelte:window use:shortcut={{ shortcut: { key: 'i' }, onShortcut: handleShortcut }} />

<CircleIconButton color="opaque" icon={mdiInformationOutline} onclick={onShowDetail} title={$t('info')} />

-->