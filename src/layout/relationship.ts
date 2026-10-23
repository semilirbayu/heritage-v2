import { getParents, getSiblings, getSpouses } from '../model/helpers';
import type { FamilyTree, Person, Sex } from '../model/types';

function byId(tree: FamilyTree, id: string): Person | undefined {
  return tree.people.get(id);
}

function sexWord(sex: Sex, male: string, female: string, unknown: string): string {
  if (sex === 'M') return male;
  if (sex === 'F') return female;
  return unknown;
}

/** Parent steps from `fromId` up to `ancestorId`, or -1 when it is not an ancestor. */
function ancestorDistance(tree: FamilyTree, fromId: string, ancestorId: string): number {
  if (fromId === ancestorId) return 0;

  const seen = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: fromId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.id)) continue;
    seen.add(current.id);

    for (const parent of getParents(tree, current.id)) {
      if (parent.id === ancestorId) return current.depth + 1;
      if (!seen.has(parent.id)) queue.push({ id: parent.id, depth: current.depth + 1 });
    }
  }

  return -1;
}

function ancestorLabel(sex: Sex, steps: number): string {
  if (steps <= 1) return sexWord(sex, 'Father', 'Mother', 'Parent');
  if (steps === 2) return sexWord(sex, 'Grandfather', 'Grandmother', 'Grandparent');
  if (steps >= 5) return 'Ancestor';
  return 'Great-'.repeat(steps - 2) + sexWord(sex, 'grandfather', 'grandmother', 'grandparent');
}

function descendantLabel(sex: Sex, steps: number): string {
  if (steps <= 1) return sexWord(sex, 'Son', 'Daughter', 'Child');
  if (steps === 2) return sexWord(sex, 'Grandson', 'Granddaughter', 'Grandchild');
  return 'Relative';
}

function childIdsOf(tree: FamilyTree, personId: string): string[] {
  const person = tree.people.get(personId);
  if (!person) return [];
  const ids: string[] = [];
  for (const familyId of person.fams) {
    const family = tree.families.get(familyId);
    if (!family) continue;
    for (const childId of family.children) ids.push(childId);
  }
  return ids;
}

function isSpouseOf(tree: FamilyTree, personId: string, candidates: Set<string>): boolean {
  return getSpouses(tree, personId).some((link) => candidates.has(link.person.id));
}

function siblingWord(tree: FamilyTree, personId: string, otherId: string, sex: Sex): string | undefined {
  const sibling = getSiblings(tree, otherId).find((link) => link.person.id === personId);
  if (!sibling) return undefined;
  if (sibling.full) return sexWord(sex, 'Brother', 'Sister', 'Sibling');
  return sexWord(sex, 'Half-brother', 'Half-sister', 'Half-sibling');
}

function inLawLabel(tree: FamilyTree, personId: string, homeId: string, sex: Sex): string | undefined {
  for (const spouse of getSpouses(tree, homeId)) {
    if (getParents(tree, spouse.person.id).some((parent) => parent.id === personId)) {
      return sexWord(sex, 'Father-in-law', 'Mother-in-law', 'Parent-in-law');
    }
    if (siblingWord(tree, personId, spouse.person.id, sex)) {
      return sexWord(sex, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law');
    }
  }

  if (isSpouseOf(tree, personId, new Set(childIdsOf(tree, homeId)))) {
    return sexWord(sex, 'Son-in-law', 'Daughter-in-law', 'Child-in-law');
  }

  const siblings = new Set(getSiblings(tree, homeId).map((link) => link.person.id));
  if (isSpouseOf(tree, personId, siblings)) {
    return sexWord(sex, 'Brother-in-law', 'Sister-in-law', 'Sibling-in-law');
  }

  return undefined;
}

function auntLabel(sex: Sex, ancestorSteps: number): string {
  const base = sexWord(sex, 'Uncle', 'Aunt', 'Relative');
  // steps 1 = sibling of a parent (aunt). Each further generation adds a "Great-".
  const greats = ancestorSteps - 1;
  if (greats <= 0) return base;
  return 'Great-'.repeat(greats) + base.toLowerCase();
}

/**
 * Aunt, uncle, or cousin through a sibling of one of the home person's ancestors.
 * Married-in partners of those siblings use Aunt/Uncle as well.
 */
function collateralLabel(
  tree: FamilyTree,
  personId: string,
  homeId: string,
  relative: Person,
): string | undefined {
  const seen = new Set<string>();
  const queue: Array<{ id: string; steps: number }> = [{ id: homeId, steps: 0 }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.id) || current.steps > 4) continue;
    seen.add(current.id);

    for (const parent of getParents(tree, current.id)) {
      if (!seen.has(parent.id)) queue.push({ id: parent.id, steps: current.steps + 1 });
    }

    if (current.steps === 0) continue;

    for (const sibling of getSiblings(tree, current.id)) {
      if (sibling.person.id === personId) return auntLabel(relative.sex, current.steps);
      if (isSpouseOf(tree, personId, new Set([sibling.person.id]))) {
        return auntLabel(relative.sex, current.steps);
      }
      if (ancestorDistance(tree, personId, sibling.person.id) > 0) return 'Cousin';
    }
  }

  return undefined;
}

function nieceLabel(tree: FamilyTree, personId: string, homeId: string, sex: Sex): string | undefined {
  for (const sibling of getSiblings(tree, homeId)) {
    if (ancestorDistance(tree, personId, sibling.person.id) === 1) {
      return sexWord(sex, 'Nephew', 'Niece', 'Relative');
    }
  }
  return undefined;
}

/**
 * Plain-language relationship of `personId` to `homeId`
 * ("Father", "Aunt", "Cousin", …). Distant or ambiguous links are "Relative".
 */
export function relationshipToHome(tree: FamilyTree, personId: string, homeId: string): string {
  if (personId === homeId) return 'Home person';

  const relative = byId(tree, personId);
  const home = byId(tree, homeId);
  if (!relative || !home) return 'Relative';

  const up = ancestorDistance(tree, homeId, personId);
  if (up > 0) return ancestorLabel(relative.sex, up);

  const down = ancestorDistance(tree, personId, homeId);
  if (down > 0) return descendantLabel(relative.sex, down);

  const spouse = getSpouses(tree, homeId).find((link) => link.person.id === personId);
  if (spouse) {
    const family = tree.families.get(spouse.familyId);
    if (family?.divorced) return sexWord(relative.sex, 'Ex-husband', 'Ex-wife', 'Ex-partner');
    return sexWord(relative.sex, 'Husband', 'Wife', 'Spouse');
  }

  const sibling = siblingWord(tree, personId, homeId, relative.sex);
  if (sibling) return sibling;

  const inLaw = inLawLabel(tree, personId, homeId, relative.sex);
  if (inLaw) return inLaw;

  const collateral = collateralLabel(tree, personId, homeId, relative);
  if (collateral) return collateral;

  const niece = nieceLabel(tree, personId, homeId, relative.sex);
  if (niece) return niece;

  return 'Relative';
}

/**
 * Immediate-family row label from the profile person's point of view:
 * "His father", "Her son", "Their sibling".
 */
export function possessiveRole(tree: FamilyTree, profileId: string, relativeId: string): string {
  const profile = byId(tree, profileId);
  const pronoun = profile?.sex === 'M' ? 'His' : profile?.sex === 'F' ? 'Her' : 'Their';
  const relation = relationshipToHome(tree, relativeId, profileId);
  if (relation === 'Home person') return relation;
  return `${pronoun} ${relation.toLowerCase()}`;
}
