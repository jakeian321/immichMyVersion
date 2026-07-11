import { authenticate } from '$lib/utils/auth';
import { getAllAlbums } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async () => {
  await authenticate();

  const [albums, sharedAlbums] = await Promise.all([getAllAlbums({ shared: false }), getAllAlbums({ shared: true })]);

  return {
    albums,
    sharedAlbums,
    meta: { title: 'Photo Explore' },
  };
}) satisfies PageLoad;
