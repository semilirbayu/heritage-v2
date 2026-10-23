/**
 * Greedy name wrap for a person card.
 *
 * The text block is 127px wide and at most 3 lines. In the browser, width
 * comes from a cached canvas measured with
 * `500 15px "Helvetica Neue", Helvetica, Arial, sans-serif`.
 * Tests and SSR use the per-character table below (Helvetica Neue Medium
 * 15px advances). Summing those advances puts every calibrated name on the
 * same side of 127px as Chrome's measureText.
 */

export const NAME_MAX_WIDTH = 127;
export const NAME_MAX_LINES = 3;
export const NAME_FONT = '500 15px "Helvetica Neue", Helvetica, Arial, sans-serif';

/** Advance widths in px. Unknown characters fall back to a typical lowercase. */
const CHAR_WIDTH: Record<string, number> = {
  A: 10.005,
  B: 10.56,
  C: 10.83,
  D: 10.83,
  E: 9.45,
  F: 8.895,
  G: 11.385,
  H: 10.83,
  I: 4.17,
  J: 8.055,
  K: 10.275,
  L: 8.61,
  M: 13.335,
  N: 10.83,
  O: 11.4,
  P: 10.005,
  Q: 11.4,
  R: 10.56,
  S: 9.72,
  T: 8.895,
  U: 10.83,
  V: 9.165,
  W: 14.16,
  X: 9.72,
  Y: 9.72,
  Z: 9.45,
  a: 8.34,
  b: 9.165,
  c: 8.34,
  d: 9.165,
  e: 8.34,
  f: 4.725,
  g: 8.895,
  h: 8.61,
  i: 3.615,
  j: 3.615,
  k: 8.055,
  l: 3.615,
  m: 13.05,
  n: 8.61,
  o: 8.895,
  p: 9.165,
  q: 9.165,
  r: 5.28,
  s: 7.785,
  t: 4.995,
  u: 8.61,
  v: 7.785,
  w: 11.67,
  x: 8.055,
  y: 7.785,
  z: 7.5,
  '0': 8.34,
  '1': 8.34,
  '2': 8.34,
  '3': 8.34,
  '4': 8.34,
  '5': 8.34,
  '6': 8.34,
  '7': 8.34,
  '8': 8.34,
  '9': 8.34,
  ' ': 4.17,
  '.': 4.17,
  '/': 5.28,
  "'": 4.17,
  '-': 5.835,
  '…': 15,
};

const FALLBACK_CHAR = 8.34;

function estimateText(text: string): number {
  let width = 0;
  for (const char of text) width += CHAR_WIDTH[char] ?? FALLBACK_CHAR;
  return width;
}

let measureImpl = estimateText;
let canvasReady = false;
let measureAttempts = 0;

/** How many times canvas measuring was requested. Used to keep it off the render path. */
export function canvasMeasureAttempts(): number {
  return measureAttempts;
}

/**
 * Switch wrapping to canvas measureText. No-op without a document, and
 * safe to call more than once. The 2D context font is set once and widths
 * are cached.
 */
export function enableCanvasTextMeasure(): void {
  measureAttempts += 1;
  if (canvasReady || typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return;
  context.font = NAME_FONT;
  const cache = new Map<string, number>();
  measureImpl = (text: string) => {
    const cached = cache.get(text);
    if (cached !== undefined) return cached;
    const width = context.measureText(text).width;
    cache.set(text, width);
    return width;
  };
  canvasReady = true;
}

enableCanvasTextMeasure();

export function measureText(text: string): number {
  return measureImpl(text);
}

function hardBreak(word: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const char of word) {
    const next = current + char;
    if (current && measureText(next) > maxWidth) {
      parts.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts.length > 0 ? parts : [word];
}

/**
 * Wrap `name` into at most 3 lines. Overflow on the last line is trimmed with
 * an ellipsis so the card never grows a fourth row.
 */
export function wrapName(
  name: string,
  maxWidth = NAME_MAX_WIDTH,
  maxLines = NAME_MAX_LINES,
): string[] {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  let overflow = false;

  const commit = (): void => {
    if (!current) return;
    if (lines.length < maxLines) lines.push(current);
    else overflow = true;
    current = '';
  };

  for (const word of words) {
    if (lines.length >= maxLines) {
      overflow = true;
      break;
    }

    const pieces = measureText(word) > maxWidth ? hardBreak(word, maxWidth) : [word];
    for (const piece of pieces) {
      if (lines.length >= maxLines) {
        overflow = true;
        break;
      }
      const trial = current ? `${current} ${piece}` : piece;
      if (measureText(trial) <= maxWidth) {
        current = trial;
        continue;
      }
      commit();
      if (lines.length >= maxLines) {
        overflow = true;
        break;
      }
      current = piece;
    }
  }

  if (current) {
    if (lines.length < maxLines) lines.push(current);
    else overflow = true;
  }

  if (!overflow) return lines;
  return ellipsizeLast(lines, maxWidth);
}

function ellipsizeLast(lines: string[], maxWidth: number): string[] {
  if (lines.length === 0) return lines;
  const result = lines.slice(0, lines.length);
  const lastIndex = result.length - 1;
  const last = result[lastIndex] ?? '';
  const ellipsis = '…';
  let trimmed = last.replace(/…$/, '');
  while (trimmed.length > 0 && measureText(`${trimmed}${ellipsis}`) > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  result[lastIndex] = `${trimmed || last.slice(0, 1)}${ellipsis}`;
  return result;
}
