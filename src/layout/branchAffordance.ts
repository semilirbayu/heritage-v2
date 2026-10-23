import { getChildren, getParents, getSiblings, getSpouses, getTreeIndex } from '../model/helpers';
import type { FamilyTree } from '../model/types';

/** Pill group origin, in tree units, relative to the card's top-left. */
export const BRANCH_MARK_DX = 155;
export const BRANCH_MARK_DY = -20;

export interface BranchTarget {
  personId: string;
}

/**
 * One "View family branch" pill per shown person who has a parent, sibling,
 * spouse, or child in the file that is not currently shown.
 */
export function branchTargets(tree: FamilyTree, shownIds: ReadonlySet<string>): BranchTarget[] {
  const index = getTreeIndex(tree);
  const ids = [...shownIds].sort((a, b) => {
    const fileDelta = (index.fileIndex.get(a) ?? 0) - (index.fileIndex.get(b) ?? 0);
    return fileDelta !== 0 ? fileDelta : a.localeCompare(b);
  });

  const targets: BranchTarget[] = [];
  for (const personId of ids) {
    if (!tree.people.has(personId) || !hasHiddenImmediateFamily(tree, personId, shownIds)) continue;
    targets.push({ personId });
  }
  return targets;
}

export function branchMarkOrigin(x: number, y: number): { x: number; y: number } {
  return { x: x + BRANCH_MARK_DX, y: y + BRANCH_MARK_DY };
}

function hasHiddenImmediateFamily(
  tree: FamilyTree,
  personId: string,
  shownIds: ReadonlySet<string>,
): boolean {
  const hidden = (id: string | undefined): boolean =>
    id !== undefined && tree.people.has(id) && !shownIds.has(id);

  if (getParents(tree, personId).some((parent) => hidden(parent.id))) return true;
  if (getSiblings(tree, personId).some((sibling) => hidden(sibling.person.id))) return true;
  if (getSpouses(tree, personId).some((spouse) => hidden(spouse.person.id))) return true;
  if (getChildren(tree, personId).some((child) => hidden(child.id))) return true;
  return false;
}
