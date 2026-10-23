import { UNKNOWN_DATE_SORT_KEY } from '../gedcom/date';
import type { Family, FamilyTree, Person } from './types';

export interface SpouseLink {
  person: Person;
  familyId: string;
}

export interface SiblingLink {
  person: Person;
  /** True when both parents are shared; false for half-siblings. */
  full: boolean;
}

interface TreeIndex {
  parents: Map<string, Person[]>;
  children: Map<string, Person[]>;
  spouses: Map<string, SpouseLink[]>;
  siblings: Map<string, SiblingLink[]>;
  fileIndex: Map<string, number>;
}

const treeIndexes = new WeakMap<FamilyTree, TreeIndex>();

/**
 * Parent, child, spouse, and file-order maps for one tree.
 * Built once and reused. Sibling lists are filled on first use so a family
 * with thousands of children does not materialise every pair up front.
 */
export function getTreeIndex(tree: FamilyTree): TreeIndex {
  const cached = treeIndexes.get(tree);
  if (cached) return cached;

  const parents = new Map<string, Person[]>();
  const childBuckets = new Map<string, Person[]>();
  const childSeen = new Map<string, Set<string>>();
  const spouses = new Map<string, SpouseLink[]>();
  const fileIndex = new Map<string, number>();

  let index = 0;
  for (const person of tree.people.values()) {
    fileIndex.set(person.id, index);
    index += 1;
    parents.set(person.id, collectParents(tree, person));
    spouses.set(person.id, collectSpouses(tree, person));
  }

  for (const person of tree.people.values()) {
    for (const familyId of person.fams) {
      const family = tree.families.get(familyId);
      if (!family) continue;
      let bucket = childBuckets.get(person.id);
      let seen = childSeen.get(person.id);
      if (!bucket || !seen) {
        bucket = [];
        seen = new Set();
        childBuckets.set(person.id, bucket);
        childSeen.set(person.id, seen);
      }
      if (family.husband !== person.id && family.wife !== person.id) continue;
      for (const childId of family.children) {
        if (seen.has(childId)) continue;
        const child = tree.people.get(childId);
        if (!child) continue;
        seen.add(childId);
        bucket.push(child);
      }
    }
  }

  const children = new Map<string, Person[]>();
  for (const [personId, bucket] of childBuckets) {
    children.set(personId, sortChildren(bucket));
  }

  const built: TreeIndex = {
    parents,
    children,
    spouses,
    siblings: new Map(),
    fileIndex,
  };
  treeIndexes.set(tree, built);
  return built;
}

function collectParents(tree: FamilyTree, person: Person): Person[] {
  const parents: Person[] = [];
  const seen = new Set<string>();
  for (const familyId of person.famc) {
    const family = tree.families.get(familyId);
    if (!family) continue;
    for (const parentId of [family.husband, family.wife]) {
      if (parentId === undefined || seen.has(parentId)) continue;
      const parent = tree.people.get(parentId);
      if (!parent) continue;
      seen.add(parentId);
      parents.push(parent);
    }
  }
  return parents;
}

function marriageSortKey(family: Family | undefined): number {
  return family?.marriage?.date?.sortKey ?? UNKNOWN_DATE_SORT_KEY;
}

function collectSpouses(tree: FamilyTree, person: Person): SpouseLink[] {
  const spouses: Array<SpouseLink & { order: number }> = [];
  const seen = new Set<string>();

  person.fams.forEach((familyId, order) => {
    const family = tree.families.get(familyId);
    if (!family) return;
    let spouseId: string | undefined;
    if (family.husband === person.id) spouseId = family.wife;
    else if (family.wife === person.id) spouseId = family.husband;
    else return;
    if (spouseId === undefined || seen.has(spouseId)) return;
    const spouse = tree.people.get(spouseId);
    if (!spouse) return;
    seen.add(spouseId);
    spouses.push({ person: spouse, familyId, order });
  });

  spouses.sort((a, b) => {
    const keyA = marriageSortKey(tree.families.get(a.familyId));
    const keyB = marriageSortKey(tree.families.get(b.familyId));
    if (keyA !== keyB) return keyA - keyB;
    return a.order - b.order;
  });

  return spouses.map(({ person: spouse, familyId }) => ({ person: spouse, familyId }));
}

function sortChildren(children: Person[]): Person[] {
  return children
    .map((child, index) => ({
      child,
      index,
      sortKey: child.birth?.date?.sortKey ?? UNKNOWN_DATE_SORT_KEY,
    }))
    .sort((a, b) => {
      if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
      return a.index - b.index;
    })
    .map((entry) => entry.child);
}

/**
 * Full sibling iff both people are children of the same family and that
 * family records both a father and a mother. Same parents listed on two
 * different families, or a family with only one parent, are half siblings.
 */
export function sharesBothParents(tree: FamilyTree, personId: string, siblingId: string): boolean {
  const person = tree.people.get(personId);
  const sibling = tree.people.get(siblingId);
  if (!person || !sibling || personId === siblingId) return false;

  const siblingFamilies = new Set(sibling.famc);
  for (const familyId of person.famc) {
    if (!siblingFamilies.has(familyId)) continue;
    const family = tree.families.get(familyId);
    if (family?.husband && family.wife) return true;
  }
  return false;
}

/** Parents across all of the person's child-families (deduplicated, father first). */
export function getParents(tree: FamilyTree, personId: string): Person[] {
  if (!tree.people.has(personId)) return [];
  return getTreeIndex(tree).parents.get(personId) ?? [];
}

/**
 * Spouses with the family each relationship belongs to.
 * Ordered by marriage date, then by the order the families appear on the person.
 */
export function getSpouses(tree: FamilyTree, personId: string): SpouseLink[] {
  if (!tree.people.has(personId)) return [];
  return getTreeIndex(tree).spouses.get(personId) ?? [];
}

/**
 * Children of every family in which the person is a spouse. Sorted by birth date
 * when known; children without a usable birth date keep their file order at the end.
 */
export function getChildren(tree: FamilyTree, personId: string): Person[] {
  if (!tree.people.has(personId)) return [];
  return getTreeIndex(tree).children.get(personId) ?? [];
}

/**
 * Siblings of the person, including half-siblings found through a parent's other
 * marriages. Full siblings come first; each entry is flagged as full or half.
 */
export function getSiblings(tree: FamilyTree, personId: string): SiblingLink[] {
  if (!tree.people.has(personId)) return [];
  const index = getTreeIndex(tree);
  const cached = index.siblings.get(personId);
  if (cached) return cached;

  const person = tree.people.get(personId);
  if (!person) return [];

  const siblings = new Map<string, SiblingLink>();

  const addSibling = (siblingId: string): void => {
    if (siblingId === personId || siblings.has(siblingId)) return;
    const sibling = tree.people.get(siblingId);
    if (!sibling) return;
    siblings.set(siblingId, {
      person: sibling,
      full: sharesBothParents(tree, personId, siblingId),
    });
  };

  for (const familyId of person.famc) {
    const family = tree.families.get(familyId);
    if (!family) continue;
    for (const childId of family.children) addSibling(childId);
  }

  for (const parent of index.parents.get(personId) ?? []) {
    for (const familyId of parent.fams) {
      const family = tree.families.get(familyId);
      if (!family || (family.husband !== parent.id && family.wife !== parent.id)) continue;
      for (const childId of family.children) addSibling(childId);
    }
  }

  const list = [...siblings.values()].sort((a, b) => Number(b.full) - Number(a.full));
  index.siblings.set(personId, list);
  return list;
}

/**
 * Card sub-text per the spec:
 * `1950 – 2010`, `1989`, `Deceased`, or empty for a living person without dates.
 */
export function lifeSpanLabel(person: Person): string {
  const birthYear = person.birth?.date?.year;
  const deathYear = person.death?.date?.year;

  if (person.isLiving) {
    return birthYear === undefined ? '' : String(birthYear);
  }

  if (birthYear !== undefined && deathYear !== undefined) {
    return `${birthYear} – ${deathYear}`;
  }
  if (birthYear !== undefined) return String(birthYear);
  if (deathYear !== undefined) return `– ${deathYear}`;
  return 'Deceased';
}

/** The home person when the id resolves, otherwise the first person in the tree. */
export function getHomePerson(tree: FamilyTree): Person | undefined {
  const home = tree.homePersonId === undefined ? undefined : tree.people.get(tree.homePersonId);
  if (home) return home;
  return tree.people.values().next().value;
}
