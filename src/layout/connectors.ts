import type { FamilyTree } from '../model/types';
import { CARD_H, CARD_W, CORNER_R } from './constants';
import { cardInstanceId, type LayoutCard } from './types';

export interface LayoutConnector {
  /** SVG path `d`, possibly with several subpaths (couple bar, then each child drop). */
  d: string;
  familyId: string;
}

export interface ConnectorFamily {
  familyId: string;
  husbandKey?: string;
  wifeKey?: string;
  childKeys: string[];
}

const BUS_CLEARANCE = 40;

/**
 * Orthogonal connectors with rounded corners.
 *
 * A couple on one row is joined by a bar across the gap. When another card
 * (usually a second spouse) stands between them, the bar runs behind it and
 * the children hang from the outer partner's card instead. Partners on different rows get a side link. Every visible child
 * gets a drop; the line jogs around cards rather than stopping short.
 */
export function buildConnectors(
  tree: FamilyTree,
  cards: LayoutCard[],
  options?: {
    detached?: ReadonlySet<string>;
    extras?: readonly ConnectorFamily[];
  },
): LayoutConnector[] {
  const primary = new Map<string, LayoutCard>();
  const byKey = new Map<string, LayoutCard>();
  for (const card of cards) {
    const key = cardInstanceId(card);
    byKey.set(key, card);
    if (key === card.personId && !primary.has(card.personId)) primary.set(card.personId, card);
  }

  const detached = options?.detached ?? new Set<string>();
  const connectors: LayoutConnector[] = [];
  const familyIds = [...tree.families.keys()].sort();
  const { offsets: barYs, marriages } = coupleBarOffsets(tree, primary);

  for (const familyId of familyIds) {
    const family = tree.families.get(familyId);
    if (!family) continue;

    const husband = family.husband ? primary.get(family.husband) : undefined;
    const wife = family.wife ? primary.get(family.wife) : undefined;
    const children = family.children
      .filter((id) => !detached.has(`${familyId}:${id}`))
      .map((id) => primary.get(id))
      .filter((card): card is LayoutCard => card !== undefined)
      .sort((a, b) => a.x - b.x || a.personId.localeCompare(b.personId));

    const path = familyPath(husband, wife, children, cards, barYs.get(familyId), marriages);
    if (path) connectors.push({ d: path, familyId });
  }

  for (const extra of options?.extras ?? []) {
    const husband = extra.husbandKey ? byKey.get(extra.husbandKey) : undefined;
    const wife = extra.wifeKey ? byKey.get(extra.wifeKey) : undefined;
    const children = extra.childKeys
      .map((key) => byKey.get(key))
      .filter((card): card is LayoutCard => card !== undefined)
      .sort((a, b) => a.x - b.x || a.personId.localeCompare(b.personId));
    const path = familyPath(husband, wife, children, cards);
    if (path) connectors.push({ d: path, familyId: extra.familyId });
  }

  return connectors;
}

function familyPath(
  husband: LayoutCard | undefined,
  wife: LayoutCard | undefined,
  children: LayoutCard[],
  cards: LayoutCard[],
  barOffset: number = CARD_H / 2,
  marriages: ReadonlyMap<string, number> = new Map(),
): string | undefined {
  const parents = [husband, wife].filter((card): card is LayoutCard => card !== undefined);
  if (parents.length === 0) return undefined;
  if (parents.length === 1 && children.length === 0) return undefined;

  const parentKeys = new Set(parents.map((card) => cardInstanceId(card)));
  const parts: string[] = [];
  let anchor = parentAnchor(husband, wife);

  if (husband && wife) {
    const left = husband.x <= wife.x ? husband : wife;
    const right = left === husband ? wife : husband;
    const sameRow = Math.abs(left.y - right.y) < 1;
    const barY = left.y + barOffset;
    if (sameRow && !barCrossesCard(left, right, barY, cards)) {
      parts.push(line(left.x + CARD_W, barY, right.x, barY));
      anchor = {
        x: (left.x + CARD_W / 2 + right.x + CARD_W / 2) / 2,
        y: barY,
      };
    } else if (sameRow) {
      // MyHeritage hangs the children from the partner with no other marriage
      // on the row: the one whose only bar this is.
      parts.push(behindCardsBar(left, right, barY, cards));
      const leftCount = marriages.get(left.personId) ?? 1;
      const rightCount = marriages.get(right.personId) ?? 1;
      const outer = leftCount < rightCount ? left : right;
      anchor = { x: outer.x + CARD_W / 2, y: outer.y + CARD_H };
    } else {
      parts.push(crossGenerationLink(left, right));
      const lower = left.y >= right.y ? left : right;
      anchor = { x: lower.x + CARD_W / 2, y: lower.y + CARD_H };
    }
  }

  for (const child of children) {
    if (parentKeys.has(cardInstanceId(child))) continue;
    const drop = childLink(anchor, child, cards, parentKeys);
    if (drop) parts.push(drop);
  }

  const d = parts.filter((part) => part.length > 0).join(' ');
  return d.length > 0 ? d : undefined;
}

function barCrossesCard(
  left: LayoutCard,
  right: LayoutCard,
  barY: number,
  cards: LayoutCard[],
): boolean {
  const x1 = left.x + CARD_W;
  const x2 = right.x;
  const skip = new Set([cardInstanceId(left), cardInstanceId(right)]);
  for (const card of cards) {
    if (skip.has(cardInstanceId(card))) continue;
    if (barY < card.y + 1 || barY > card.y + CARD_H - 1) continue;
    if (card.x + CARD_W <= x1 + 0.5 || card.x >= x2 - 0.5) continue;
    return true;
  }
  return false;
}

/**
 * Bar height per couple, as an offset from the card top. One marriage sits at
 * mid-card (51). When a partner has several marriages on the row, MyHeritage
 * splits the bars 8 apart: the adjacent couple at +4 (55), the next one out at
 * −4 (47), then further up for each extra step.
 */
function coupleBarOffsets(
  tree: FamilyTree,
  primary: ReadonlyMap<string, LayoutCard>,
): { offsets: Map<string, number>; marriages: Map<string, number> } {
  const rowCouples = new Map<string, Array<{ familyId: string; gap: number }>>();
  for (const [familyId, family] of tree.families) {
    const husband = family.husband ? primary.get(family.husband) : undefined;
    const wife = family.wife ? primary.get(family.wife) : undefined;
    if (!husband || !wife || Math.abs(husband.y - wife.y) >= 1) continue;
    const gap = Math.abs(husband.x - wife.x);
    for (const id of [husband.personId, wife.personId]) {
      const list = rowCouples.get(id) ?? [];
      list.push({ familyId, gap });
      rowCouples.set(id, list);
    }
  }

  const offsets = new Map<string, number>();
  const marriages = new Map<string, number>();
  for (const [personId, couples] of rowCouples) {
    marriages.set(personId, couples.length);
    if (couples.length < 2) continue;
    couples.sort((a, b) => a.gap - b.gap || a.familyId.localeCompare(b.familyId));
    couples.forEach(({ familyId }, rank) => {
      const offset = CARD_H / 2 + 4 - rank * 8;
      offsets.set(familyId, Math.min(offsets.get(familyId) ?? offset, offset));
    });
  }
  return { offsets, marriages };
}

/**
 * A couple whose bar would cross another card (a second spouse): the line
 * runs behind that card. Only the pieces in the gaps are drawn, each ending in
 * a short tick 3 units off the card it passes behind.
 */
function behindCardsBar(left: LayoutCard, right: LayoutCard, barY: number, cards: LayoutCard[]): string {
  const skip = new Set([cardInstanceId(left), cardInstanceId(right)]);
  const blockers = cards
    .filter(
      (card) =>
        !skip.has(cardInstanceId(card)) &&
        barY >= card.y + 1 &&
        barY <= card.y + CARD_H - 1 &&
        card.x + CARD_W > left.x + CARD_W + 0.5 &&
        card.x < right.x - 0.5,
    )
    .sort((a, b) => a.x - b.x);

  const parts: string[] = [];
  let from = left.x + CARD_W;
  let tickAtStart = false;
  for (const card of blockers) {
    const to = card.x - 3;
    if (to > from) parts.push(line(from, barY, to, barY));
    parts.push(line(to, barY - 3, to, barY + 3));
    if (tickAtStart) parts.push(line(from, barY - 3, from, barY + 3));
    from = Math.max(from, card.x + CARD_W + 3);
    tickAtStart = true;
  }
  if (right.x > from) parts.push(line(from, barY, right.x, barY));
  if (tickAtStart) parts.push(line(from, barY - 3, from, barY + 3));
  return parts.join(' ');
}

function crossGenerationLink(higherOrLeft: LayoutCard, other: LayoutCard): string {
  const higher = higherOrLeft.y <= other.y ? higherOrLeft : other;
  const lower = higher === higherOrLeft ? other : higherOrLeft;
  const fromX = higher.x + CARD_W / 2;
  const fromY = higher.y + CARD_H;
  const toX = lower.x + (lower.x + CARD_W / 2 >= fromX ? 0 : CARD_W);
  const toY = lower.y + CARD_H / 2;
  return roundedOrthogonal(
    [
      [fromX, fromY],
      [fromX, toY],
      [toX, toY],
    ],
    CORNER_R,
  );
}

function childLink(
  anchor: { x: number; y: number },
  child: LayoutCard,
  cards: LayoutCard[],
  skip: Set<string>,
): string {
  const childX = child.x + CARD_W / 2;
  const childTop = child.y;
  if (childTop > anchor.y + 1) {
    const busY = childTop - BUS_CLEARANCE;
    const direct = roundedOrthogonal(
      [
        [anchor.x, anchor.y],
        [anchor.x, busY],
        [childX, busY],
        [childX, childTop],
      ],
      CORNER_R,
    );
    if (!verticalHitsCard(anchor.x, anchor.y, busY, cards, skip)) return direct;

    const lift = Math.min(anchor.y, childTop) - BUS_CLEARANCE;
    return roundedOrthogonal(
      [
        [anchor.x, anchor.y],
        [anchor.x, lift],
        [childX, lift],
        [childX, childTop],
      ],
      CORNER_R,
    );
  }

  const lift = Math.min(anchor.y, childTop) - BUS_CLEARANCE;
  return roundedOrthogonal(
    [
      [anchor.x, anchor.y],
      [anchor.x, lift],
      [childX, lift],
      [childX, childTop],
    ],
    CORNER_R,
  );
}

function verticalHitsCard(
  x: number,
  y1: number,
  y2: number,
  cards: LayoutCard[],
  skip: Set<string>,
): boolean {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  for (const card of cards) {
    if (skip.has(cardInstanceId(card))) continue;
    if (x <= card.x + 1 || x >= card.x + CARD_W - 1) continue;
    if (card.y + CARD_H <= top + 1 || card.y >= bottom - 1) continue;
    return true;
  }
  return false;
}

function parentAnchor(
  husband: LayoutCard | undefined,
  wife: LayoutCard | undefined,
): { x: number; y: number } {
  if (husband && wife) {
    const left = husband.x <= wife.x ? husband : wife;
    const right = left === husband ? wife : husband;
    if (Math.abs(left.y - right.y) >= 1) {
      const lower = left.y >= right.y ? left : right;
      return { x: lower.x + CARD_W / 2, y: lower.y + CARD_H };
    }
    return {
      x: (left.x + CARD_W / 2 + right.x + CARD_W / 2) / 2,
      y: left.y + CARD_H / 2,
    };
  }

  const only = husband ?? wife;
  if (!only) return { x: 0, y: 0 };
  return { x: only.x + CARD_W / 2, y: only.y + CARD_H };
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)}`;
}

/**
 * Orthogonal polyline with circular corners.
 * Sweep follows screen coordinates (y grows downward).
 */
export function roundedOrthogonal(points: Array<[number, number]>, radius: number): string {
  const unique: Array<[number, number]> = [];
  for (const point of points) {
    const previous = unique[unique.length - 1];
    if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
    unique.push(point);
  }
  const first = unique[0];
  if (!first) return '';
  if (unique.length === 1) return `M ${fmt(first[0])} ${fmt(first[1])}`;

  let path = `M ${fmt(first[0])} ${fmt(first[1])}`;

  for (let index = 1; index < unique.length - 1; index += 1) {
    const prev = unique[index - 1];
    const current = unique[index];
    const next = unique[index + 1];
    if (!prev || !current || !next) continue;

    const inDx = Math.sign(current[0] - prev[0]);
    const inDy = Math.sign(current[1] - prev[1]);
    const outDx = Math.sign(next[0] - current[0]);
    const outDy = Math.sign(next[1] - current[1]);
    const inLen = Math.abs(current[0] - prev[0]) + Math.abs(current[1] - prev[1]);
    const outLen = Math.abs(next[0] - current[0]) + Math.abs(next[1] - current[1]);
    const corner = Math.min(radius, inLen / 2, outLen / 2);
    const straight = (inDx === outDx && inDy === outDy) || corner < 1;

    if (straight) {
      path += ` L ${fmt(current[0])} ${fmt(current[1])}`;
      continue;
    }

    const arcStartX = current[0] - inDx * corner;
    const arcStartY = current[1] - inDy * corner;
    const arcEndX = current[0] + outDx * corner;
    const arcEndY = current[1] + outDy * corner;
    // Screen y grows downward, so a positive cross product is a clockwise turn.
    const cross = inDx * outDy - inDy * outDx;
    const sweep = cross > 0 ? 1 : 0;
    path += ` L ${fmt(arcStartX)} ${fmt(arcStartY)} A ${fmt(corner)} ${fmt(corner)} 0 0 ${sweep} ${fmt(arcEndX)} ${fmt(arcEndY)}`;
  }

  const last = unique[unique.length - 1];
  if (last) path += ` L ${fmt(last[0])} ${fmt(last[1])}`;
  return path;
}

function fmt(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
