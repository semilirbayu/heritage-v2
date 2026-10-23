import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../src/gedcom/parser';
import { layoutFamilyView } from '../src/layout/layoutFamilyView';
import { selectVisible } from '../src/layout/selectVisible';
import { getSiblings } from '../src/model/helpers';

const largeText = readFileSync(new URL('./fixtures/large-1000.ged', import.meta.url), 'utf8');

describe('large fixture', () => {
  it('parses 1000 people in under 200ms', () => {
    // Warm up once so the measurement is not dominated by module/JIT startup.
    const warmup = parseGedcom(largeText);
    expect(warmup.tree.people.size).toBe(1000);
    expect(warmup.tree.families.size).toBeGreaterThan(200);
    expect(warmup.tree.homePersonId).toBe('I1');
    expect(warmup.warnings).toEqual([]);

    const startedAt = performance.now();
    const result = parseGedcom(largeText);
    const elapsed = performance.now() - startedAt;

    expect(result.tree.people.size).toBe(1000);
    expect(elapsed).toBeLessThan(200);
  });

  it('contains multiple marriages and half-sibling opportunities', () => {
    const { tree } = parseGedcom(largeText);
    const remarried = [...tree.people.values()].filter((person) => person.fams.length > 1);
    expect(remarried.length).toBeGreaterThan(10);

    const divorcedFamilies = [...tree.families.values()].filter((family) => family.divorced);
    expect(divorcedFamilies.length).toBeGreaterThan(0);

    const hasHalfSibling = [...tree.people.values()].some((person) =>
      getSiblings(tree, person.id).some((sibling) => !sibling.full),
    );
    expect(hasHalfSibling).toBe(true);
  });
});

function star(count: number): string {
  const lines = [
    '0 HEAD',
    '1 _HOME @R@',
    '0 @R@ INDI',
    '1 NAME Root /Star/',
    '1 SEX M',
    '1 FAMS @FAM@',
    '0 @W@ INDI',
    '1 NAME Wife /Star/',
    '1 SEX F',
    '1 FAMS @FAM@',
    '0 @FAM@ FAM',
    '1 HUSB @R@',
    '1 WIFE @W@',
    ...Array.from({ length: count }, (_, index) => `1 CHIL @C${index}@`),
  ];
  for (let index = 0; index < count; index += 1) {
    lines.push(`0 @C${index}@ INDI`, `1 NAME C${index} /Star/`, `1 SEX M`, `1 FAMC @FAM@`);
  }
  lines.push('0 TRLR');
  return lines.join('\n');
}

describe('selectVisible performance', () => {
  it('selects and lays out an 8000-child star in under 50ms', () => {
    const tree = parseGedcom(star(8000)).tree;
    const options = { generations: 'all' as const, cousins: true };
    selectVisible(tree, 'R', options);

    const started = performance.now();
    const visible = selectVisible(tree, 'R', options);
    const layout = layoutFamilyView(tree, 'R', options);
    const elapsed = performance.now() - started;

    expect(visible.shown).toBe(1000);
    expect(layout.cards.length).toBe(1000);
    expect(elapsed).toBeLessThan(50);
  });
});
