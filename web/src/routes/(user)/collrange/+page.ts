import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getAllAlbums } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async () => {
  await authenticate();
  const albums = await getAllAlbums({});
  const $t = await getFormatter();

  return {
    albums,
    meta: {
      title: $t('collrange'),
    },
  };
}) satisfies PageLoad;
