import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { selectVisible } from '../../src/layout/selectVisible';

const live = parseGedcom(
  readFileSync(new URL('../fixtures/live-reference.ged', import.meta.url), 'utf8'),
).tree;

const halfText = [
  '0 HEAD',
  '1 _HOME @I1@',
  '0 @I1@ INDI',
  '1 NAME Root /Person/',
  '1 SEX M',
  '1 FAMC @F1@',
  '0 @I2@ INDI',
  '1 NAME Father /Person/',
  '1 SEX M',
  '1 FAMS @F1@',
  '1 FAMS @F2@',
  '0 @I3@ INDI',
  '1 NAME Mother /Person/',
  '1 SEX F',
  '1 FAMS @F1@',
  '0 @I4@ INDI',
  '1 NAME Half /Sibling/',
  '1 SEX F',
  '1 FAMC @F2@',
  '0 @I5@ INDI',
  '1 NAME Other /Mother/',
  '1 SEX F',
  '1 FAMS @F2@',
  '0 @F1@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I3@',
  '1 CHIL @I1@',
  '0 @F2@ FAM',
  '1 HUSB @I2@',
  '1 WIFE @I5@',
  '1 CHIL @I4@',
  '0 TRLR',
].join('\n');

describe('selectVisible', () => {
  it('keeps one generation and drops cousins when the toggle is off', () => {
    const visible = selectVisible(live, 'IPUBA', { generations: 1, cousins: false });
    expect(visible.total).toBe(live.people.size);
    for (const id of ['IPUBA', 'IFAMAS', 'IFEFEB', 'IBEFIP', 'IBOP', 'IMABAMEPE', 'ISAFEKU']) {
      expect(visible.ids.has(id), id).toBe(true);
    }
    for (const id of ['IVASOV', 'IMISEKI', 'IPIMOVUS', 'ISOPIFAV', 'IFUVUM']) {
      expect(visible.ids.has(id), id).toBe(false);
    }
    expect(visible.generation.get('IFEFEB')).toBe(1);
    expect(visible.generation.get('IMABAMEPE')).toBe(-1);
  });

  it('hides aunts at one generation because their parents are not visible', () => {
    const visible = selectVisible(live, 'IPUBA', { generations: 1, cousins: true });
    for (const id of ['ISOPIFAV', 'IBOVIBAF', 'IPIKOBEK', 'IVOFEFIV', 'IMOPOFAVA', 'IPIMOVUS', 'IMISEKI']) {
      expect(visible.ids.has(id), id).toBe(false);
    }
    expect(visible.ids.has('IVASOV')).toBe(false);
    expect(visible.ids.has('IMABAMEPE')).toBe(true);
    expect(visible.ids.has('ISAFEKU')).toBe(true);
  });

  it('adds aunts, cousins, and cousins\' children when cousins are on', () => {
    const visible = selectVisible(live, 'IPUBA', { generations: 2, cousins: true });
    for (const id of ['IVASOV', 'IPIVAVIB', 'IVIVEFUKE', 'IMOKEBOK', 'IVOFEFIV', 'IPIMOVUS', 'IVIKUKIM', 'IMISEKI']) {
      expect(visible.ids.has(id), id).toBe(true);
    }
    expect(visible.ids.has('ISEFU')).toBe(false);
    expect(visible.ids.has('IFUVUM')).toBe(false);
    expect(visible.generation.get('IVIKUKIM')).toBe(1);
    expect(visible.generation.get('IPIMOVUS')).toBe(0);
  });

  it('includes the whole reference chain at 5+', () => {
    const visible = selectVisible(live, 'IPUBA', { generations: 'all', cousins: true });
    expect(visible.ids.has('IFUVUM')).toBe(true);
    expect(visible.generation.get('IFUVUM')).toBe(-5);
    expect(visible.shown).toBe(42);
  });

  it('includes half-siblings of the root and hides the other spouse', () => {
    const tree = parseGedcom(halfText).tree;
    const visible = selectVisible(tree, 'I1', { generations: 1, cousins: false });
    expect(visible.ids.has('I4')).toBe(true);
    expect(visible.generation.get('I4')).toBe(0);
    expect(visible.ids.has('I5')).toBe(false);
  });

  it('caps a large tree at 1000 and reports the file total', () => {
    const large = parseGedcom(
      readFileSync(new URL('../fixtures/large-1000.ged', import.meta.url), 'utf8'),
    ).tree;
    const visible = selectVisible(large, large.homePersonId ?? 'I1', {
      generations: 'all',
      cousins: true,
    });
    expect(visible.total).toBe(1000);
    expect(visible.shown).toBeLessThanOrEqual(1000);
    expect(visible.shown).toBeGreaterThan(0);
    expect(visible.ids.has(large.homePersonId ?? 'I1')).toBe(true);
  });
});

describe('pruning rules', () => {
  const text = [
    '0 HEAD',
    '1 _HOME @R@',
    '0 @R@ INDI',
    '1 NAME Root /P/',
    '1 SEX M',
    '1 FAMC @FP@',
    '1 FAMS @FM@',
    '0 @W@ INDI',
    '1 NAME Wife /P/',
    '1 SEX F',
    '1 FAMC @FI@',
    '1 FAMS @FM@',
    '0 @DAD@ INDI',
    '1 NAME Dad /P/',
    '1 SEX M',
    '1 FAMC @FG@',
    '1 FAMS @FP@',
    '1 FAMS @FS@',
    '0 @MOM@ INDI',
    '1 NAME Mom /P/',
    '1 SEX F',
    '1 FAMS @FP@',
    '0 @STEP@ INDI',
    '1 NAME Step /P/',
    '1 SEX F',
    '1 FAMS @FS@',
    '0 @HALF@ INDI',
    '1 NAME Half /P/',
    '1 SEX M',
    '1 FAMC @FS@',
    '0 @SIB@ INDI',
    '1 NAME Sib /P/',
    '1 SEX F',
    '1 FAMC @FP@',
    '1 FAMS @FN@',
    '0 @NIECE@ INDI',
    '1 NAME Niece /P/',
    '1 SEX F',
    '1 FAMC @FN@',
    '0 @GF@ INDI',
    '1 NAME Gf /P/',
    '1 SEX M',
    '1 FAMC @FGG@',
    '1 FAMS @FG@',
    '0 @GM@ INDI',
    '1 NAME Gm /P/',
    '1 SEX F',
    '1 FAMS @FG@',
    '0 @AUNT@ INDI',
    '1 NAME Aunt /P/',
    '1 SEX F',
    '1 FAMC @FG@',
    '1 FAMS @FA@',
    '0 @COUS@ INDI',
    '1 NAME Cousin /P/',
    '1 SEX M',
    '1 FAMC @FA@',
    '1 FAMS @FC@',
    '0 @CCH@ INDI',
    '1 NAME CousinChild /P/',
    '1 SEX F',
    '1 FAMC @FC@',
    '0 @GGF@ INDI',
    '1 NAME Ggf /P/',
    '1 SEX M',
    '1 FAMS @FGG@',
    '1 FAMS @FOTHER@',
    '0 @GGM@ INDI',
    '1 NAME Ggm /P/',
    '1 SEX F',
    '1 FAMS @FGG@',
    '0 @GUNCLE@ INDI',
    '1 NAME GrandUncle /P/',
    '1 SEX M',
    '1 FAMC @FGG@',
    '1 FAMS @FGU@',
    '0 @GLINE@ INDI',
    '1 NAME GrandUncleChild /P/',
    '1 SEX F',
    '1 FAMC @FGU@',
    '0 @OTHER@ INDI',
    '1 NAME OtherWife /P/',
    '1 SEX F',
    '1 FAMS @FOTHER@',
    '0 @INLAW@ INDI',
    '1 NAME Inlaw /P/',
    '1 SEX M',
    '1 FAMS @FI@',
    '0 @FP@ FAM',
    '1 HUSB @DAD@',
    '1 WIFE @MOM@',
    '1 CHIL @R@',
    '1 CHIL @SIB@',
    '0 @FM@ FAM',
    '1 HUSB @R@',
    '1 WIFE @W@',
    '0 @FS@ FAM',
    '1 HUSB @DAD@',
    '1 WIFE @STEP@',
    '1 CHIL @HALF@',
    '0 @FN@ FAM',
    '1 WIFE @SIB@',
    '1 CHIL @NIECE@',
    '0 @FG@ FAM',
    '1 HUSB @GF@',
    '1 WIFE @GM@',
    '1 CHIL @DAD@',
    '1 CHIL @AUNT@',
    '0 @FA@ FAM',
    '1 WIFE @AUNT@',
    '1 CHIL @COUS@',
    '0 @FC@ FAM',
    '1 HUSB @COUS@',
    '1 CHIL @CCH@',
    '0 @FGG@ FAM',
    '1 HUSB @GGF@',
    '1 WIFE @GGM@',
    '1 CHIL @GF@',
    '1 CHIL @GUNCLE@',
    '0 @FGU@ FAM',
    '1 HUSB @GUNCLE@',
    '1 CHIL @GLINE@',
    '0 @FOTHER@ FAM',
    '1 HUSB @GGF@',
    '1 WIFE @OTHER@',
    '0 @FI@ FAM',
    '1 HUSB @INLAW@',
    '1 CHIL @W@',
    '0 TRLR',
  ].join('\n');
  const tree = parseGedcom(text).tree;
  const all = { generations: 'all' as const, cousins: true };

  it('expands parents and grandparents and hides higher collateral and in-laws', () => {
    const visible = selectVisible(tree, 'R', all);
    for (const id of ['R', 'W', 'DAD', 'MOM', 'HALF', 'SIB', 'NIECE', 'GF', 'GM', 'AUNT', 'COUS', 'CCH', 'GGF', 'GGM']) {
      expect(visible.ids.has(id), id).toBe(true);
    }
    for (const id of ['STEP', 'GUNCLE', 'GLINE', 'OTHER', 'INLAW']) {
      expect(visible.ids.has(id), id).toBe(false);
    }
  });

  it('stops collateral at the root’s siblings when cousins are off', () => {
    const visible = selectVisible(tree, 'R', { generations: 'all', cousins: false });
    expect(visible.ids.has('SIB')).toBe(true);
    expect(visible.ids.has('NIECE')).toBe(false);
    expect(visible.ids.has('AUNT')).toBe(false);
    expect(visible.ids.has('COUS')).toBe(false);
    expect(visible.ids.has('GGF')).toBe(true);
    expect(visible.ids.has('GGM')).toBe(true);
    expect(visible.ids.has('GUNCLE')).toBe(false);
  });

  it('keeps the direct line under the cap and drops the farthest descendants', () => {
    const lines = ['0 HEAD', '1 _HOME @R@', '0 @R@ INDI', '1 NAME Root /Cap/', '1 SEX M', '1 FAMS @F@'];
    const children: string[] = [];
    for (let index = 0; index < 1200; index += 1) {
      lines.push(`0 @C${index}@ INDI`, `1 NAME C${index} /Cap/`, `1 SEX M`, `1 FAMC @F@`);
      children.push(`1 CHIL @C${index}@`);
    }
    lines.push('0 @F@ FAM', '1 HUSB @R@', ...children, '0 TRLR');
    const wide = parseGedcom(lines.join('\n')).tree;
    const visible = selectVisible(wide, 'R', all);
    expect(visible.total).toBe(1201);
    expect(visible.shown).toBe(1000);
    expect(visible.ids.has('R')).toBe(true);
    expect(visible.ids.has('C0')).toBe(true);
    expect(visible.ids.has('C1199')).toBe(false);
  });
});
