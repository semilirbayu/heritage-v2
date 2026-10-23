import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { CARD_H, CARD_W, COUPLE_DX, ROW_DY } from '../../src/layout/constants';
import { layoutFamilyView } from '../../src/layout/layoutFamilyView';
import type { LayoutCard } from '../../src/layout/types';

const liveText = readFileSync(new URL('../fixtures/live-reference.ged', import.meta.url), 'utf8');
const live = parseGedcom(liveText).tree;
const largeText = readFileSync(new URL('../fixtures/large-1000.ged', import.meta.url), 'utf8');

const options = { generations: 'all' as const, cousins: true };

function place(root = 'IPUBA') {
  return layoutFamilyView(live, root, options);
}

function cardMap(cards: LayoutCard[]): Map<string, LayoutCard> {
  return new Map(cards.map((card) => [card.personId, card]));
}

describe('live reference layout', () => {
  const layout = place();
  const cards = cardMap(layout.cards);
  const at = (id: string): LayoutCard => {
    const card = cards.get(id);
    if (!card) throw new Error(`missing card ${id}`);
    return card;
  };

  it('parses the reference tree with Beka as home', () => {
    expect(live.homePersonId).toBe('IPUBA');
    expect(live.people.size).toBe(42);
    expect(parseGedcom(liveText).warnings).toEqual([]);
  });

  it('places every selected person and keeps rows 188 apart', () => {
    expect(layout.cards).toHaveLength(42);
    expect(at('IPUBA')).toMatchObject({ x: 0, y: 0 });
    for (const card of layout.cards) {
      expect(card.y / ROW_DY).toBe(Math.round(card.y / ROW_DY));
    }
  });

  it('matches the measured stem: spouse, siblings, daughter, parents', () => {
    // One older single brother and one younger single sister balance the
    // parent couple on the root couple. Undated Fev sorts after dated births.
    expect(at('IBEFIP')).toMatchObject({ x: -277, y: 0 });
    expect(at('IFAMAS')).toMatchObject({ x: COUPLE_DX, y: 0 });
    expect(at('IBOP')).toMatchObject({ x: 531, y: 0 });
    expect(at('IFEFEB')).toMatchObject({ x: 127, y: ROW_DY });
    expect(at('IMABAMEPE')).toMatchObject({ x: 0, y: -ROW_DY, side: 'paternal' });
    expect(at('ISAFEKU')).toMatchObject({ x: COUPLE_DX, y: -ROW_DY, side: 'maternal' });
  });

  it('matches measured maternal uncles, spouses, and their children', () => {
    expect(at('IMISEKI')).toMatchObject({ x: 820, y: -ROW_DY });
    expect(at('IFOF')).toMatchObject({ x: 1074, y: -ROW_DY });
    expect(at('IMOKOF')).toMatchObject({ x: 808, y: 0 });
    expect(at('ISABO')).toMatchObject({ x: 1085, y: 0 });
    expect(at('IMIKEKE')).toMatchObject({ x: 1362, y: -ROW_DY });
    expect(at('IVIVIMUM')).toMatchObject({ x: 1616, y: -ROW_DY });
    // Vikus is Fesuvo's child, so he sits on the cousin row (y = 0). The
    // capture lists him on the row below (dy 188) while his x is the couple
    // centre; that y only fits a grandchild. x is the unambiguous part.
    expect(at('IFUSEK')).toMatchObject({ x: 1489, y: 0 });
  });

  it('places every measured couple husband-left and wife-right', () => {
    const couple = (husband: string, wife: string): void => {
      expect(at(wife).y, wife).toBe(at(husband).y);
      expect(at(wife).x - at(husband).x, `${husband}|${wife}`).toBe(COUPLE_DX);
    };

    couple('ISAMUKUVU', 'IMOPOFAVA');
    couple('IMOB', 'IMIMOP');
    couple('IVESUFU', 'IPIMOVUS');
    couple('IMISEKI', 'IFOF');
    couple('IMIKEKE', 'IVIVIMUM');
    couple('IPUBA', 'IFAMAS');

    // Bubibuf's husbands stack on her left. The later marriage (Pevuk) is
    // farther from her than the first (Kukivu).
    expect(at('IPOSAK').y).toBe(at('IPIMOVUS').y);
    expect(at('IVESUFU').x - at('IPOSAK').x).toBe(COUPLE_DX);
    expect(at('IPOSAK').x).toBeLessThan(at('IVESUFU').x);
  });

  it('centres each marriage’s children under that couple', () => {
    const centred = (children: string[], husband: string, wife: string): void => {
      const mid = (at(husband).x + at(wife).x) / 2 + CARD_W / 2;
      const centers = children.map((id) => at(id).x + CARD_W / 2);
      const low = Math.min(...centers);
      const high = Math.max(...centers);
      // Card x is rounded to a whole unit, so a two-child group can sit
      // half a unit off the exact couple midpoint.
      expect(Math.abs((low + high) / 2 - mid), children.join(',')).toBeLessThanOrEqual(0.5);
      for (const id of children) expect(at(id).y).toBe(at(husband).y + ROW_DY);
    };

    centred(['IVIKUKIM'], 'IVESUFU', 'IPIMOVUS');
    centred(['IMAKUV', 'IFOSUV'], 'IMOB', 'IMIMOP');
    centred(['IFEFEB'], 'IPUBA', 'IFAMAS');
    centred(['IFUSEK'], 'IMIKEKE', 'IVIVIMUM');
    centred(['IMOKOF', 'ISABO'], 'IMISEKI', 'IFOF');
  });

  it('matches measured paternal aunt, cousin units, and cousin children', () => {
    // Vufasafa is the sibling packed against the stem. Her husband is to her left.
    expect(at('IMOPOFAVA').y).toBe(-ROW_DY);
    expect(at('ISAMUKUVU').x).toBeLessThan(at('IMOPOFAVA').x);
    expect(at('IMOPOFAVA').x).toBeLessThan(at('IMABAMEPE').x);

    expect(at('IPIMOVUS').y).toBe(0);
    expect(at('IMOB').y).toBe(0);
    expect(at('IMOB').x).toBeLessThan(at('IMIMOP').x);
    expect(at('IVIKUKIM').y).toBe(ROW_DY);
    expect(at('IMAKUV').y).toBe(ROW_DY);
    expect(at('IFOSUV').y).toBe(ROW_DY);
    expect(at('IMAKUV').x).toBeLessThan(at('IFOSUV').x);
  });

  it('keeps every captured person on the measured generation row', () => {
    const row = (id: string, generationsUp: number): void => {
      expect(at(id).y).toBe(-generationsUp * ROW_DY);
    };
    row('IFUVUM', 5);
    row('IKEV', 4);
    row('IBOVEM', 4);
    row('IMIFEMU', 4);
    row('ISEFU', 3);
    row('IVIPUFU', 3);
    row('IBAFEM', 3);
    row('IKIMIVI', 3);
    row('ISEKA', 3);
    row('IFAFEPAV', 3);
    row('IVASOV', 2);
    row('IPIVAVIB', 2);
    row('IVIVEFUKE', 2);
    row('IMOKEBOK', 2);
    row('IVOFEFIV', 1);
    row('ISOPIFAV', 1);
  });

  it('places ancestor couples by the inner-parent rule relative to their child', () => {
    // Absolute x differs from the capture: that tree still had off-screen
    // relatives (Sapemop sits further left there). The offsets below are what
    // the rules fix once the child is placed.
    const grandpaA = at('IVASOV');
    const grandmaA = at('IPIVAVIB');
    expect(grandmaA.x - grandpaA.x).toBe(COUPLE_DX);
    expect(grandpaA.x).toBeLessThan(0);
    expect(at('IVIPUFU').x).toBe(grandpaA.x);
    expect(at('ISEFU').x).toBe(grandpaA.x - COUPLE_DX);
    expect(at('IBAFEM').x).toBe(grandmaA.x);
    expect(at('IKIMIVI').x).toBe(grandmaA.x + COUPLE_DX);

    // Single fathers: outer gendered slot is centred (half a couple step);
    // inner gendered slot stays on the child.
    expect(at('IKEV').x).toBe(at('ISEFU').x - COUPLE_DX / 2);
    expect(at('IFUVUM').x).toBe(at('IKEV').x - COUPLE_DX / 2);
    expect(at('IBOVEM').x).toBe(at('IKIMIVI').x);
    expect(at('IMIFEMU').x).toBe(at('IKIMIVI').x + COUPLE_DX);

    const grandpaB = at('IVIVEFUKE');
    const grandmaB = at('IMOKEBOK');
    expect(grandmaB.x - grandpaB.x).toBe(COUPLE_DX);
    expect(grandpaB.x).toBeGreaterThan(0);
    expect(at('ISEKA').x).toBe(grandpaB.x - COUPLE_DX / 2);
    expect(at('IFAFEPAV').x).toBe(grandmaB.x);
  });

  it('orders the father\'s brothers by file order on his left', () => {
    const ids = ['ISOPIFAV', 'IBOVIBAF', 'IPIKOBEK', 'IVOFEFIV', 'IMOPOFAVA', 'IMABAMEPE'];
    const xs = ids.map((id) => at(id).x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
    expect(at('ISOPIFAV').x).toBeLessThan(at('IMABAMEPE').x);
    for (const id of ids) expect(at(id).y).toBe(-ROW_DY);
  });

  it('does not overlap cards', () => {
    const cards = layout.cards;
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i];
        const b = cards[j];
        if (!a || !b) continue;
        const separated =
          a.x + CARD_W <= b.x ||
          b.x + CARD_W <= a.x ||
          a.y + CARD_H <= b.y ||
          b.y + CARD_H <= a.y;
        expect(separated, `${a.personId} overlaps ${b.personId}`).toBe(true);
      }
    }
  });

  it('draws a couple bar and rounded child drops', () => {
    const parents = layout.connectors.find((connector) => connector.familyId === 'FPARENTS');
    expect(parents?.d).toContain('M 220 -137 L 254 -137');
    expect(parents?.d).toContain('A 30 30');
    const homeFamily = layout.connectors.find((connector) => connector.familyId === 'FPUBA');
    expect(homeFamily?.d.startsWith('M ')).toBe(true);
  });

  it('is deterministic', () => {
    const again = place();
    expect(again.cards).toEqual(layout.cards);
    expect(again.connectors).toEqual(layout.connectors);
  });
});

describe('reserved placeholder space', () => {
  /**
   * Root -> father -> paternal grandparents. The grandmother's own parents are
   * varied: both known, only her father, or none (a placeholder pair). The
   * grandparents must shift by whatever space that ancestor block reserves.
   */
  function ancestorTree(grandmotherParents: 'both' | 'father' | 'none') {
    const lines = [
      '0 HEAD',
      '1 _HOME @I1@',
      '0 @I1@ INDI',
      '1 NAME Root /Person/',
      '1 SEX M',
      '1 FAMC @F1@',
      '0 @I2@ INDI',
      '1 NAME Father /Person/',
      '1 SEX M',
      '1 FAMC @F2@',
      '1 FAMS @F1@',
      '0 @I3@ INDI',
      '1 NAME Mother /Person/',
      '1 SEX F',
      '1 FAMS @F1@',
      '0 @I4@ INDI',
      '1 NAME Grandfather /Person/',
      '1 SEX M',
      '1 FAMS @F2@',
      '0 @I5@ INDI',
      '1 NAME Grandmother /Person/',
      '1 SEX F',
      '1 FAMS @F2@',
    ];
    if (grandmotherParents !== 'none') {
      lines.push(
        '1 FAMC @F3@',
        '0 @I6@ INDI',
        '1 NAME Great-grandfather /Person/',
        '1 SEX M',
        '1 FAMS @F3@',
      );
    }
    if (grandmotherParents === 'both') {
      lines.push(
        '0 @I7@ INDI',
        '1 NAME Great-grandmother /Person/',
        '1 SEX F',
        '1 FAMS @F3@',
      );
    }
    lines.push(
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 WIFE @I3@',
      '1 CHIL @I1@',
      '0 @F2@ FAM',
      '1 HUSB @I4@',
      '1 WIFE @I5@',
      '1 CHIL @I2@',
    );
    if (grandmotherParents !== 'none') {
      lines.push('0 @F3@ FAM', '1 HUSB @I6@');
      if (grandmotherParents === 'both') lines.push('1 WIFE @I7@');
      lines.push('1 CHIL @I5@');
    }
    lines.push('0 TRLR');
    return parseGedcom(lines.join('\n')).tree;
  }

  function xOf(tree: ReturnType<typeof ancestorTree>, id: string): number {
    const layout = layoutFamilyView(tree, 'I1', options);
    const card = layout.cards.find((entry) => entry.personId === id);
    if (!card) throw new Error(`missing card ${id}`);
    return card.x;
  }

  it('reserves a full couple step above a grandmother with known parents', () => {
    const tree = ancestorTree('both');
    // The grandmother's parents push the whole paternal couple one couple step
    // further out; the grandfather keeps the usual 254 next to her.
    expect(xOf(tree, 'I5') - xOf(tree, 'I2')).toBe(-COUPLE_DX);
    expect(xOf(tree, 'I4') - xOf(tree, 'I5')).toBe(-COUPLE_DX);
  });

  it('reserves half a couple step for a missing co-parent placeholder', () => {
    // Only the great-grandfather is known, so the missing great-grandmother's
    // half-width placeholder reserves 127 rather than a full 254.
    const half = ancestorTree('father');
    expect(xOf(half, 'I5') - xOf(half, 'I2')).toBe(-COUPLE_DX / 2);
    expect(xOf(half, 'I4') - xOf(half, 'I5')).toBe(-COUPLE_DX);

    // With no known great-grandparents the pair sits over the grandmother's
    // card, so the grandparents keep the plain inner-parent placement.
    const pair = ancestorTree('none');
    expect(xOf(pair, 'I5')).toBe(xOf(pair, 'I2'));
  });
});

describe('layout performance', () => {
  it('lays out the 1000-person fixture in under 100ms', () => {
    const tree = parseGedcom(largeText).tree;
    const root = tree.homePersonId ?? 'I1';
    layoutFamilyView(tree, root, options);

    const started = performance.now();
    const layout = layoutFamilyView(tree, root, options);
    const elapsed = performance.now() - started;

    expect(layout.cards.length).toBeLessThanOrEqual(1000);
    expect(layout.cards.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(100);
  });
});
