/**
 * Re-root path shown in the header. The last id is the current root.
 * Visiting someone already on the path truncates back to that entry.
 */
export function nextRootTrail(trail: readonly string[], nextId: string): string[] {
  if (!nextId) return [...trail];
  const found = trail.indexOf(nextId);
  if (found >= 0) return trail.slice(0, found + 1);
  return [...trail, nextId];
}
