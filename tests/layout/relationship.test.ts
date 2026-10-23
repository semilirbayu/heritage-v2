import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { possessiveRole, relationshipToHome } from '../../src/layout/relationship';

const live = parseGedcom(
  readFileSync(new URL('../fixtures/live-reference.ged', import.meta.url), 'utf8'),
).tree;

function rel(id: string): string {
  return relationshipToHome(live, id, 'IPUBA');
}

describe('relationshipToHome', () => {
  it('names the immediate family of the home person', () => {
    expect(rel('IPUBA')).toBe('Home person');
    expect(rel('IMABAMEPE')).toBe('Father');
    expect(rel('ISAFEKU')).toBe('Mother');
    expect(rel('IBEFIP')).toBe('Brother');
    expect(rel('IBOP')).toBe('Sister');
    expect(rel('IFAMAS')).toBe('Wife');
    expect(rel('IFEFEB')).toBe('Daughter');
  });

  it('names grandparents, aunts, uncles, and cousins', () => {
    expect(rel('IVASOV')).toBe('Grandfather');
    expect(rel('IPIVAVIB')).toBe('Grandmother');
    expect(rel('IVIVEFUKE')).toBe('Grandfather');
    expect(rel('IMOKEBOK')).toBe('Grandmother');
    expect(rel('IVOFEFIV')).toBe('Aunt');
    expect(rel('IMISEKI')).toBe('Uncle');
    expect(rel('IMOPOFAVA')).toBe('Aunt');
    // Married-in partner of an aunt, labelled by his own sex.
    expect(rel('ISAMUKUVU')).toBe('Uncle');
    expect(rel('IFOF')).toBe('Aunt');
    expect(rel('IPIMOVUS')).toBe('Cousin');
    expect(rel('IMOB')).toBe('Cousin');
    expect(rel('IMOKOF')).toBe('Cousin');
  });

  it('shortens deep ancestors and still names a great-grandfather', () => {
    expect(rel('ISEFU')).toBe('Great-grandfather');
    expect(rel('IVIPUFU')).toBe('Great-grandmother');
    expect(rel('IFUVUM')).toBe('Ancestor');
  });

  it('uses a possessive role from the profile person', () => {
    expect(possessiveRole(live, 'IPUBA', 'IMABAMEPE')).toBe('His father');
    expect(possessiveRole(live, 'ISAFEKU', 'IFEFEB')).toBe('Her granddaughter');
    expect(possessiveRole(live, 'IPIMOVUS', 'IVIKUKIM')).toBe('Her son');
  });

  it('flags half-siblings and ex-spouses', () => {
    const text = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Root /Person/',
      '1 SEX M',
      '1 FAMC @F1@',
      '1 FAMS @F3@',
      '0 @I2@ INDI',
      '1 NAME Dad /Person/',
      '1 SEX M',
      '1 FAMS @F1@',
      '1 FAMS @F2@',
      '0 @I3@ INDI',
      '1 NAME Mum /Person/',
      '1 SEX F',
      '1 FAMS @F1@',
      '0 @I4@ INDI',
      '1 NAME Half /Sister/',
      '1 SEX F',
      '1 FAMC @F2@',
      '0 @I5@ INDI',
      '1 NAME Step /Mum/',
      '1 SEX F',
      '1 FAMS @F2@',
      '0 @I6@ INDI',
      '1 NAME Ex /Wife/',
      '1 SEX F',
      '1 FAMS @F3@',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 WIFE @I3@',
      '1 CHIL @I1@',
      '0 @F2@ FAM',
      '1 HUSB @I2@',
      '1 WIFE @I5@',
      '1 CHIL @I4@',
      '0 @F3@ FAM',
      '1 HUSB @I1@',
      '1 WIFE @I6@',
      '1 DIV Y',
      '0 TRLR',
    ].join('\n');
    const tree = parseGedcom(text).tree;
    expect(relationshipToHome(tree, 'I4', 'I1')).toBe('Half-sister');
    expect(relationshipToHome(tree, 'I6', 'I1')).toBe('Ex-wife');
    expect(possessiveRole(tree, 'I1', 'I4')).toBe('His half-sister');
  });
});
