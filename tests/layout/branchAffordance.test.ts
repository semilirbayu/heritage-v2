import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { branchMarkOrigin, branchTargets } from '../../src/layout/branchAffordance';

const gedcom = [
  '0 HEAD',
  '0 @ROOT@ INDI',
  '1 NAME Root /Person/',
  '1 SEX M',
  '1 FAMC @FROOT@',
  '1 FAMS @FCOUPLE@',
  '0 @WIFE@ INDI',
  '1 NAME Wife /Person/',
  '1 SEX F',
  '1 FAMC @FWIFE@',
  '1 FAMS @FCOUPLE@',
  '0 @CHILD@ INDI',
  '1 NAME Child /Person/',
  '1 SEX F',
  '1 FAMC @FCOUPLE@',
  '0 @SIB@ INDI',
  '1 NAME Sib /Person/',
  '1 SEX M',
  '1 FAMC @FROOT@',
  '0 @DAD@ INDI',
  '1 NAME Dad /Person/',
  '1 SEX M',
  '1 FAMS @FROOT@',
  '0 @MOM@ INDI',
  '1 NAME Mom /Person/',
  '1 SEX F',
  '1 FAMS @FROOT@',
  '0 @WDAD@ INDI',
  '1 NAME WifeDad /Person/',
  '1 SEX M',
  '1 FAMS @FWIFE@',
  '0 @LONER@ INDI',
  '1 NAME Loner /Person/',
  '1 SEX U',
  '0 @FROOT@ FAM',
  '1 HUSB @DAD@',
  '1 WIFE @MOM@',
  '1 CHIL @ROOT@',
  '1 CHIL @SIB@',
  '0 @FWIFE@ FAM',
  '1 HUSB @WDAD@',
  '1 CHIL @WIFE@',
  '0 @FCOUPLE@ FAM',
  '1 HUSB @ROOT@',
  '1 WIFE @WIFE@',
  '1 CHIL @CHILD@',
  '0 TRLR',
].join('\n');

const tree = parseGedcom(gedcom).tree;
const everyone = new Set(['ROOT', 'WIFE', 'CHILD', 'SIB', 'DAD', 'MOM', 'WDAD', 'LONER']);

describe('branch affordance', () => {
  it('draws the pill at the card’s top-right anchor', () => {
    expect(branchMarkOrigin(5169, 1218)).toEqual({ x: 5324, y: 1198 });
  });

  it('shows nothing when every immediate relative is already shown', () => {
    expect(branchTargets(tree, everyone)).toEqual([]);
  });

  it('shows one pill when a parent is hidden', () => {
    const shown = new Set(everyone);
    shown.delete('WDAD');
    expect(branchTargets(tree, shown).map((target) => target.personId)).toEqual(['WIFE']);
  });

  it('shows one pill when a sibling is hidden', () => {
    const shown = new Set(everyone);
    shown.delete('SIB');
    expect(branchTargets(tree, shown).map((target) => target.personId)).toEqual(['ROOT', 'DAD', 'MOM']);
  });

  it('shows one pill when a spouse is hidden', () => {
    const shown = new Set(everyone);
    shown.delete('WIFE');
    expect(branchTargets(tree, shown).map((target) => target.personId)).toEqual([
      'ROOT',
      'CHILD',
      'WDAD',
    ]);
  });

  it('shows one pill when a child is hidden', () => {
    const shown = new Set(everyone);
    shown.delete('CHILD');
    expect(branchTargets(tree, shown).map((target) => target.personId)).toEqual(['ROOT', 'WIFE']);
  });

  it('keeps a single pill when several relatives are hidden', () => {
    expect(branchTargets(tree, new Set(['ROOT'])).map((target) => target.personId)).toEqual(['ROOT']);
  });

  it('does not pill the root for a hidden in-law', () => {
    const shown = new Set(['ROOT', 'DAD', 'MOM', 'SIB', 'WIFE', 'CHILD']);
    expect(branchTargets(tree, shown).map((target) => target.personId)).toEqual(['WIFE']);
  });
});
