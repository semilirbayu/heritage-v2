import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { CARD_H, CARD_W, ROW_DY } from '../../src/layout/constants';
import { layoutFamilyView } from '../../src/layout/layoutFamilyView';
import { selectVisible } from '../../src/layout/selectVisible';
import { primaryLayoutCard, shownPersonCount, type LayoutCard } from '../../src/layout/types';
import type { FamilyTree } from '../../src/model/types';
import type { FamilyLayout } from '../../src/layout/layoutFamilyView';

const live = parseGedcom(
  readFileSync(new URL('../fixtures/live-reference.ged', import.meta.url), 'utf8'),
).tree;

const all = { generations: 'all' as const, cousins: true };

function gedcom(lines: string[]): FamilyTree {
  return parseGedcom(lines.join('\n')).tree;
}

function overlaps(cards: LayoutCard[]): [string, string] | null {
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i];
      const b = cards[j];
      if (!a || !b) continue;
      const separated =
        a.x + CARD_W <= b.x || b.x + CARD_W <= a.x || a.y + CARD_H <= b.y || b.y + CARD_H <= a.y;
      if (!separated) return [a.instanceId ?? a.personId, b.instanceId ?? b.personId];
    }
  }
  return null;
}

/** Every shown person can walk to the root along a family that has a connector. */
function unlinked(tree: FamilyTree, layout: FamilyLayout, rootId: string): string[] {
  const shown = new Set(layout.cards.map((card) => card.personId));
  const adjacent = new Map<string, Set<string>>();
  const link = (a: string | undefined, b: string | undefined): void => {
    if (!a || !b || a === b || !shown.has(a) || !shown.has(b)) return;
    const left = adjacent.get(a) ?? new Set<string>();
    const right = adjacent.get(b) ?? new Set<string>();
    left.add(b);
    right.add(a);
    adjacent.set(a, left);
    adjacent.set(b, right);
  };

  for (const connector of layout.connectors) {
    const familyId = connector.familyId.split('#')[0] ?? connector.familyId;
    const family = tree.families.get(familyId);
    if (!family) continue;
    const members = [family.husband, family.wife, ...family.children].filter(
      (id): id is string => id !== undefined && shown.has(id),
    );
    for (const member of members) {
      for (const other of members) link(member, other);
    }
  }

  const reached = new Set<string>([rootId]);
  const queue = [rootId];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head];
    head += 1;
    if (id === undefined) continue;
    for (const next of adjacent.get(id) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  return [...shown].filter((id) => !reached.has(id));
}

describe('floating collateral branches', () => {
  it('omits the father\'s siblings at one generation and keeps every card linked', () => {
    const visible = selectVisible(live, 'IPUBA', { generations: 1, cousins: true });
    for (const id of ['ISOPIFAV', 'IBOVIBAF', 'IPIKOBEK', 'IVOFEFIV', 'IMOPOFAVA']) {
      expect(visible.ids.has(id), id).toBe(false);
    }

    const layout = layoutFamilyView(live, 'IPUBA', { generations: 1, cousins: true });
    const shown = new Set(layout.cards.map((card) => card.personId));
    expect(shown.has('ISOPIFAV')).toBe(false);
    expect(shown.has('IVOFEFIV')).toBe(false);
    expect(unlinked(live, layout, 'IPUBA')).toEqual([]);
    expect(shownPersonCount(layout.cards)).toBe(shown.size);
    for (const card of layout.cards) {
      if (!card.side) continue;
      if (card.side === 'paternal') expect(card.x).toBeLessThanOrEqual(0);
      if (card.side === 'maternal') expect(card.x).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('blood generations and cross-generation marriage', () => {
  const tree = gedcom([
    '0 HEAD',
    '1 _HOME @ROOT@',
    '0 @GF@ INDI',
    '1 NAME Gf /A/',
    '1 SEX M',
    '1 FAMS @FGP@',
    '0 @GM@ INDI',
    '1 NAME Gm /A/',
    '1 SEX F',
    '1 FAMS @FGP@',
    '0 @FGP@ FAM',
    '1 HUSB @GF@',
    '1 WIFE @GM@',
    '1 CHIL @FATH@',
    '1 CHIL @UNC@',
    '0 @FATH@ INDI',
    '1 NAME Bufa /A/',
    '1 SEX M',
    '1 FAMC @FGP@',
    '1 FAMS @FR@',
    '0 @MOTH@ INDI',
    '1 NAME Moth /A/',
    '1 SEX F',
    '1 FAMS @FR@',
    '0 @FR@ FAM',
    '1 HUSB @FATH@',
    '1 WIFE @MOTH@',
    '1 CHIL @ROOT@',
    '1 CHIL @SIS@',
    '0 @ROOT@ INDI',
    '1 NAME Root /A/',
    '1 SEX M',
    '1 FAMC @FR@',
    '1 FAMS @FN0@',
    '0 @SIS@ INDI',
    '1 NAME Sis /A/',
    '1 SEX F',
    '1 FAMC @FR@',
    '0 @UNC@ INDI',
    '1 NAME Unc /A/',
    '1 SEX M',
    '1 FAMC @FGP@',
    '1 FAMS @FN@',
    '0 @NIECE@ INDI',
    '1 NAME Niece /A/',
    '1 SEX F',
    '1 FAMC @FN0@',
    '1 FAMS @FN@',
    '0 @FN0@ FAM',
    '1 HUSB @ROOT@',
    '1 WIFE @RW@',
    '1 CHIL @NIECE@',
    '0 @RW@ INDI',
    '1 NAME Rw /A/',
    '1 SEX F',
    '1 FAMS @FN0@',
    '0 @FN@ FAM',
    '1 HUSB @UNC@',
    '1 WIFE @NIECE@',
    '1 CHIL @BABY@',
    '0 @BABY@ INDI',
    '1 NAME Baby /A/',
    '1 SEX M',
    '1 FAMC @FN@',
    '0 TRLR',
  ]);

  it('keeps the uncle on his blood row and still drops a line to the child', () => {
    const visible = selectVisible(tree, 'ROOT', all);
    expect(visible.generation.get('UNC')).toBe(-1);
    expect(visible.generation.get('NIECE')).toBe(1);
    expect(visible.generation.get('BABY')).toBe(2);

    const layout = layoutFamilyView(tree, 'ROOT', all);
    const at = (id: string): LayoutCard => {
      const card = layout.cards.find((item) => item.personId === id && item.instanceId === id);
      if (!card) throw new Error(`missing ${id}`);
      return card;
    };
    expect(at('UNC').y).toBe(-ROW_DY);
    expect(at('NIECE').y).toBe(ROW_DY);
    expect(at('BABY').y).toBe(2 * ROW_DY);
    expect(overlaps(layout.cards)).toBeNull();

    const marriage = layout.connectors.find((connector) => connector.familyId === 'FN');
    const baby = at('BABY');
    expect(marriage?.d).toContain(`${baby.x + CARD_W / 2} ${baby.y}`);
    expect(unlinked(tree, layout, 'ROOT')).toEqual([]);
  });
});

describe('ancestor with two spouses', () => {
  const tree = gedcom([
    '0 HEAD',
    '1 _HOME @R@',
    '0 @F@ INDI',
    '1 NAME F /A/',
    '1 SEX M',
    '1 FAMS @F1@',
    '1 FAMS @F2@',
    '0 @M1@ INDI',
    '1 NAME M1 /A/',
    '1 SEX F',
    '1 FAMS @F1@',
    '0 @M2@ INDI',
    '1 NAME M2 /A/',
    '1 SEX F',
    '1 FAMS @F2@',
    '0 @R@ INDI',
    '1 NAME R /A/',
    '1 SEX M',
    '1 FAMC @F1@',
    '0 @H@ INDI',
    '1 NAME H /A/',
    '1 SEX M',
    '1 FAMC @F2@',
    '0 @F1@ FAM',
    '1 HUSB @F@',
    '1 WIFE @M1@',
    '1 CHIL @R@',
    '0 @F2@ FAM',
    '1 HUSB @F@',
    '1 WIFE @M2@',
    '1 CHIL @H@',
    '0 TRLR',
  ]);

  it('hides the ancestor’s other spouse and still lays out the half-sibling', () => {
    const layout = layoutFamilyView(tree, 'R', all);
    const at = (id: string): LayoutCard => {
      const card = layout.cards.find((item) => item.personId === id);
      if (!card) throw new Error(`missing ${id}`);
      return card;
    };

    // M2 is the father’s other wife, not the co-parent of the direct line.
    expect(layout.cards.some((card) => card.personId === 'M2')).toBe(false);
    expect(at('H').y).toBe(at('R').y);
    expect(at('H').x).not.toBe(at('R').x);
    expect(overlaps(layout.cards)).toBeNull();
    expect(unlinked(tree, layout, 'R')).toEqual([]);
  });
});

describe('pedigree collapse', () => {
  const tree = gedcom([
    '0 HEAD',
    '1 _HOME @I1@',
    '0 @GF1@ INDI',
    '1 NAME Gf1 /A/',
    '1 SEX M',
    '1 FAMS @F0@',
    '0 @GM1@ INDI',
    '1 NAME Gm1 /A/',
    '1 SEX F',
    '1 FAMS @F0@',
    '0 @F0@ FAM',
    '1 HUSB @GF1@',
    '1 WIFE @GM1@',
    '1 CHIL @FATH@',
    '1 CHIL @MOTH@',
    '0 @FATH@ INDI',
    '1 NAME Bufa /A/',
    '1 SEX M',
    '1 FAMC @F0@',
    '1 FAMS @F1@',
    '0 @MOTH@ INDI',
    '1 NAME Moth /A/',
    '1 SEX F',
    '1 FAMC @F0@',
    '1 FAMS @F1@',
    '0 @F1@ FAM',
    '1 HUSB @FATH@',
    '1 WIFE @MOTH@',
    '1 CHIL @I1@',
    '0 @I1@ INDI',
    '1 NAME Root /A/',
    '1 SEX M',
    '1 FAMC @F1@',
    '0 TRLR',
  ]);

  it('draws a second ghost copy of the shared ancestors', () => {
    const layout = layoutFamilyView(tree, 'I1', all);
    const ghosts = layout.cards.filter((card) => card.instanceId?.endsWith('#2'));
    expect(ghosts.map((card) => card.personId).sort()).toEqual(['GF1', 'GM1']);
    for (const ghost of ghosts) expect(ghost.copyCount).toBe(2);

    const moth = layout.cards.find((card) => card.personId === 'MOTH');
    const ghostFather = layout.cards.find((card) => card.instanceId === 'GF1#2');
    const ghostMother = layout.cards.find((card) => card.instanceId === 'GM1#2');
    expect(moth).toBeDefined();
    expect(ghostFather).toBeDefined();
    expect(ghostMother).toBeDefined();
    expect(ghostFather?.y).toBe((moth?.y ?? 0) - ROW_DY);
    expect(ghostMother?.y).toBe((moth?.y ?? 0) - ROW_DY);
    expect((ghostFather?.x ?? 0) + (ghostMother?.x ?? 0)).toBeGreaterThan((moth?.x ?? 0) * 2 - CARD_W);

    expect(primaryLayoutCard(layout.cards, 'GF1#2')?.instanceId).toBe('GF1');
    expect(shownPersonCount(layout.cards)).toBe(new Set(layout.cards.map((card) => card.personId)).size);
    expect(overlaps(layout.cards)).toBeNull();
    expect(unlinked(tree, layout, 'I1')).toEqual([]);
  });
});

describe('cousin floor', () => {
  it('expands only the parents and grandparents, through all of their descendants', () => {
    const lines = ['0 HEAD', '1 _HOME @R@', '0 @R@ INDI', '1 NAME Root /Deep/', '1 SEX M', '1 FAMC @F0@'];
    let child = 'R';
    for (let generation = 0; generation < 12; generation += 1) {
      const parent = `P${generation}`;
      const sibling = `S${generation}`;
      const family = `FP${generation}`;
      lines.push(
        `0 @${parent}@ INDI`,
        `1 NAME P${generation} /Deep/`,
        `1 SEX M`,
        `1 FAMS @${family}@`,
        ...(generation < 11 ? [`1 FAMC @FP${generation + 1}@`] : []),
        `0 @${sibling}@ INDI`,
        `1 NAME S${generation} /Deep/`,
        `1 SEX F`,
        `1 FAMC @${family}@`,
        `1 FAMS @FS${generation}@`,
        `0 @${family}@ FAM`,
        `1 HUSB @${parent}@`,
        `1 CHIL @${child}@`,
        `1 CHIL @${sibling}@`,
      );
      let previous = sibling;
      for (let down = 1; down <= 4; down += 1) {
        const descendant = `D${generation}_${down}`;
        const descentFamily = `FD${generation}_${down}`;
        lines.push(
          `0 @${descendant}@ INDI`,
          `1 NAME D${generation} ${down} /Deep/`,
          `1 SEX M`,
          `1 FAMC @${descentFamily}@`,
          `0 @${descentFamily}@ FAM`,
          `1 WIFE @${previous}@`,
          `1 CHIL @${descendant}@`,
        );
        previous = descendant;
      }
      child = parent;
    }
    lines.push('0 TRLR');
    const tree = gedcom(lines);
    const visible = selectVisible(tree, 'R', all);

    // Parents and grandparents expand through every descendant. Higher ancestors do not.
    expect(visible.ids.has('S1')).toBe(true);
    expect(visible.ids.has('D1_1')).toBe(true);
    expect(visible.ids.has('D1_4')).toBe(true);
    expect(visible.ids.has('S2')).toBe(false);
    expect(visible.ids.has('D2_1')).toBe(false);
    expect(visible.ids.has('S4')).toBe(false);
    expect(visible.ids.has('D4_2')).toBe(false);

    expect(visible.ids.has('P0')).toBe(true);
    expect(visible.ids.has('P11')).toBe(true);
    expect(visible.shown).toBeLessThanOrEqual(1000);
  });

  it('hides siblings of great-grandparents and above', () => {
    const lines = ['0 HEAD', '1 _HOME @R@', '0 @R@ INDI', '1 NAME Root /Wide/', '1 SEX M', '1 FAMC @F0@'];
    let child = 'R';
    for (let generation = 0; generation < 15; generation += 1) {
      const parent = `P${generation}`;
      const family = `F${generation}`;
      const children = [`1 CHIL @${child}@`];
      lines.push(
        `0 @${parent}@ INDI`,
        `1 NAME P${generation} /Wide/`,
        `1 SEX M`,
        `1 FAMS @${family}@`,
        ...(generation < 14 ? [`1 FAMC @F${generation + 1}@`] : []),
      );
      for (let sibling = 0; sibling < 12; sibling += 1) {
        const id = `S${generation}_${sibling}`;
        lines.push(`0 @${id}@ INDI`, `1 NAME S${generation} ${sibling} /Wide/`, `1 SEX F`, `1 FAMC @${family}@`);
        children.push(`1 CHIL @${id}@`);
      }
      lines.push(`0 @${family}@ FAM`, `1 HUSB @${parent}@`, ...children);
      child = parent;
    }
    lines.push('0 TRLR');
    const tree = gedcom(lines);
    const visible = selectVisible(tree, 'R', all);
    expect(visible.ids.has('R')).toBe(true);
    expect(visible.ids.has('P0')).toBe(true);
    expect(visible.ids.has('P1')).toBe(true);
    expect(visible.ids.has('P14')).toBe(true);
    expect(visible.ids.has('S0_0')).toBe(true);
    expect(visible.ids.has('S1_0')).toBe(true);
    expect(visible.ids.has('S2_0')).toBe(false);
    expect(visible.ids.has('S14_0')).toBe(false);
    expect(visible.shown).toBe(40);
  });
});

describe('connectors for a partner with two marriages', () => {
  // A wife with two husbands, the outer marriage childless: MyHeritage splits
  // the bars (adjacent at +55, outer at +47) and runs the outer one behind the
  // middle card as two stubs with ticks, not a bar looping under the row.
  const ged = [
    '0 HEAD',
    '1 _HOME @W@',
    '0 @W@ INDI', '1 NAME Wren /Doe/', '1 SEX F', '1 FAMS @F1@', '1 FAMS @F2@',
    '0 @H1@ INDI', '1 NAME Hal /One/', '1 SEX M', '1 FAMS @F1@',
    '0 @H2@ INDI', '1 NAME Hugo /Two/', '1 SEX M', '1 FAMS @F2@',
    '0 @K@ INDI', '1 NAME Kit /One/', '1 SEX M', '1 FAMC @F1@',
    '0 @F1@ FAM', '1 HUSB @H1@', '1 WIFE @W@', '1 CHIL @K@', '1 MARR', '2 DATE 2000',
    '0 @F2@ FAM', '1 HUSB @H2@', '1 WIFE @W@', '1 MARR', '2 DATE 2010',
    '0 TRLR',
  ].join('\n');
  const tree = parseGedcom(ged).tree;
  const layout = layoutFamilyView(tree, 'W', { generations: 'all', cousins: true });
  const card = (id: string) => layout.cards.find((c) => c.personId === id)!;
  const path = (id: string) => layout.connectors.find((c) => c.familyId === id)?.d ?? '';

  it('lifts the adjacent bar and drops the outer one', () => {
    const w = card('W');
    expect(path('F1')).toContain(`${w.y + 55}`);
    expect(path('F2')).toContain(`${w.y + 47}`);
  });

  it('draws the outer marriage behind the middle card with ticks', () => {
    const middle = card('H1');
    const d = path('F2');
    expect(d).toContain(`M ${middle.x - 3} ${card('W').y + 44}`);
    expect(d).toContain(`M ${middle.x + 220 + 3} ${card('W').y + 44}`);
    expect(d).not.toContain(`${card('W').y + 102 + 14}`);
  });

  it('hangs the outer marriage’s children from the outer spouse', () => {
    // Same shape as MyHeritage's real export: the outer marriage has children.
    const withKids = parseGedcom(
      ged
        .replace('1 WIFE @W@\n1 MARR\n2 DATE 2010', '1 WIFE @W@\n1 CHIL @J@\n1 MARR\n2 DATE 2010')
        .replace('0 TRLR', ['0 @J@ INDI', '1 NAME Jo /Two/', '1 SEX F', '1 FAMC @F2@', '0 TRLR'].join('\n')),
    ).tree;
    const out = layoutFamilyView(withKids, 'W', { generations: 'all', cousins: true });
    const at = (id: string) => out.cards.find((c) => c.personId === id)!;
    const d = out.connectors.find((c) => c.familyId === 'F2')?.d ?? '';
    const middle = at('H1');
    const outer = at('H2');
    expect(d).toContain(`M ${middle.x - 3} ${at('W').y + 44}`);
    expect(d).toContain(`M ${outer.x + 110} ${outer.y + 102}`);
    expect(d).not.toContain(`${at('W').y + 102 + 14}`);
  });
});
