import { describe, expect, it } from 'vitest';
import { parseGedcom } from '../../src/gedcom/parser';
import { cardFirstBaseline, cardSubtext, showsChildSilhouette } from '../../src/layout/cardText';
import { measureText, wrapName } from '../../src/layout/wrapName';

describe('wrapName', () => {
  it('keeps a short name on one line', () => {
    expect(wrapName('Beka Bub Fekeme')).toEqual(['Beka Bub Fekeme']);
  });

  it('wraps like MyHeritage does', () => {
    expect(wrapName('Sekisepe / Fitivufub')).toEqual(['Sekisepe /', 'Fitivufub']);
    expect(wrapName('Bafa Mimem Bupakokome')).toEqual(['Bafa Mimem', 'Bupakokome']);
    expect(wrapName('Posavubu Vopis Mivef Bako')).toEqual(['Posavubu Vopis', 'Mivef Bako']);
    expect(wrapName('Kusumawardani Rina Lestari Wijaya')).toEqual(['Kusumawardani', 'Rina Lestari', 'Wijaya']);
    expect(wrapName('Nina Ika Setiawanto')).toEqual(['Nina Ika', 'Setiawanto']);
    expect(wrapName('Kesabufukubu Kamemuku')).toEqual(['Kesabufukubu', 'Kamemuku']);
    expect(wrapName('M. Pakasuk Saso Sumiki')).toEqual(['M. Pakasuk Saso', 'Sumiki']);
  });

  it('keeps names that fit on a single line', () => {
    for (const name of ['Lina Sari Utami', 'Desi Wulandari', 'Rina Tia Halimah', 'Fev Fepumapem']) {
      expect(wrapName(name), name).toEqual([name]);
      expect(measureText(name), name).toBeLessThanOrEqual(127);
    }
  });

  it('wraps greedily inside the card width and stops at three lines', () => {
    const lines = wrapName('Kusumawardani Rina Lestari Wijaya');
    expect(lines).toEqual(['Kusumawardani', 'Rina Lestari', 'Wijaya']);
    for (const line of lines) expect(measureText(line.replace(/…$/, ''))).toBeLessThanOrEqual(127);
  });

  it('ellipsizes when the name cannot fit in three lines', () => {
    const lines = wrapName(
      'One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen',
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]?.endsWith('…')).toBe(true);
  });

  it('hard-breaks a single word that is wider than the card', () => {
    const lines = wrapName('Supercalifragilisticexpialidocious');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const line of lines) {
      expect(measureText(line.replace(/…$/, ''))).toBeLessThanOrEqual(127);
    }
  });
});

describe('card text', () => {
  it('prefixes a question mark when only the death year is known', () => {
    const tree = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Late /Person/', '1 DEAT', '2 DATE 1942', '0 TRLR'].join(
        '\n',
      ),
    ).tree;
    expect(cardSubtext(tree.people.get('I1')!)).toBe('? – 1942');
  });

  it('uses a child silhouette only for a living person under 18', () => {
    const text = (year: string, death = false): string =>
      [
        '0 HEAD',
        '0 @I1@ INDI',
        '1 NAME Kid /Person/',
        '1 BIRT',
        `2 DATE ${year}`,
        death ? '1 DEAT Y' : '',
        '0 TRLR',
      ]
        .filter(Boolean)
        .join('\n');
    const year = new Date().getFullYear();
    expect(showsChildSilhouette(parseGedcom(text(String(year - 10))).tree.people.get('I1')!)).toBe(
      true,
    );
    expect(showsChildSilhouette(parseGedcom(text(String(year - 30))).tree.people.get('I1')!)).toBe(
      false,
    );
    expect(
      showsChildSilhouette(parseGedcom(text(String(year - 10), true)).tree.people.get('I1')!),
    ).toBe(false);
  });
});

describe('cardFirstBaseline', () => {
  // Measured on MyHeritage: the text block is centred vertically in the card.
  it('matches the live card text positions', () => {
    expect(cardFirstBaseline(2, true)).toBe(38);
    expect(cardFirstBaseline(1, true)).toBe(46);
    expect(cardFirstBaseline(2, false)).toBe(47.5);
    expect(cardFirstBaseline(1, false)).toBe(55.5);
  });
});
