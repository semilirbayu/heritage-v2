import { describe, expect, it } from 'vitest';
import { formatYear, parseGedcomDate, UNKNOWN_DATE_SORT_KEY } from '../src/gedcom/date';

describe('parseGedcomDate', () => {
  it('parses full dates', () => {
    const date = parseGedcomDate('12 MAR 1898');
    expect(date).toMatchObject({
      raw: '12 MAR 1898',
      year: 1898,
      month: 3,
      day: 12,
      sortKey: 18980312,
    });
    expect(date.qualifier).toBeUndefined();
  });

  it('parses month-and-year and year-only dates', () => {
    expect(parseGedcomDate('MAR 1898')).toMatchObject({ year: 1898, month: 3, sortKey: 18980300 });
    expect(parseGedcomDate('1898')).toMatchObject({ year: 1898, sortKey: 18980000 });
    expect(parseGedcomDate('1898').day).toBeUndefined();
  });

  it('parses long and lowercase month names', () => {
    expect(parseGedcomDate('12 March 1898')).toMatchObject({ year: 1898, month: 3, day: 12 });
    expect(parseGedcomDate('3 sep 1954')).toMatchObject({ year: 1954, month: 9, day: 3 });
    expect(parseGedcomDate('1 Sept 2000')).toMatchObject({ year: 2000, month: 9, day: 1 });
  });

  it('parses approximate and boundary qualifiers', () => {
    expect(parseGedcomDate('ABT 1865')).toMatchObject({ year: 1865, qualifier: 'ABT' });
    expect(parseGedcomDate('ABT. 1865')).toMatchObject({ year: 1865, qualifier: 'ABT' });
    expect(parseGedcomDate('CAL 1700')).toMatchObject({ year: 1700, qualifier: 'CAL' });
    expect(parseGedcomDate('EST 1800')).toMatchObject({ year: 1800, qualifier: 'EST' });
    expect(parseGedcomDate('BEF 1900')).toMatchObject({ year: 1900, qualifier: 'BEF' });
    expect(parseGedcomDate('AFT 1900')).toMatchObject({ year: 1900, qualifier: 'AFT' });
    expect(parseGedcomDate('INT 1900 (from the family bible)')).toMatchObject({
      year: 1900,
      qualifier: 'INT',
    });
  });

  it('parses BET..AND ranges', () => {
    const range = parseGedcomDate('BET 1900 AND 1910');
    expect(range).toMatchObject({
      qualifier: 'BET',
      year: 1900,
      endYear: 1910,
      sortKey: 19000000,
    });
    expect(range.endMonth).toBeUndefined();
  });

  it('parses FROM..TO ranges and open-ended ranges', () => {
    expect(parseGedcomDate('FROM 1900 TO 1910')).toMatchObject({
      qualifier: 'FROM',
      year: 1900,
      endYear: 1910,
    });
    expect(parseGedcomDate('FROM 1900')).toMatchObject({ qualifier: 'FROM', year: 1900 });
    expect(parseGedcomDate('FROM 1900').endYear).toBeUndefined();
    expect(parseGedcomDate('TO 1910')).toMatchObject({ qualifier: 'TO', year: 1910 });
  });

  it('parses dual years', () => {
    expect(parseGedcomDate('1700/01')).toMatchObject({ year: 1700, sortKey: 17000000 });
    expect(parseGedcomDate('1 JAN 1700/01')).toMatchObject({ year: 1700, month: 1, day: 1 });
  });

  it('strips calendar escape prefixes', () => {
    expect(parseGedcomDate('@#DJULIAN@ 1 JAN 1700')).toMatchObject({
      year: 1700,
      month: 1,
      day: 1,
    });
  });

  it('parses ISO-style dates that appear in exports', () => {
    expect(parseGedcomDate('1898-03-12')).toMatchObject({ year: 1898, month: 3, day: 12 });
    expect(parseGedcomDate('1898-03')).toMatchObject({ year: 1898, month: 3 });
  });

  it('never throws on empty or nonsense dates', () => {
    for (const raw of ['', '   ', 'unknown', 'not a date', '???', 'BET 1900 AND']) {
      expect(() => parseGedcomDate(raw)).not.toThrow();
    }
    expect(parseGedcomDate('').sortKey).toBe(UNKNOWN_DATE_SORT_KEY);
    expect(parseGedcomDate('not a date').year).toBeUndefined();
    expect(parseGedcomDate('unknown').sortKey).toBe(UNKNOWN_DATE_SORT_KEY);
  });

  it('sorts dates chronologically and undated values last', () => {
    const dated = parseGedcomDate('1900');
    const later = parseGedcomDate('1 JAN 1901');
    const undated = parseGedcomDate('unknown');
    expect(dated.sortKey).toBeLessThan(later.sortKey);
    expect(later.sortKey).toBeLessThan(undated.sortKey);
  });
});

describe('formatYear', () => {
  it('formats single years and ranges', () => {
    expect(formatYear(parseGedcomDate('1950'))).toBe('1950');
    expect(formatYear(parseGedcomDate('BET 1900 AND 1910'))).toBe('1900–1910');
    expect(formatYear(parseGedcomDate('FROM 1900 TO 1900'))).toBe('1900');
    expect(formatYear(undefined)).toBe('');
    expect(formatYear(parseGedcomDate('unknown'))).toBe('');
  });
});
