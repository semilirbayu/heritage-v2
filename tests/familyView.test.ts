import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bindWindowDrag } from '../src/components/family-view/drag';
import FamilyView from '../src/components/family-view/FamilyView';
import { isTextEntryTarget } from '../src/components/family-view/keyboard';
import { parseGedcom } from '../src/gedcom/parser';
import { canvasMeasureAttempts } from '../src/layout/wrapName';

describe('family view input', () => {
  it('labels the search field and ignores tree keys while typing', () => {
    const tree = parseGedcom('0 HEAD\n1 _HOME @I1@\n0 @I1@ INDI\n1 NAME Ada /Lovelace/\n1 SEX F\n0 TRLR\n').tree;
    const before = canvasMeasureAttempts();
    const html = renderToStaticMarkup(
      createElement(FamilyView, { tree, warnings: [], onOpenAnother: () => undefined }),
    );
    expect(canvasMeasureAttempts()).toBe(before);
    expect(html).toContain('aria-label="Find a person"');
    expect(isTextEntryTarget({ tagName: 'input' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntryTarget(null)).toBe(false);
  });

  it('removes window drag listeners when the gesture is cancelled', () => {
    const listeners = new Map<string, Set<(event: PointerEvent) => void>>();
    const target = {
      addEventListener(type: string, listener: (event: PointerEvent) => void): void {
        const bucket = listeners.get(type) ?? new Set();
        bucket.add(listener);
        listeners.set(type, bucket);
      },
      removeEventListener(type: string, listener: (event: PointerEvent) => void): void {
        listeners.get(type)?.delete(listener);
      },
    };
    let ended = 0;
    const stop = bindWindowDrag(target, {
      move: () => undefined,
      up: () => {
        ended += 1;
      },
    });
    expect(listeners.get('pointermove')?.size).toBe(1);
    expect(listeners.get('pointerup')?.size).toBe(1);
    stop();
    expect(listeners.get('pointermove')?.size).toBe(0);
    expect(listeners.get('pointerup')?.size).toBe(0);
    expect(ended).toBe(0);
  });
});
