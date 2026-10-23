import { getChildren, getSiblings, getSpouses, getTreeIndex } from '../model/helpers';
import type { FamilyTree } from '../model/types';
import { MAX_VISIBLE, generationLimit, type VisibilityOptions } from './constants';

export interface VisibleSelection {
  ids: Set<string>;
  /** Generation relative to the root. Root is 0, parents are -1, children are +1. */
  generation: Map<string, number>;
  /**
   * People who reach the root by parent/child links alone.
   * Spouses are omitted unless they also have a blood path.
   */
  blood: Set<string>;
  shown: number;
  total: number;
}

/**
 * People drawn for one Family view.
 *
 * - The root, every spouse, and descendants down to the generation limit,
 *   each with their spouses.
 * - Every direct ancestor up to that limit, plus the co-parent of the line.
 *   An ancestor's other spouses stay hidden.
 * - With `cousins`, every descendant of the root's parents and grandparents
 *   (siblings, aunts and uncles, cousins, and on down) with their spouses,
 *   still cut off by the generation limit. Great-grandparents and above
 *   contribute only themselves and the co-parent.
 * - With `cousins` off, collateral kin stop at the root's siblings and those
 *   siblings' spouses.
 * - A spouse's own parents and siblings are never added.
 * - The draw list is capped at MAX_VISIBLE. Farthest kin drop first.
 */
export function selectVisible(
  tree: FamilyTree,
  rootId: string,
  options: VisibilityOptions,
): VisibleSelection {
  const total = tree.people.size;
  const empty: VisibleSelection = {
    ids: new Set(),
    generation: new Map(),
    blood: new Set(),
    shown: 0,
    total,
  };
  if (!tree.people.has(rootId)) return empty;

  const index = getTreeIndex(tree);
  const maxGen = generationLimit(options.generations);
  const ids = new Set<string>();
  const ancestorDepth = collectAncestorDepth(index, rootId, maxGen);

  const add = (id: string): void => {
    if (tree.people.has(id)) ids.add(id);
  };

  const addSpouses = (id: string): void => {
    for (const spouse of getSpouses(tree, id)) {
      const spouseId = spouse.person.id;
      // The root keeps every spouse. Anyone else on the direct line keeps
      // only the co-parent, who is themselves on that line.
      if (ancestorDepth.has(id) && id !== rootId && !ancestorDepth.has(spouseId)) continue;
      add(spouseId);
    }
  };

  const expanded = new Set<string>();
  const includeDown = (id: string, gen: number): void => {
    if (!tree.people.has(id) || gen > maxGen) return;
    add(id);
    addSpouses(id);
    if (gen >= maxGen || expanded.has(id)) return;
    expanded.add(id);
    for (const child of getChildren(tree, id)) includeDown(child.id, gen + 1);
  };

  includeDown(rootId, 0);
  for (const id of ancestorDepth.keys()) add(id);

  if (options.cousins) {
    for (const [id, depth] of ancestorDepth) {
      if (depth === 1 || depth === 2) includeDown(id, -depth);
    }
  } else {
    for (const sibling of getSiblings(tree, rootId)) {
      add(sibling.person.id);
      addSpouses(sibling.person.id);
    }
  }

  retainConnected(index, rootId, ids);
  pruneToCap(index, rootId, ids);
  retainConnected(index, rootId, ids);

  const { generation, blood } = assignGenerations(index, rootId, ids);
  return { ids, generation, blood, shown: ids.size, total };
}

/** Shortest parent-walk distance from the root, inclusive, capped at `maxGen`. */
function collectAncestorDepth(
  index: ReturnType<typeof getTreeIndex>,
  rootId: string,
  maxGen: number,
): Map<string, number> {
  const depth = new Map<string, number>([[rootId, 0]]);
  const queue: Array<{ id: string; depth: number }> = [{ id: rootId, depth: 0 }];
  let head = 0;

  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    if (!current || depth.get(current.id) !== current.depth || current.depth >= maxGen) continue;
    for (const parent of index.parents.get(current.id) ?? []) {
      const next = current.depth + 1;
      const previous = depth.get(parent.id);
      if (previous !== undefined && previous <= next) continue;
      depth.set(parent.id, next);
      queue.push({ id: parent.id, depth: next });
    }
  }

  return depth;
}

function assignGenerations(
  index: ReturnType<typeof getTreeIndex>,
  rootId: string,
  ids: Set<string>,
): { generation: Map<string, number>; blood: Set<string> } {
  const generation = new Map<string, number>();
  const blood = new Set<string>();
  if (!ids.has(rootId)) return { generation, blood };

  const queue = [rootId];
  const arrivedViaParent = new Set<string>([rootId]);
  generation.set(rootId, 0);
  blood.add(rootId);
  let head = 0;

  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    if (id === undefined) continue;
    const gen = generation.get(id) ?? 0;

    // Walking back up from a descendant assigns the other parent — often just
    // a spouse — the child's generation. Ancestors and their descendants are
    // reached by following parents first, then children only.
    if (arrivedViaParent.has(id)) {
      for (const parent of index.parents.get(id) ?? []) {
        if (!ids.has(parent.id) || generation.has(parent.id)) continue;
        generation.set(parent.id, gen - 1);
        blood.add(parent.id);
        arrivedViaParent.add(parent.id);
        queue.push(parent.id);
      }
    }
    for (const child of index.children.get(id) ?? []) {
      if (!ids.has(child.id) || generation.has(child.id)) continue;
      generation.set(child.id, gen + 1);
      blood.add(child.id);
      queue.push(child.id);
    }
  }

  const pending = [...ids].filter((id) => !blood.has(id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of pending) {
      if (blood.has(id)) continue;
      let best: number | undefined;
      for (const spouse of index.spouses.get(id) ?? []) {
        if (!ids.has(spouse.person.id)) continue;
        const spouseGen = generation.get(spouse.person.id);
        if (spouseGen === undefined) continue;
        if (best === undefined || Math.abs(spouseGen) < Math.abs(best)) best = spouseGen;
      }
      if (best === undefined || generation.get(id) === best) continue;
      generation.set(id, best);
      changed = true;
    }
  }

  for (const id of ids) {
    if (!generation.has(id)) generation.set(id, 0);
  }

  return { generation, blood };
}

function pruneToCap(
  index: ReturnType<typeof getTreeIndex>,
  rootId: string,
  ids: Set<string>,
): void {
  if (ids.size <= MAX_VISIBLE) return;

  const distance = kinshipDistance(index, rootId, ids);
  const direct = directLine(index, rootId, ids);

  const ranked = [...ids].filter((id) => id !== rootId);
  ranked.sort((a, b) => {
    const distanceDelta = (distance.get(b) ?? 9999) - (distance.get(a) ?? 9999);
    if (distanceDelta !== 0) return distanceDelta;
    const collateralDelta = Number(!direct.has(b)) - Number(!direct.has(a));
    if (collateralDelta !== 0) return collateralDelta;
    return (index.fileIndex.get(b) ?? 0) - (index.fileIndex.get(a) ?? 0);
  });

  for (const id of ranked) {
    if (ids.size <= MAX_VISIBLE) break;
    ids.delete(id);
  }
}

/** Blood ancestors, descendants, and their spouses. Kept ahead of cousins when pruning. */
function directLine(
  index: ReturnType<typeof getTreeIndex>,
  rootId: string,
  ids: Set<string>,
): Set<string> {
  const direct = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || !ids.has(id) || direct.has(id)) continue;
    direct.add(id);
    for (const parent of index.parents.get(id) ?? []) stack.push(parent.id);
    for (const child of index.children.get(id) ?? []) stack.push(child.id);
  }

  const withSpouses = new Set(direct);
  for (const id of direct) {
    for (const spouse of index.spouses.get(id) ?? []) {
      if (ids.has(spouse.person.id)) withSpouses.add(spouse.person.id);
    }
  }
  return withSpouses;
}

/**
 * Steps from the root along parent, child, and spouse links inside `ids`.
 * Spouse links cost 0 so a partner is never farther than the person they married.
 * 0-1 buckets avoid `queue.shift()`.
 */
function kinshipDistance(
  index: ReturnType<typeof getTreeIndex>,
  rootId: string,
  ids: Set<string>,
): Map<string, number> {
  const distance = new Map<string, number>();
  if (!ids.has(rootId)) return distance;

  distance.set(rootId, 0);
  const buckets: string[][] = [[rootId]];

  for (let depth = 0; depth < buckets.length; depth += 1) {
    const bucket = buckets[depth];
    if (!bucket) continue;
    for (let cursor = 0; cursor < bucket.length; cursor += 1) {
      const id = bucket[cursor];
      if (id === undefined || distance.get(id) !== depth) continue;

      const relax = (nextId: string | undefined, cost: number): void => {
        if (nextId === undefined || !ids.has(nextId)) return;
        const next = depth + cost;
        const previous = distance.get(nextId);
        if (previous !== undefined && previous <= next) return;
        distance.set(nextId, next);
        const dest = buckets[next] ?? [];
        if (!buckets[next]) buckets[next] = dest;
        dest.push(nextId);
      };

      for (const spouse of index.spouses.get(id) ?? []) relax(spouse.person.id, 0);
      for (const parent of index.parents.get(id) ?? []) relax(parent.id, 1);
      for (const child of index.children.get(id) ?? []) relax(child.id, 1);
    }
  }

  return distance;
}

/** Parent, child, and spouse links only — a sibling edge is not a drawn connector. */
function retainConnected(
  index: ReturnType<typeof getTreeIndex>,
  rootId: string,
  ids: Set<string>,
): void {
  const reached = new Set<string>();
  if (!ids.has(rootId)) {
    ids.clear();
    return;
  }

  const queue = [rootId];
  reached.add(rootId);
  let head = 0;

  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    if (id === undefined) continue;

    const neighbors = [
      ...(index.parents.get(id) ?? []).map((parent) => parent.id),
      ...(index.children.get(id) ?? []).map((child) => child.id),
      ...(index.spouses.get(id) ?? []).map((spouse) => spouse.person.id),
    ];

    for (const neighbor of neighbors) {
      if (!ids.has(neighbor) || reached.has(neighbor)) continue;
      reached.add(neighbor);
      queue.push(neighbor);
    }
  }

  for (const id of [...ids]) {
    if (!reached.has(id)) ids.delete(id);
  }
}
