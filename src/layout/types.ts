export type CardSide = 'paternal' | 'maternal';

export interface LayoutCard {
  personId: string;
  /** Card left, in tree units. */
  x: number;
  /** Card top, in tree units. Root row is 0. */
  y: number;
  /** Set on the paternal and maternal branches. The stem around the root omits it. */
  side?: CardSide;
  /**
   * Primary cards use `personId`. A pedigree-collapse duplicate uses
   * `${personId}#2`, `${personId}#3`, …
   */
  instanceId?: string;
  /** Set when this person is drawn more than once. The badge reads `×N`. */
  copyCount?: number;
}

export function cardInstanceId(card: LayoutCard): string {
  return card.instanceId ?? card.personId;
}

export function isGhostCard(card: LayoutCard): boolean {
  const instanceId = card.instanceId ?? card.personId;
  return instanceId !== card.personId;
}

/** Strip a `#2` instance suffix. Person ids that merely contain `#` are left intact. */
export function canonicalPersonId(id: string): string {
  const mark = id.lastIndexOf('#');
  if (mark <= 0) return id;
  const suffix = id.slice(mark + 1);
  return /^\d+$/.test(suffix) ? id.slice(0, mark) : id;
}

/** The card a ghost click should select and centre. */
export function primaryLayoutCard(cards: LayoutCard[], personId: string): LayoutCard | undefined {
  const canonical = canonicalPersonId(personId);
  return (
    cards.find((card) => card.personId === canonical && !isGhostCard(card)) ??
    cards.find((card) => card.personId === canonical)
  );
}

/** People on the canvas. Ghost copies of one person count once. */
export function shownPersonCount(cards: LayoutCard[]): number {
  const people = new Set<string>();
  for (const card of cards) people.add(card.personId);
  return people.size;
}

export interface LayoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
