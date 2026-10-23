import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom/parser';
import {
  getChildren,
  getHomePerson,
  getParents,
  getSiblings,
  getSpouses,
  lifeSpanLabel,
  sharesBothParents,
} from '../src/model/helpers';

const sampleText = readFileSync(new URL('./fixtures/sample.ged', import.meta.url), 'utf8');
const sample = parseGedcom(sampleText).tree;

const unsortedChildrenText = [
  '0 HEAD',
  '0 @I1@ INDI',
  '1 NAME Younger /Sort/',
  '1 SEX F',
  '1 BIRT',
  '2 DATE 1980',
  '1 FAMC @F1@',
  '0 @I2@ INDI',
  '1 NAME Older /Sort/',
  '1 SEX M',
  '1 BIRT',
  '2 DATE 12 MAR 1970',
  '1 FAMC @F1@',
  '0 @I3@ INDI',
  '1 NAME Undated /Sort/',
  '1 SEX F',
  '1 FAMC @F1@',
  '0 @I4@ INDI',
  '1 NAME Parent /Sort/',
  '1 SEX M',
  '1 FAMS @F1@',
  '0 @F1@ FAM',
  '1 HUSB @I4@',
  '1 CHIL @I1@',
  '1 CHIL @I2@',
  '1 CHIL @I3@',
  '0 TRLR',
].join('\n');

describe('getParents', () => {
  it('returns both parents through FAMC', () => {
    expect(getParents(sample, 'I13').map((person) => person.id)).toEqual(['I9', 'I12']);
    expect(getParents(sample, 'I1').map((person) => person.id)).toEqual(['I26', 'I27']);
  });

  it('returns an empty array for unknown people and missing families', () => {
    expect(getParents(sample, 'I404')).toEqual([]);
  });
});

describe('getSpouses', () => {
  it('returns spouses with their family ids, including multiple marriages', () => {
    expect(getSpouses(sample, 'I9').map((link) => [link.person.id, link.familyId])).toEqual([
      ['I12', 'F4'],
      ['I16', 'F5'],
    ]);
    expect(getSpouses(sample, 'I13').map((link) => [link.person.id, link.familyId])).toEqual([
      ['I31', 'F10'],
    ]);
  });

  it('returns an empty array for unknown people', () => {
    expect(getSpouses(sample, 'I404')).toEqual([]);
  });

  it('orders multiple spouses by marriage date, then file order', () => {
    const text = [
      '0 HEAD',
      '0 @P@ INDI',
      '1 NAME Pat /Person/',
      '1 SEX M',
      '1 FAMS @LATER@',
      '1 FAMS @EARLIER@',
      '1 FAMS @UNDATED@',
      '0 @A@ INDI',
      '1 NAME Later /Spouse/',
      '1 SEX F',
      '1 FAMS @LATER@',
      '0 @B@ INDI',
      '1 NAME Earlier /Spouse/',
      '1 SEX F',
      '1 FAMS @EARLIER@',
      '0 @C@ INDI',
      '1 NAME Undated /Spouse/',
      '1 SEX F',
      '1 FAMS @UNDATED@',
      '0 @LATER@ FAM',
      '1 HUSB @P@',
      '1 WIFE @A@',
      '1 MARR',
      '2 DATE 1990',
      '0 @EARLIER@ FAM',
      '1 HUSB @P@',
      '1 WIFE @B@',
      '1 MARR',
      '2 DATE 1970',
      '0 @UNDATED@ FAM',
      '1 HUSB @P@',
      '1 WIFE @C@',
      '0 TRLR',
    ].join('\n');
    const tree = parseGedcom(text).tree;
    expect(getSpouses(tree, 'P').map((link) => link.person.id)).toEqual(['B', 'A', 'C']);
  });
});

describe('getChildren', () => {
  it('returns children in file order when birth dates agree', () => {
    expect(getChildren(sample, 'I1').map((person) => person.id)).toEqual([
      'I3',
      'I4',
      'I6',
      'I7',
    ]);
  });

  it('merges children from every marriage', () => {
    expect(getChildren(sample, 'I9').map((person) => person.id)).toEqual([
      'I13',
      'I14',
      'I15',
      'I17',
    ]);
  });

  it('sorts by birth date with undated children last', () => {
    const tree = parseGedcom(unsortedChildrenText).tree;
    expect(getChildren(tree, 'I4').map((person) => person.id)).toEqual(['I2', 'I1', 'I3']);
  });

  it('returns an empty array for unknown people', () => {
    expect(getChildren(sample, 'I404')).toEqual([]);
  });
});

describe('getSiblings', () => {
  it('flags full and half siblings', () => {
    const siblings = getSiblings(sample, 'I13');
    expect(siblings.map((sibling) => [sibling.person.id, sibling.full])).toEqual([
      ['I14', true],
      ['I15', true],
      ['I17', false],
    ]);
  });

  it('finds half siblings through a parent’s other marriages', () => {
    expect(getSiblings(sample, 'I17').map((sibling) => [sibling.person.id, sibling.full])).toEqual([
      ['I13', false],
      ['I14', false],
      ['I15', false],
    ]);
  });

  it('returns full siblings within a single family', () => {
    expect(getSiblings(sample, 'I1').map((sibling) => [sibling.person.id, sibling.full])).toEqual([
      ['I28', true],
    ]);
  });

  it('returns an empty array for unknown people', () => {
    expect(getSiblings(sample, 'I404')).toEqual([]);
  });

  it('treats siblings as full only when the same family lists both parents', () => {
    const text = [
      '0 HEAD',
      '0 @A@ INDI',
      '1 NAME Ann /Kin/',
      '1 SEX F',
      '1 FAMC @BOTH@',
      '1 FAMC @ONE@',
      '0 @B@ INDI',
      '1 NAME Bea /Kin/',
      '1 SEX F',
      '1 FAMC @BOTH@',
      '0 @C@ INDI',
      '1 NAME Cal /Kin/',
      '1 SEX M',
      '1 FAMC @ONE@',
      '0 @D@ INDI',
      '1 NAME Dee /Kin/',
      '1 SEX F',
      '1 FAMC @COPY@',
      '0 @F@ INDI',
      '1 NAME Father /Kin/',
      '1 SEX M',
      '1 FAMS @BOTH@',
      '1 FAMS @ONE@',
      '1 FAMS @COPY@',
      '0 @M@ INDI',
      '1 NAME Mother /Kin/',
      '1 SEX F',
      '1 FAMS @BOTH@',
      '1 FAMS @COPY@',
      '0 @BOTH@ FAM',
      '1 HUSB @F@',
      '1 WIFE @M@',
      '1 CHIL @A@',
      '1 CHIL @B@',
      '0 @ONE@ FAM',
      '1 HUSB @F@',
      '1 CHIL @A@',
      '1 CHIL @C@',
      '0 @COPY@ FAM',
      '1 HUSB @F@',
      '1 WIFE @M@',
      '1 CHIL @D@',
      '0 TRLR',
    ].join('\n');
    const tree = parseGedcom(text).tree;
    expect(sharesBothParents(tree, 'A', 'B')).toBe(true);
    expect(sharesBothParents(tree, 'A', 'C')).toBe(false);
    expect(sharesBothParents(tree, 'A', 'D')).toBe(false);
    expect(getSiblings(tree, 'A').map((sibling) => [sibling.person.id, sibling.full])).toEqual([
      ['B', true],
      ['C', false],
      ['D', false],
    ]);
  });
});

describe('lifeSpanLabel', () => {
  it('formats birth and death years', () => {
    expect(lifeSpanLabel(sample.people.get('I1')!)).toBe('1898 – 1971');
    expect(lifeSpanLabel(sample.people.get('I28')!)).toBe('1902 – 1975');
  });

  it('shows only the birth year for living people', () => {
    expect(lifeSpanLabel(sample.people.get('I9')!)).toBe('1954');
    expect(lifeSpanLabel(sample.people.get('I11')!)).toBe('1961');
  });

  it('shows a leading dash for a known death but unknown birth', () => {
    expect(lifeSpanLabel(sample.people.get('I27')!)).toBe('– 1942');
  });

  it('shows Deceased for a death record with no dates', () => {
    const tree = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Unknown /Dead/', '1 DEAT', '0 TRLR'].join('\n'),
    ).tree;
    expect(lifeSpanLabel(tree.people.get('I1')!)).toBe('Deceased');
  });

  it('is empty for a living person without dates', () => {
    const tree = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Unknown /Living/', '0 TRLR'].join('\n'),
    ).tree;
    const person = tree.people.get('I1')!;
    expect(person.isLiving).toBe(true);
    expect(lifeSpanLabel(person)).toBe('');
  });

  it('treats someone born over 110 years ago as deceased even without a death record', () => {
    const tree = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Old /Person/', '1 BIRT', '2 DATE 1800', '0 TRLR'].join(
        '\n',
      ),
    ).tree;
    const person = tree.people.get('I1')!;
    expect(person.isLiving).toBe(false);
    expect(lifeSpanLabel(person)).toBe('1800');
  });

  it('applies the 110-year boundary', () => {
    const currentYear = new Date().getFullYear();
    const text = (year: number): string =>
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Boundary /Person/', '1 BIRT', `2 DATE ${year}`, '0 TRLR'].join(
        '\n',
      );

    expect(parseGedcom(text(currentYear - 109)).tree.people.get('I1')?.isLiving).toBe(true);
    expect(parseGedcom(text(currentYear - 110)).tree.people.get('I1')?.isLiving).toBe(false);
  });
});

describe('getHomePerson', () => {
  it('returns the home person and falls back to the first person', () => {
    expect(getHomePerson(sample)?.id).toBe('I1');
    expect(getHomePerson({ ...sample, homePersonId: 'I99' })?.id).toBe('I1');
    const emptyTree = parseGedcom('0 HEAD\n0 TRLR\n').tree;
    expect(getHomePerson(emptyTree)).toBeUndefined();
  });
});
