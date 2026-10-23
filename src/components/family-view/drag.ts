type DragTarget = {
  addEventListener: (type: string, listener: (event: PointerEvent) => void) => void;
  removeEventListener: (type: string, listener: (event: PointerEvent) => void) => void;
};

/**
 * Window-level drag listeners. The returned function removes both, including
 * when the view unmounts mid-gesture.
 */
export function bindWindowDrag(
  target: DragTarget,
  handlers: {
    move: (event: PointerEvent) => void;
    up: () => void;
  },
): () => void {
  const onUp = (): void => {
    handlers.up();
    target.removeEventListener('pointermove', handlers.move);
    target.removeEventListener('pointerup', onUp);
  };
  target.addEventListener('pointermove', handlers.move);
  target.addEventListener('pointerup', onUp);
  return () => {
    target.removeEventListener('pointermove', handlers.move);
    target.removeEventListener('pointerup', onUp);
  };
}
