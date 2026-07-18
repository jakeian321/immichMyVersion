import { writable } from 'svelte/store';

/**
 * Per-album "age number" anchor: `age` corresponds to filename dates within one year
 * starting at the anchor date; each year earlier is one less, each year later one more.
 * Persisted as a marker in the album description (e.g. "[agenum:90:20260216]") so it
 * syncs across devices, and published here by the album page so thumbnails can render
 * a badge without any prop plumbing.
 */
export interface FilenameAgeAnchor {
  age: number;
  year: number;
  month: number;
  day: number;
}

const ANCHOR_MARKER_PATTERN = /\[agenum:(\d+):(\d{4})(\d{2})(\d{2})\]/;
// matches an 8-digit YYYYMMDD run in a filename without matching into longer digit runs
const FILENAME_DATE_PATTERN = /(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/;

export const filenameAgeAnchor = writable<FilenameAgeAnchor | null>(null);

export const parseAgeAnchor = (description: string | null | undefined): FilenameAgeAnchor | null => {
  const match = (description ?? '').match(ANCHOR_MARKER_PATTERN);
  if (!match) {
    return null;
  }

  const [, age, year, month, day] = match;
  const monthNum = Number(month);
  const dayNum = Number(day);
  if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
    return null;
  }

  return { age: Number(age), year: Number(year), month: monthNum, day: dayNum };
};

export const stringifyAgeAnchor = ({ age, year, month, day }: FilenameAgeAnchor): string =>
  `[agenum:${age}:${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}]`;

export const stripAgeAnchor = (description: string | null | undefined): string =>
  (description ?? '').replaceAll(new RegExp(ANCHOR_MARKER_PATTERN, 'g'), '').trim();

export const getAgeForFilename = (anchor: FilenameAgeAnchor, filename: string): number | null => {
  const match = filename.match(FILENAME_DATE_PATTERN);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  // whole years between the anchor date and the filename date, negative for earlier
  let diff = year - anchor.year;
  if (month < anchor.month || (month === anchor.month && day < anchor.day)) {
    diff -= 1;
  }

  return anchor.age + diff;
};
