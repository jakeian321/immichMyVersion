import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getAssetInfoFromParam } from '$lib/utils/navigation';
import { getAllTags } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ params }) => {
  await authenticate();
  const tags = await getAllTags();
  // the user layout closes the viewer for any page that doesn't hand it back the asset
  // named in the url, so stepping to the next one has to resolve it here
  const asset = await getAssetInfoFromParam(params);
  const $t = await getFormatter();

  return {
    tags,
    asset,
    meta: {
      title: $t('editing'),
    },
  };
}) satisfies PageLoad;
