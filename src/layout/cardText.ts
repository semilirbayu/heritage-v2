import { lifeSpanLabel } from '../model/helpers';
import type { Person } from '../model/types';

/**
 * Card sub-line. `lifeSpanLabel` already returns `1989`, `1950 – 2010`,
 * `Deceased`, or an empty string. A death year with no birth becomes `? – 1942`.
 */
export function cardSubtext(person: Person): string {
  const label = lifeSpanLabel(person);
  if (label.startsWith('– ')) return `? ${label}`;
  return label;
}

/** Living, with a known birth year, and younger than 18. Undated people are drawn as adults. */
export function showsChildSilhouette(person: Person, today = new Date()): boolean {
  if (!person.isLiving) return false;
  const year = person.birth?.date?.year;
  if (year === undefined) return false;
  return today.getFullYear() - year < 18;
}

/**
 * Baseline of the first name line. MyHeritage centres the whole text block
 * (name lines 16 apart, sub text 19 below the last one) vertically in the
 * card: a single line sits at 55.5, and each extra line lifts the block by
 * half its height.
 */
export function cardFirstBaseline(nameLines: number, hasSubtext: boolean): number {
  const span = Math.max(0, nameLines - 1) * 16 + (hasSubtext ? 19 : 0);
  return 55.5 - span / 2;
}
