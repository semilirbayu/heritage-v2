import { getSiblings, getSpouses, getTreeIndex } from '../model/helpers';
import type { Family, FamilyTree, Person, Sex } from '../model/types';
import { UNKNOWN_DATE_SORT_KEY } from '../gedcom/date';
import { buildConnectors, type ConnectorFamily, type LayoutConnector } from './connectors';
import {
  CARD_H,
  CARD_W,
  COUPLE_DX,
  COUPLE_MID_OFFSET,
  ROW_DY,
  UNIT_GAP,
  generationLimit,
  type VisibilityOptions,
} from './constants';
import { selectVisible } from './selectVisible';
import {
  cardInstanceId,
  isGhostCard,
  type CardSide,
  type LayoutBounds,
  type LayoutCard,
} from './types';

export interface FamilyLayout {
  cards: LayoutCard[];
  connectors: LayoutConnector[];
  bounds: LayoutBounds;
}

interface LocalCard {
  id: string;
  x: number;
  y: number;
  side?: CardSide;
}

interface Unit {
  cards: LocalCard[];
  left: number;
  right: number;
  /** Set when this row is the children of one marriage of the unit's person. */
  spouseId?: string;
  spouseIndex?: number;
}

interface Span {
  left: number;
  right: number;
}

type Branch = 'line' | CardSide;

interface ParentSlot {
  id: string;
  ghost: boolean;
}

/** How far the reserved ancestor space reaches past a card's left and right edges. */
interface AncestorExtents {
  left: number;
  right: number;
}

const EMPTY_UNIT: Unit = { cards: [], left: 0, right: 0 };
const NO_EXTENTS: Readonly<AncestorExtents> = Object.freeze({ left: 0, right: 0 });
const COUPLE_GAP = COUPLE_DX - CARD_W;
/** MyHeritage's half-width "Add father / Add mother" card, gap included. */
const PLACEHOLDER_PITCH = COUPLE_DX / 2;

/**
 * Hourglass layout.
 *
 * The stem (root, spouses, full siblings in birth order, and their descendants)
 * is packed left to right. Parents are centred on that stem. Each ancestor's
 * siblings pack outward — father's kin to the left, mother's kin to the right —
 * and that ancestor couple is centred on the union of those subtrees. An
 * ancestor with no siblings uses the inner-parent rule. A single parent in the
 * outer gendered slot is centred on the virtual couple.
 *
 * Every couple is husband on the left, wife on the right. Later spouses stack
 * outward (a woman's husbands to her left, a man's wives to her right). Each
 * marriage's children sit under that couple. When the same ancestor is reached
 * by a second line, a ghost card (`id#2`) is drawn there so both lines keep
 * their parents.
 */
export function layoutFamilyView(
  tree: FamilyTree,
  rootId: string,
  options: VisibilityOptions,
): FamilyLayout {
  const visible = selectVisible(tree, rootId, options);
  const cards: LayoutCard[] = [];

  if (!tree.people.has(rootId) || !visible.ids.has(rootId)) {
    return { cards, connectors: [], bounds: emptyBounds() };
  }

  const ctx: LayoutContext = {
    tree,
    visibleIds: visible.ids,
    generation: visible.generation,
    blood: visible.blood,
    fileIndex: getTreeIndex(tree).fileIndex,
    placed: new Set(),
    placedKeys: new Set(),
    cardMap: new Map(),
    cards,
    copyNumbers: new Map(),
    ancestorWalk: new Set(),
    packedPeople: new Set(),
    ghostRecursion: new Set(),
    detached: new Set(),
    extras: [],
    ghostSerial: 0,
    extents: new Map(),
    extentWalk: new Set(),
  };

  const stem = layoutStem(ctx, rootId);
  const parents = placeRootParents(ctx, rootId, stem);
  const lineage = unionSpan(stem, parents);

  const maxGen = generationLimit(options.generations);
  if (parents.fatherId) {
    placeAncestors(ctx, parents.fatherId, 'paternal', maxGen - 1, lineage);
  }
  if (parents.motherId) {
    placeAncestors(ctx, parents.motherId, 'maternal', maxGen - 1, lineage);
  }

  placeStragglers(ctx, rootId);
  assignCopyCounts(ctx);

  cards.sort((a, b) => a.y - b.y || a.x - b.x || a.personId.localeCompare(b.personId) || cardInstanceId(a).localeCompare(cardInstanceId(b)));

  return {
    cards,
    connectors: buildConnectors(tree, cards, { detached: ctx.detached, extras: ctx.extras }),
    bounds: boundsOf(cards),
  };
}

interface LayoutContext {
  tree: FamilyTree;
  visibleIds: Set<string>;
  generation: Map<string, number>;
  blood: Set<string>;
  fileIndex: Map<string, number>;
  placed: Set<string>;
  placedKeys: Set<string>;
  cardMap: Map<string, LayoutCard>;
  cards: LayoutCard[];
  copyNumbers: Map<string, number>;
  ancestorWalk: Set<string>;
  packedPeople: Set<string>;
  ghostRecursion: Set<string>;
  detached: Set<string>;
  extras: ConnectorFamily[];
  ghostSerial: number;
  /** Reserved ancestor space per `personId|role`, see `ancestorExtents`. */
  extents: Map<string, AncestorExtents>;
  extentWalk: Set<string>;
}

function layoutStem(ctx: LayoutContext, rootId: string): Span {
  const ordered = sortByBirth(ctx, [rootId, ...stemMateIds(ctx, rootId)]);
  const units: Unit[] = [];
  for (const id of ordered) {
    const person = ctx.tree.people.get(id);
    units.push(buildUnit(ctx, id, 'line', new Set(), spouseDirection(person?.sex)));
  }

  let cursor = 0;
  const shifted: Unit[] = [];
  for (const unit of units) {
    const move = cursor - unit.left;
    const next = shiftUnit(unit, move);
    shifted.push(next);
    cursor = next.right + UNIT_GAP;
  }

  const rootCard = shifted.flatMap((unit) => unit.cards).find((card) => card.id === rootId);
  const normalise = -(rootCard?.x ?? 0);
  let left = Infinity;
  let right = -Infinity;

  for (const unit of shifted) {
    const placedUnit = shiftUnit(unit, normalise);
    commitUnit(ctx, placedUnit);
    left = Math.min(left, placedUnit.left);
    right = Math.max(right, placedUnit.right);
  }

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return { left: 0, right: CARD_W };
  }
  return { left, right };
}

/** Children of the root's own child-family. Half-siblings hang under the other marriage. */
function stemMateIds(ctx: LayoutContext, rootId: string): string[] {
  const family = primaryChildFamily(ctx.tree, rootId);
  if (!family) {
    return getSiblings(ctx.tree, rootId)
      .map((link) => link.person.id)
      .filter((id) => ctx.visibleIds.has(id));
  }
  return family.children.filter((id) => id !== rootId && ctx.visibleIds.has(id));
}

function placeRootParents(
  ctx: LayoutContext,
  rootId: string,
  stem: Span,
): Span & { fatherId?: string; motherId?: string } {
  const family = primaryChildFamily(ctx.tree, rootId);
  const fatherId = family?.husband;
  const motherId = family?.wife;
  const fatherOn = fatherId !== undefined && fatherId !== rootId && ctx.visibleIds.has(fatherId);
  const motherOn = motherId !== undefined && motherId !== rootId && ctx.visibleIds.has(motherId);
  const centre = (stem.left + stem.right) / 2;
  const rootGen = ctx.generation.get(rootId) ?? 0;
  const yOf = (id: string): number => (ctx.generation.get(id) ?? rootGen - 1) * ROW_DY;

  let left = stem.left;
  let right = stem.right;
  let fatherCard: LayoutCard | undefined;
  let motherCard: LayoutCard | undefined;

  if (fatherOn && motherOn && fatherId && motherId) {
    const fatherX = centre - COUPLE_MID_OFFSET;
    fatherCard = emit(ctx, fatherId, fatherX, yOf(fatherId), 'paternal');
    motherCard = emit(ctx, motherId, fatherX + COUPLE_DX, yOf(motherId), 'maternal');
    left = Math.min(left, fatherX);
    right = Math.max(right, fatherX + COUPLE_DX + CARD_W);
  } else if (fatherOn && fatherId) {
    const x = centre - CARD_W / 2;
    fatherCard = emit(ctx, fatherId, x, yOf(fatherId), 'paternal');
    left = Math.min(left, x);
    right = Math.max(right, x + CARD_W);
  } else if (motherOn && motherId) {
    const x = centre - CARD_W / 2;
    motherCard = emit(ctx, motherId, x, yOf(motherId), 'maternal');
    left = Math.min(left, x);
    right = Math.max(right, x + CARD_W);
  }

  const watermark = ctx.cards.length;
  if (fatherCard) {
    placeSideMarriages(ctx, fatherCard, motherOn ? motherId : undefined, family?.id, 'paternal');
  }
  if (motherCard) {
    placeSideMarriages(ctx, motherCard, fatherOn ? fatherId : undefined, family?.id, 'maternal');
  }
  for (const card of ctx.cards.slice(watermark)) {
    left = Math.min(left, card.x);
    right = Math.max(right, card.x + CARD_W);
  }

  return {
    left,
    right,
    ...(fatherCard && fatherId ? { fatherId } : {}),
    ...(motherCard && motherId ? { motherId } : {}),
  };
}

function placeAncestors(
  ctx: LayoutContext,
  childKey: string,
  rootSide: CardSide,
  depth: number,
  childBox: Span,
): void {
  if (depth <= 0) return;
  const child = ctx.cardMap.get(childKey);
  if (!child || ctx.ancestorWalk.has(childKey)) return;
  if (isGhostCard(child) && ctx.ghostRecursion.has(child.personId)) return;

  ctx.ancestorWalk.add(childKey);
  if (isGhostCard(child)) ctx.ghostRecursion.add(child.personId);

  const childId = child.personId;
  const firstVisit = !ctx.packedPeople.has(childId);
  if (firstVisit) ctx.packedPeople.add(childId);

  const outward: -1 | 1 = childIsLeftCard(ctx, childKey) ? -1 : 1;
  const siblingBranch: CardSide = outward < 0 ? 'paternal' : 'maternal';
  const siblingUnits = firstVisit
    ? packSiblings(ctx, childId, childBox, outward, siblingBranch, rootSide)
    : [];
  const siblingSpan = spanOfUnits(siblingUnits);
  const group = unionSpan(childBox, siblingSpan);
  const family = primaryChildFamily(ctx.tree, childId);
  const parents = placeParentPair(ctx, child, family, rootSide);

  let nextBox = group;
  const watermark = ctx.cards.length;
  for (const card of [parents.husband, parents.wife]) {
    if (!card) continue;
    nextBox = unionSpan(nextBox, { left: card.x, right: card.x + CARD_W });
    if (!isGhostCard(card)) {
      const spouseId = card === parents.husband ? parents.wife?.personId : parents.husband?.personId;
      placeSideMarriages(ctx, card, spouseId, family?.id, rootSide);
    }
  }
  for (const card of ctx.cards.slice(watermark)) {
    nextBox = unionSpan(nextBox, { left: card.x, right: card.x + CARD_W });
  }

  if (parents.husband) {
    placeAncestors(ctx, cardInstanceId(parents.husband), rootSide, depth - 1, nextBox);
  }
  if (parents.wife) {
    placeAncestors(ctx, cardInstanceId(parents.wife), rootSide, depth - 1, nextBox);
  }
}

function placeParentPair(
  ctx: LayoutContext,
  child: LayoutCard,
  family: Family | undefined,
  rootSide: CardSide,
): { husband?: LayoutCard; wife?: LayoutCard } {
  const father = resolveParent(ctx, family?.husband, child.personId);
  const mother = resolveParent(ctx, family?.wife, child.personId);
  if (!father && !mother) return {};

  // The inner parent sits on the child unless the co-parent's ancestor block
  // reserves room above it, which pushes the couple outward. Siblings pack
  // beside the subtree; they do not drag the couple onto the bounding-box
  // centre (that centre sits well away from the measured couples).
  const placed = placeByInnerParentRule(ctx, child, father, mother, rootSide);
  const ghosting = Boolean(father?.ghost || mother?.ghost);

  if (ghosting && family) {
    rememberGhostLink(ctx, family, child, placed.husband, placed.wife);
  }
  return placed;
}

function placeByInnerParentRule(
  ctx: LayoutContext,
  child: LayoutCard,
  father: ParentSlot | undefined,
  mother: ParentSlot | undefined,
  rootSide: CardSide,
): { husband?: LayoutCard; wife?: LayoutCard } {
  if (!father && !mother) return {};

  const leftCard = childIsLeftCard(ctx, cardInstanceId(child));
  const outward = leftCard ? -1 : 1;
  const yOf = (id: string): number => (ctx.generation.get(id) ?? (child.y - ROW_DY) / ROW_DY) * ROW_DY;

  if (father && mother) {
    // The ancestor block hangs off the child's inner edge. How far the couple
    // can reach back over the child depends on the space reserved above the
    // co-parent by the placeholders we do not draw.
    const fatherX = leftCard || !hasVisibleSpouse(ctx, child)
      ? child.x - COUPLE_DX - ancestorExtents(ctx, mother.id, 'right').right
      : child.x + ancestorExtents(ctx, father.id, 'left').left;
    return {
      husband: emit(ctx, father.id, fatherX, yOf(father.id), rootSide, father.ghost),
      wife: emit(ctx, mother.id, fatherX + COUPLE_DX, yOf(mother.id), rootSide, mother.ghost),
    };
  }

  const only = father ?? mother;
  if (!only) return {};
  const wantsLeft = (ctx.tree.people.get(only.id)?.sex ?? 'U') !== 'F';
  const genderedSlotIsInner = (wantsLeft && !leftCard) || (!wantsLeft && leftCard);
  const x = genderedSlotIsInner ? child.x : child.x + outward * (COUPLE_DX / 2);
  const card = emit(ctx, only.id, x, yOf(only.id), rootSide, only.ghost);
  return father ? { husband: card } : { wife: card };
}

/**
 * Space MyHeritage reserves above `personId` for the parents and the
 * "Add father / Add mother" placeholders it draws but we only leave empty.
 *
 * A placeholder is half a card wide, so a missing co-parent costs 127 more
 * than the known parent's card. The ancestor block is laid out upward from
 * the card's inner edge: a left card grows its block left, a right card grows
 * it right. `role` is the slot this person occupies in its own couple.
 */
function ancestorExtents(
  ctx: LayoutContext,
  personId: string,
  role: 'left' | 'right',
): AncestorExtents {
  const key = `${personId}|${role}`;
  const cached = ctx.extents.get(key);
  if (cached) return cached;
  if (ctx.extentWalk.has(key)) return NO_EXTENTS;

  ctx.extentWalk.add(key);
  const family = primaryChildFamily(ctx.tree, personId);
  const father = resolveParent(ctx, family?.husband, personId);
  const mother = resolveParent(ctx, family?.wife, personId);
  const fatherExt = father ? ancestorExtents(ctx, father.id, 'left') : NO_EXTENTS;
  const motherExt = mother ? ancestorExtents(ctx, mother.id, 'right') : NO_EXTENTS;

  let extents: AncestorExtents;
  if (father && mother) {
    const outward = COUPLE_DX + fatherExt.left + motherExt.right;
    extents = role === 'right' ? { left: 0, right: outward } : { left: outward, right: 0 };
  } else if (father) {
    extents =
      role === 'right'
        ? { left: 0, right: PLACEHOLDER_PITCH }
        : { left: PLACEHOLDER_PITCH + fatherExt.left, right: 0 };
  } else if (mother) {
    extents =
      role === 'right'
        ? { left: 0, right: PLACEHOLDER_PITCH + motherExt.right }
        : { left: PLACEHOLDER_PITCH, right: motherExt.right };
  } else {
    extents = NO_EXTENTS;
  }

  ctx.extentWalk.delete(key);
  ctx.extents.set(key, extents);
  return extents;
}

/** True when the card shares its row with a spouse, i.e. it is one half of a couple. */
function hasVisibleSpouse(ctx: LayoutContext, card: LayoutCard): boolean {
  const person = ctx.tree.people.get(card.personId);
  return person ? spouseCardsNear(ctx, person, card).length > 0 : false;
}

function resolveParent(
  ctx: LayoutContext,
  id: string | undefined,
  childId: string,
): ParentSlot | undefined {
  if (!id || id === childId || !ctx.visibleIds.has(id) || !ctx.tree.people.has(id)) return undefined;
  return { id, ghost: ctx.placed.has(id) };
}

function rememberGhostLink(
  ctx: LayoutContext,
  family: Family,
  child: LayoutCard,
  husband: LayoutCard | undefined,
  wife: LayoutCard | undefined,
): void {
  if (!husband && !wife) return;
  ctx.detached.add(`${family.id}:${child.personId}`);
  ctx.ghostSerial += 1;
  const extra: ConnectorFamily = {
    familyId: `${family.id}#${ctx.ghostSerial}`,
    childKeys: [cardInstanceId(child)],
  };
  if (husband) extra.husbandKey = cardInstanceId(husband);
  if (wife) extra.wifeKey = cardInstanceId(wife);
  ctx.extras.push(extra);
}

function packSiblings(
  ctx: LayoutContext,
  childId: string,
  childBox: Span,
  outward: -1 | 1,
  branch: CardSide,
  rootSide: CardSide,
): Unit[] {
  const siblingIds = sortByBirth(
    ctx,
    getSiblings(ctx.tree, childId)
      .map((link) => link.person.id)
      .filter((id) => keepBeside(ctx, childId, id)),
  );

  const built = siblingIds.map((id) => {
    const person = ctx.tree.people.get(id);
    return buildUnit(ctx, id, branch, new Set(), spouseDirection(person?.sex));
  });
  const packed: Unit[] = [];

  if (outward < 0) {
    let edge = childBox.left;
    for (let i = built.length - 1; i >= 0; i -= 1) {
      const unit = built[i];
      if (!unit || unit.cards.length === 0) continue;
      const shifted = shiftUnit(unit, edge - UNIT_GAP - unit.right);
      packed.push(shifted);
      edge = shifted.left;
    }
  } else {
    let edge = childBox.right;
    for (const unit of built) {
      if (unit.cards.length === 0) continue;
      const shifted = shiftUnit(unit, edge + UNIT_GAP - unit.left);
      packed.push(shifted);
      edge = shifted.right;
    }
  }

  for (const unit of packed) commitUnit(ctx, unit, rootSide);
  return packed;
}

function keepBeside(ctx: LayoutContext, childId: string, siblingId: string): boolean {
  if (!ctx.visibleIds.has(siblingId) || ctx.placed.has(siblingId)) return false;
  return !belongsToOtherVisibleMarriage(ctx, childId, siblingId);
}

function belongsToOtherVisibleMarriage(ctx: LayoutContext, childId: string, siblingId: string): boolean {
  const childFamily = primaryChildFamily(ctx.tree, childId);
  const sibling = ctx.tree.people.get(siblingId);
  if (!childFamily || !sibling || sibling.famc.includes(childFamily.id)) return false;

  for (const familyId of sibling.famc) {
    const family = ctx.tree.families.get(familyId);
    if (!family) continue;
    const parents = [family.husband, family.wife].filter((id): id is string => id !== undefined);
    const shares = parents.some((id) => id === childFamily.husband || id === childFamily.wife);
    if (!shares) continue;
    const other = parents.find((id) => id !== childFamily.husband && id !== childFamily.wife);
    if (other !== undefined && ctx.visibleIds.has(other)) return true;
  }
  return false;
}

/**
 * Extra spouses of someone already on the canvas, stacked outward.
 * The marriage that links `anchor` to the child stays in the inner slot.
 */
function placeSideMarriages(
  ctx: LayoutContext,
  anchor: LayoutCard,
  primarySpouseId: string | undefined,
  skipFamilyId: string | undefined,
  branch: CardSide,
): void {
  const person = ctx.tree.people.get(anchor.personId);
  if (!person) return;

  const outward = spouseDirection(person.sex);
  const extras = getSpouses(ctx.tree, anchor.personId).filter((link) => {
    if (link.person.id === primarySpouseId) return false;
    if (!ctx.visibleIds.has(link.person.id) || ctx.placed.has(link.person.id)) return false;
    return !differentBloodRow(ctx, anchor.personId, link.person.id);
  });

  let slot = 0;
  if (primarySpouseId) {
    const primary = ctx.cardMap.get(primarySpouseId);
    if (primary && Math.sign(primary.x - anchor.x) === outward) {
      slot = Math.max(1, Math.round(Math.abs(primary.x - anchor.x) / COUPLE_DX));
    }
  }

  const handled = new Set<string>();
  if (skipFamilyId) handled.add(skipFamilyId);

  for (const link of extras) {
    slot += 1;
    handled.add(link.familyId);
    placeOneMarriage(ctx, anchor, link.person.id, link.familyId, slot, outward, branch);
  }

  for (const familyId of person.fams) {
    if (handled.has(familyId)) continue;
    const family = ctx.tree.families.get(familyId);
    if (!family || !personIsSpouse(family, anchor.personId)) continue;
    const kids = unplacedChildren(ctx, family, new Set([anchor.personId]));
    if (kids.length === 0) continue;
    const row = layoutRow(ctx, kids, branch, new Set([anchor.personId]));
    if (row.cards.length === 0) continue;
    let shifted = shiftToCenter(row, anchor.x + CARD_W / 2);
    for (let guard = 0; guard < 16 && pushClearUnit(ctx, shifted, outward, UNIT_GAP) !== 0; guard += 1) {
      shifted = shiftUnit(shifted, pushClearUnit(ctx, shifted, outward, UNIT_GAP));
    }
    commitUnit(ctx, shifted, branch);
  }
}

function placeOneMarriage(
  ctx: LayoutContext,
  anchor: LayoutCard,
  spouseId: string,
  familyId: string,
  slot: number,
  outward: number,
  branch: CardSide,
): void {
  const family = ctx.tree.families.get(familyId);
  const spouseY = (ctx.generation.get(spouseId) ?? ctx.generation.get(anchor.personId) ?? 0) * ROW_DY;
  const stack = new Set([anchor.personId]);
  const kids = family ? unplacedChildren(ctx, family, stack) : [];
  const row = kids.length > 0 ? layoutRow(ctx, kids, branch, stack) : EMPTY_UNIT;

  let spouseLeft = anchor.x + outward * COUPLE_DX * slot;
  const anchorCenter = anchor.x + CARD_W / 2;

  for (let guard = 0; guard < 24; guard += 1) {
    const spousePush = pushClear(ctx.cards, spouseLeft, spouseLeft + CARD_W, spouseY, outward, COUPLE_GAP);
    if (spousePush !== 0) {
      spouseLeft += spousePush;
      continue;
    }
    if (row.cards.length === 0) break;
    const mid = (anchorCenter + spouseLeft + CARD_W / 2) / 2;
    const shifted = shiftToCenter(row, mid);
    const childPush = pushClearUnit(ctx, shifted, outward, UNIT_GAP);
    if (childPush === 0) break;
    spouseLeft += childPush * 2;
  }

  spouseLeft = Math.round(spouseLeft);
  emit(ctx, spouseId, spouseLeft, spouseY, branch);
  if (row.cards.length === 0) return;

  const mid = (anchorCenter + spouseLeft + CARD_W / 2) / 2;
  let shifted = shiftToCenter(row, mid);
  const childPush = pushClearUnit(ctx, shifted, outward, UNIT_GAP);
  if (childPush !== 0) shifted = shiftUnit(shifted, childPush);
  commitUnit(ctx, shifted, branch);
}

function unplacedChildren(ctx: LayoutContext, family: Family, stack: Set<string>): string[] {
  return sortByBirth(
    ctx,
    family.children.filter(
      (childId) => ctx.visibleIds.has(childId) && !ctx.placed.has(childId) && !stack.has(childId),
    ),
  );
}

function buildUnit(
  ctx: LayoutContext,
  id: string,
  branch: Branch,
  stack: Set<string>,
  spouseOutward?: number,
): Unit {
  if (!ctx.visibleIds.has(id) || ctx.placed.has(id) || stack.has(id)) return EMPTY_UNIT;

  const person = ctx.tree.people.get(id);
  if (!person) return EMPTY_UNIT;

  stack.add(id);
  const y = (ctx.generation.get(id) ?? 0) * ROW_DY;
  const outward = spouseOutward ?? spouseDirection(person.sex);
  const side: CardSide | undefined = branch === 'line' ? undefined : branch;
  const cards: LocalCard[] = [{ id, x: 0, y, ...(side ? { side } : {}) }];

  const spouses = getSpouses(ctx.tree, id).filter(
    (link) =>
      ctx.visibleIds.has(link.person.id) &&
      !ctx.placed.has(link.person.id) &&
      !stack.has(link.person.id) &&
      !differentBloodRow(ctx, id, link.person.id),
  );

  spouses.forEach((link, spouseIndex) => {
    const spouseY = (ctx.generation.get(link.person.id) ?? y / ROW_DY) * ROW_DY;
    cards.push({
      id: link.person.id,
      x: outward * COUPLE_DX * (spouseIndex + 1),
      y: spouseY,
      ...(side ? { side } : {}),
    });
  });

  const handled = new Set<string>();
  const groups: Unit[] = [];

  const addChildren = (
    family: Family,
    midpoint: number,
    spouseId?: string,
    spouseIndex?: number,
  ): void => {
    const kids = unplacedChildren(ctx, family, stack);
    if (kids.length === 0) return;
    const row = layoutRow(ctx, kids, branch, stack);
    if (row.cards.length === 0) return;
    const delta = midpoint - (row.left + row.right) / 2;
    const placed = shiftUnit(row, delta);
    groups.push(
      spouseId === undefined || spouseIndex === undefined
        ? placed
        : { ...placed, spouseId, spouseIndex },
    );
  };

  for (const [spouseIndex, link] of spouses.entries()) {
    const family = ctx.tree.families.get(link.familyId);
    if (!family) continue;
    handled.add(family.id);
    const spouseCard = cards.find((card) => card.id === link.person.id);
    const spouseX = spouseCard?.x ?? outward * COUPLE_DX;
    const midpoint = (CARD_W / 2 + spouseX + CARD_W / 2) / 2;
    addChildren(family, midpoint, link.person.id, spouseIndex);
  }

  for (const familyId of person.fams) {
    if (handled.has(familyId)) continue;
    const family = ctx.tree.families.get(familyId);
    if (!family || !personIsSpouse(family, id)) continue;
    addChildren(family, CARD_W / 2);
  }

  separateGroups(groups, outward);
  // The first marriage stays a couple: spouse adjacent, children under the
  // midpoint. A later marriage's children clear the previous group by the
  // couple gap (34). That spouse then sits centred on those children, further
  // out than the stacked slot when the children need the room.
  for (const group of groups) {
    if (!group.spouseId || group.spouseIndex === undefined || group.spouseIndex < 1) continue;
    const spouse = cards.find((card) => card.id === group.spouseId);
    if (!spouse) continue;
    const centered = (group.left + group.right) / 2 - CARD_W / 2;
    const stacked = outward * COUPLE_DX * (group.spouseIndex + 1);
    spouse.x = outward >= 0 ? Math.max(stacked, centered) : Math.min(stacked, centered);
  }
  for (const group of groups) cards.push(...group.cards);

  stack.delete(id);
  return unitFrom(cards);
}

function personIsSpouse(family: Family, personId: string): boolean {
  return family.husband === personId || family.wife === personId;
}

function differentBloodRow(ctx: LayoutContext, anchorId: string, otherId: string): boolean {
  if (!ctx.blood.has(otherId)) return false;
  const anchorGen = ctx.generation.get(anchorId);
  const otherGen = ctx.generation.get(otherId);
  return anchorGen !== undefined && otherGen !== undefined && anchorGen !== otherGen;
}

function layoutRow(ctx: LayoutContext, childIds: string[], branch: Branch, stack: Set<string>): Unit {
  let cursor = 0;
  const cards: LocalCard[] = [];

  for (const childId of childIds) {
    const person = ctx.tree.people.get(childId);
    const unit = buildUnit(ctx, childId, branch, stack, spouseDirection(person?.sex));
    if (unit.cards.length === 0) continue;
    const shifted = shiftUnit(unit, cursor - unit.left);
    cards.push(...shifted.cards);
    cursor = shifted.right + UNIT_GAP;
  }

  return unitFrom(cards);
}

function separateGroups(groups: Unit[], outward: number): void {
  if (groups.length < 2) return;
  const sign = outward < 0 ? -1 : 1;
  groups.sort((a, b) => sign * (a.left + a.right - (b.left + b.right)));

  for (let i = 1; i < groups.length; i += 1) {
    const previous = groups[i - 1];
    const current = groups[i];
    if (!previous || !current) continue;
    if (sign > 0) {
      const minLeft = previous.right + COUPLE_GAP;
      if (current.left < minLeft) groups[i] = shiftUnit(current, minLeft - current.left);
    } else {
      const maxRight = previous.left - COUPLE_GAP;
      if (current.right > maxRight) groups[i] = shiftUnit(current, maxRight - current.right);
    }
  }
}

function commitUnit(ctx: LayoutContext, unit: Unit, sideOverride?: CardSide): void {
  for (const card of unit.cards) {
    const side = sideOverride ?? card.side;
    emit(ctx, card.id, card.x, card.y, side);
  }
}

function emit(
  ctx: LayoutContext,
  id: string,
  x: number,
  y: number,
  side?: CardSide,
  ghost = false,
): LayoutCard | undefined {
  if (!ctx.visibleIds.has(id)) return undefined;
  if (!ghost && ctx.placed.has(id)) return undefined;

  const instanceId = ghost ? nextGhostId(ctx, id) : id;
  if (ctx.placedKeys.has(instanceId)) return undefined;

  ctx.placedKeys.add(instanceId);
  if (!ghost) ctx.placed.add(id);

  const card: LayoutCard = {
    personId: id,
    instanceId,
    x: Math.round(x),
    y,
    ...(side ? { side } : {}),
  };
  ctx.cards.push(card);
  ctx.cardMap.set(instanceId, card);
  if (!ghost) ctx.cardMap.set(id, card);
  return card;
}

function nextGhostId(ctx: LayoutContext, personId: string): string {
  const next = (ctx.copyNumbers.get(personId) ?? 1) + 1;
  ctx.copyNumbers.set(personId, next);
  return `${personId}#${next}`;
}

function assignCopyCounts(ctx: LayoutContext): void {
  for (const card of ctx.cards) {
    const copies = ctx.copyNumbers.get(card.personId) ?? 1;
    if (copies > 1) card.copyCount = copies;
  }
}

function placeStragglers(ctx: LayoutContext, rootId: string): void {
  const missing = sortByBirth(
    ctx,
    [...ctx.visibleIds].filter((id) => !ctx.placed.has(id)),
  );
  if (missing.length === 0) return;

  let right = 0;
  let left = 0;
  for (const card of ctx.cards) {
    right = Math.max(right, card.x + CARD_W);
    left = Math.min(left, card.x);
  }
  right += UNIT_GAP;

  const paternal: string[] = [];
  const rest: string[] = [];
  for (const id of missing) {
    if (lineageSide(ctx, rootId, id) === 'paternal') paternal.push(id);
    else rest.push(id);
  }

  for (let index = paternal.length - 1; index >= 0; index -= 1) {
    const id = paternal[index];
    if (!id) continue;
    left -= UNIT_GAP + CARD_W;
    emit(ctx, id, left, (ctx.generation.get(id) ?? 0) * ROW_DY, 'paternal');
  }

  for (const id of rest) {
    emit(ctx, id, right, (ctx.generation.get(id) ?? 0) * ROW_DY, lineageSide(ctx, rootId, id));
    right += CARD_W + UNIT_GAP;
  }
}

function lineageSide(ctx: LayoutContext, rootId: string, id: string): CardSide | undefined {
  const family = primaryChildFamily(ctx.tree, rootId);
  const father = family?.husband;
  const mother = family?.wife;
  const index = getTreeIndex(ctx.tree);
  const seen = new Set<string>();
  const queue = [id];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    if (current === father) return 'paternal';
    if (current === mother) return 'maternal';
    for (const parent of index.parents.get(current) ?? []) queue.push(parent.id);
    for (const child of index.children.get(current) ?? []) queue.push(child.id);
  }
  return undefined;
}

function childIsLeftCard(ctx: LayoutContext, childKey: string): boolean {
  const child = ctx.cardMap.get(childKey);
  const person = child ? ctx.tree.people.get(child.personId) : undefined;
  if (!child || !person) return person?.sex !== 'F';

  const spouseCards = spouseCardsNear(ctx, person, child);
  if (spouseCards.length === 0) return person.sex !== 'F';

  const toTheRight = spouseCards.some((card) => card.x > child.x);
  const toTheLeft = spouseCards.some((card) => card.x < child.x);
  if (toTheRight && !toTheLeft) return true;
  if (toTheLeft && !toTheRight) return false;
  return person.sex !== 'F';
}

function spouseCardsNear(ctx: LayoutContext, person: Person, child: LayoutCard): LayoutCard[] {
  const near: LayoutCard[] = [];
  for (const link of getSpouses(ctx.tree, person.id)) {
    for (const card of ctx.cards) {
      if (card.personId !== link.person.id) continue;
      if (Math.abs(card.y - child.y) > 1) continue;
      if (Math.abs(card.x - child.x) > COUPLE_DX * 6) continue;
      near.push(card);
    }
  }
  return near;
}

function spouseDirection(sex: Sex | undefined): number {
  return sex === 'F' ? -1 : 1;
}

function primaryChildFamily(tree: FamilyTree, personId: string): Family | undefined {
  const person = tree.people.get(personId);
  if (!person) return undefined;
  for (const familyId of person.famc) {
    const family = tree.families.get(familyId);
    if (family && (family.husband || family.wife)) return family;
  }
  return undefined;
}

function sortByBirth(ctx: LayoutContext, ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const keyA = ctx.tree.people.get(a)?.birth?.date?.sortKey ?? UNKNOWN_DATE_SORT_KEY;
    const keyB = ctx.tree.people.get(b)?.birth?.date?.sortKey ?? UNKNOWN_DATE_SORT_KEY;
    if (keyA !== keyB) return keyA - keyB;
    return (ctx.fileIndex.get(a) ?? 0) - (ctx.fileIndex.get(b) ?? 0);
  });
}

function pushClear(
  cards: LayoutCard[],
  left: number,
  right: number,
  y: number,
  outward: number,
  gap: number,
): number {
  let push = 0;
  for (const card of cards) {
    if (card.y !== y) continue;
    if (right <= card.x - gap || left >= card.x + CARD_W + gap) continue;
    if (outward >= 0) {
      const delta = card.x + CARD_W + gap - left;
      if (delta > push) push = delta;
    } else {
      const delta = card.x - gap - right;
      if (delta < push) push = delta;
    }
  }
  return push;
}

function pushClearUnit(ctx: LayoutContext, unit: Unit, outward: number, gap: number): number {
  let push = 0;
  for (const card of unit.cards) {
    const delta = pushClear(ctx.cards, card.x, card.x + CARD_W, card.y, outward, gap);
    if (outward >= 0) push = Math.max(push, delta);
    else push = Math.min(push, delta);
  }
  return push;
}

function shiftToCenter(unit: Unit, center: number): Unit {
  if (unit.cards.length === 0) return unit;
  const current = (unit.left + unit.right) / 2;
  return shiftUnit(unit, center - current);
}

function shiftUnit(unit: Unit, dx: number): Unit {
  if (dx === 0) return unit;
  return {
    ...unit,
    cards: unit.cards.map((card) => ({ ...card, x: card.x + dx })),
    left: unit.left + dx,
    right: unit.right + dx,
  };
}

function unitFrom(cards: LocalCard[]): Unit {
  if (cards.length === 0) return EMPTY_UNIT;
  let left = Infinity;
  let right = -Infinity;
  for (const card of cards) {
    left = Math.min(left, card.x);
    right = Math.max(right, card.x + CARD_W);
  }
  return { cards, left, right };
}

function spanOfUnits(units: Unit[]): Span | undefined {
  if (units.length === 0) return undefined;
  let left = Infinity;
  let right = -Infinity;
  for (const unit of units) {
    left = Math.min(left, unit.left);
    right = Math.max(right, unit.right);
  }
  if (!Number.isFinite(left) || !Number.isFinite(right)) return undefined;
  return { left, right };
}

function unionSpan(a: Span, b: Span | undefined): Span {
  if (!b) return a;
  return { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) };
}

function boundsOf(cards: LayoutCard[]): LayoutBounds {
  if (cards.length === 0) return emptyBounds();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const card of cards) {
    minX = Math.min(minX, card.x);
    minY = Math.min(minY, card.y);
    maxX = Math.max(maxX, card.x + CARD_W);
    maxY = Math.max(maxY, card.y + CARD_H);
  }
  return { minX, minY, maxX, maxY };
}

function emptyBounds(): LayoutBounds {
  return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
