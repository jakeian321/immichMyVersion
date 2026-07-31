import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getAllTags } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async () => {
  await authenticate();
  const tags = await getAllTags();
  const $t = await getFormatter();

  return {
    tags,
    meta: {
      title: $t('editing'),
    },
  };
}) satisfies PageLoad;
