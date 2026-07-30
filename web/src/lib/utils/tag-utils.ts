import { getAllTags, upsertTags, type TagResponseDto } from '@immich/sdk';

/**
 * Immich stores tag values case-sensitively, so "top", "Top" and "TOP" are three separate
 * tags that never match each other. Everything created from the web app is normalized to
 * one capitalized spelling ("semitop" -> "Semitop", "topTOK" -> "Toptok") and matched
 * case-insensitively against what already exists, so a tag only ever has one form.
 *
 * Nested tags keep their "parent/child" structure; each segment is normalized on its own.
 */
export const normalizeTagValue = (value: string) =>
  value
    .trim()
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join('/');

/**
 * Resolves `value` to a tag, reusing an existing tag that differs only by case instead of
 * creating a second spelling of it. Pass `knownTags` when the caller already has the tag
 * list to avoid re-fetching it.
 */
export const upsertTagByValue = async (
  value: string,
  knownTags?: TagResponseDto[],
): Promise<TagResponseDto | undefined> => {
  const normalized = normalizeTagValue(value);
  if (!normalized) {
    return undefined;
  }

  const existing = knownTags ?? (await getAllTags());
  const match = existing.find((tag) => tag.value.toLowerCase() === normalized.toLowerCase());
  if (match) {
    return match;
  }

  const [created] = await upsertTags({ tagUpsertDto: { tags: [normalized] } });
  return created;
};
