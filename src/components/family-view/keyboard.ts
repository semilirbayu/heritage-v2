/** True when arrow keys and Escape should stay with a text control. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (target == null || typeof target !== 'object') return false;

  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  }

  if (!('tagName' in target)) return false;
  const tagName = String((target as { tagName: unknown }).tagName).toUpperCase();
  return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}
