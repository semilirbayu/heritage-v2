/** Tree geometry in the same units MyHeritage uses at zoom 1. */

export const CARD_W = 220;
export const CARD_H = 102;
export const ROW_DY = 188;
export const COUPLE_DX = 254;
export const UNIT_GAP = 57;
export const CORNER_R = 30;

/** Horizontal centre of a couple measured from the left card's left edge. */
export const COUPLE_MID_OFFSET = (COUPLE_DX + CARD_W) / 2;

export const MAX_VISIBLE = 1000;

/**
 * "5+" / `all` walks this many generations. Deep enough for real GEDCOM files;
 * the 1000-person cap is what actually bounds the drawing.
 */
export const ALL_GENERATIONS = 32;

export type GenerationDepth = 1 | 2 | 3 | 4 | 'all';

export interface VisibilityOptions {
  generations: GenerationDepth;
  cousins: boolean;
}

export function generationLimit(generations: GenerationDepth): number {
  return generations === 'all' ? ALL_GENERATIONS : generations;
}
