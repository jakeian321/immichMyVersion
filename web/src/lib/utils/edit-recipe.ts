import type { AlbumResponseDto } from '@immich/sdk';
import * as sdk from '@immich/sdk';

const EDIT_QUEUE_MARKER = 'immich-web-edit-queue';
const EDIT_QUEUE_ALBUM_NAME = 'Edit queue';

export interface EditSegment {
  /** seconds from the start of the source video */
  start: number;
  end: number;
}

export interface EditCrop {
  /** fractions of the source dimensions, 0-1, so the recipe survives any resolution */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EditRecipe {
  assetId: string;
  /** original filename, so the script can name the output without another lookup */
  fileName: string;
  segments: EditSegment[];
  crop?: EditCrop | null;
  queuedAt: string;
}

interface EditQueueDescription {
  marker: typeof EDIT_QUEUE_MARKER;
  recipes: EditRecipe[];
}

const isSegment = (value: unknown): value is EditSegment =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as EditSegment).start === 'number' &&
  typeof (value as EditSegment).end === 'number';

const isRecipe = (value: unknown): value is EditRecipe =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as EditRecipe).assetId === 'string' &&
  Array.isArray((value as EditRecipe).segments) &&
  (value as EditRecipe).segments.every((segment) => isSegment(segment));

const parseEditQueue = (description: string): EditQueueDescription | undefined => {
  try {
    const data = JSON.parse(description);
    if (data?.marker === EDIT_QUEUE_MARKER && Array.isArray(data.recipes)) {
      return { marker: EDIT_QUEUE_MARKER, recipes: data.recipes.filter((recipe: unknown) => isRecipe(recipe)) };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const stringifyEditQueue = (recipes: EditRecipe[]): string => JSON.stringify({ marker: EDIT_QUEUE_MARKER, recipes });

export const isEditQueueAlbum = (album: AlbumResponseDto): boolean => parseEditQueue(album.description) !== undefined;

export const getEditRecipes = (album: AlbumResponseDto): EditRecipe[] =>
  parseEditQueue(album.description)?.recipes ?? [];

const findEditQueueAlbums = async (): Promise<AlbumResponseDto[]> => {
  const albums = await sdk.getAllAlbums({});
  return albums.filter((album) => isEditQueueAlbum(album)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

export const findEditQueueAlbum = async (): Promise<AlbumResponseDto | undefined> => {
  const albums = await findEditQueueAlbums();
  return albums[0];
};

/**
 * Records what to cut from an asset.
 *
 * The recipe lives in a marker album's description rather than on the asset itself:
 * writing an asset description makes Immich rewrite that file's XMP sidecar, and the
 * whole point of this feature is that originals are never modified. Queueing an edit
 * touches no asset at all.
 *
 * Re-queueing the same asset replaces its previous recipe.
 */
export const queueEditRecipe = async (recipe: EditRecipe): Promise<void> => {
  const albums = await findEditQueueAlbums();
  const [primary, ...duplicates] = albums;

  // two saves in quick succession can each find no queue album and create one, so fold
  // any strays back into the oldest rather than leaving recipes stranded in a second
  // album the processor may never look at
  const existing = albums.flatMap((album) => getEditRecipes(album));
  const recipes = [...existing.filter((entry) => entry.assetId !== recipe.assetId), recipe];

  if (!primary) {
    await sdk.createAlbum({
      createAlbumDto: { albumName: EDIT_QUEUE_ALBUM_NAME, description: stringifyEditQueue(recipes) },
    });
    return;
  }

  await sdk.updateAlbumInfo({ id: primary.id, updateAlbumDto: { description: stringifyEditQueue(recipes) } });

  for (const duplicate of duplicates) {
    await sdk.updateAlbumInfo({ id: duplicate.id, updateAlbumDto: { description: stringifyEditQueue([]) } });
  }
};
