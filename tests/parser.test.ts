import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GedcomError, parseGedcom, parseGedcomBuffer } from '../src/gedcom/parser';

const sampleText = readFileSync(new URL('./fixtures/sample.ged', import.meta.url), 'utf8');

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function utf8Buffer(text: string): ArrayBuffer {
  return toArrayBuffer(new TextEncoder().encode(text));
}

function utf16leBuffer(text: string): ArrayBuffer {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = (code >> 8) & 0xff;
  }
  return bytes.buffer;
}

function latin1Buffer(text: string): ArrayBuffer {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes.buffer;
}

describe('parseGedcom: sample fixture', () => {
  const result = parseGedcom(sampleText);
  const { tree, warnings } = result;

  it('parses every individual and family', () => {
    expect(tree.people.size).toBe(34);
    expect(tree.families.size).toBe(11);
    expect(tree.homePersonId).toBe('I1');
    expect(tree.sourceName).toBe('Heritage sample tree');
    expect(warnings).toEqual([]);
  });

  it('keeps ids free of @ delimiters', () => {
    expect(tree.people.has('I1')).toBe(true);
    expect(tree.families.has('F1')).toBe(true);
    expect(tree.people.has('@I1@')).toBe(false);
  });

  it('reads names, subtags and sex', () => {
    const arthur = tree.people.get('I1');
    expect(arthur).toBeDefined();
    expect(arthur?.givenName).toBe('Arthur James');
    expect(arthur?.surname).toBe('Hartley');
    expect(arthur?.displayName).toBe('Arthur James Hartley');
    expect(arthur?.sex).toBe('M');

    const margaret = tree.people.get('I2');
    expect(margaret?.displayName).toBe('Margaret Ellen Hartley');
    expect(margaret?.sex).toBe('F');
  });

  it('reads birth and death events with dates and places', () => {
    const arthur = tree.people.get('I1');
    expect(arthur?.birth?.date?.year).toBe(1898);
    expect(arthur?.birth?.date?.month).toBe(3);
    expect(arthur?.birth?.date?.day).toBe(12);
    expect(arthur?.birth?.place).toBe('Leeds, Yorkshire, England');
    expect(arthur?.birth?.raw).toBe('12 MAR 1898');
    expect(arthur?.death?.date?.year).toBe(1971);
    expect(arthur?.death?.place).toBe('Leeds, Yorkshire, England');
    expect(arthur?.birth).toBe(arthur?.events.find((event) => event.type === 'BIRT'));
    expect(arthur?.death).toBe(arthur?.events.find((event) => event.type === 'DEAT'));
  });

  it('collects interesting individual events', () => {
    const arthur = tree.people.get('I1');
    const types = arthur?.events.map((event) => event.type) ?? [];
    expect(types).toContain('BIRT');
    expect(types).toContain('DEAT');
    expect(types).toContain('OCCU');
    expect(types).toContain('RESI');
    expect(arthur?.events.find((event) => event.type === 'OCCU')?.value).toBe('Railway signalman');
  });

  it('merges CONT into notes', () => {
    const arthur = tree.people.get('I1');
    expect(arthur?.notes).toEqual([
      'Arthur worked on the same stretch of line for forty years.\nHe kept a notebook of every engine he signalled.',
    ]);
  });

  it('keeps family links on both sides', () => {
    const arthur = tree.people.get('I1');
    expect(arthur?.famc).toEqual(['F8']);
    expect(arthur?.fams).toEqual(['F1']);

    const david = tree.people.get('I9');
    expect(david?.fams).toEqual(['F4', 'F5']);
    expect(david?.famc).toEqual(['F3']);
  });

  it('keeps children in file order and reads marriage data', () => {
    const family = tree.families.get('F1');
    expect(family?.husband).toBe('I1');
    expect(family?.wife).toBe('I2');
    expect(family?.children).toEqual(['I3', 'I4', 'I6', 'I7']);
    expect(family?.marriage?.date?.year).toBe(1922);
    expect(family?.marriage?.place).toBe('Leeds, Yorkshire, England');
    expect(family?.divorced).toBe(false);
  });

  it('detects divorce', () => {
    const family = tree.families.get('F5');
    expect(family?.divorced).toBe(true);
    expect(family?.children).toEqual(['I17']);
  });

  it('only accepts absolute http(s) photos', () => {
    expect(tree.people.get('I1')?.photoUrl).toBeUndefined();
  });

  it('computes living status', () => {
    expect(tree.people.get('I1')?.isLiving).toBe(false); // DEAT 1971
    expect(tree.people.get('I27')?.isLiving).toBe(false); // DEAT, no birth
    expect(tree.people.get('I9')?.isLiving).toBe(true); // born 1954, no death
    expect(tree.people.get('I34')?.isLiving).toBe(true); // born 2016
    expect(tree.people.get('I26')?.isLiving).toBe(false); // born ABT 1865
  });
});

describe('parseGedcom: tolerated input', () => {
  it('handles CRLF line endings', () => {
    const result = parseGedcom(sampleText.replace(/\n/g, '\r\n'));
    expect(result.tree.people.size).toBe(34);
    expect(result.tree.families.size).toBe(11);
  });

  it('handles a UTF-8 BOM and leading whitespace', () => {
    const text = `\uFEFF  0 HEAD\r\n  1 CHAR UTF-8\r\n0 @I1@ INDI\r\n 1 NAME Jo /Bloggs/\r\n0 TRLR\r\n`;
    const result = parseGedcom(text);
    expect(result.tree.people.size).toBe(1);
    expect(result.tree.people.get('I1')?.displayName).toBe('Jo Bloggs');
  });

  it('handles CONC and CONT', () => {
    const text = [
      '0 HEAD',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Jo /Bloggs/',
      '1 NOTE Hello',
      '2 CONC  world',
      '2 CONT Second line',
      '2 CONC  continues',
      '0 TRLR',
    ].join('\n');
    const result = parseGedcom(text);
    expect(result.tree.people.get('I1')?.notes).toEqual(['Hello world\nSecond line continues']);
  });

  it('keeps multiple NAME records but uses the first as primary', () => {
    const text = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Anna /Primary/',
      '2 GIVN Anna Maria',
      '2 SURN Primary',
      '1 NAME Anna /Secondary/',
      '2 SURN Secondary',
      '2 _MARNM MarriedName',
      '0 TRLR',
    ].join('\n');
    const person = parseGedcom(text).tree.people.get('I1');
    expect(person?.displayName).toBe('Anna Maria Primary');
    expect(person?.givenName).toBe('Anna Maria');
    expect(person?.surname).toBe('Primary');
  });

  it('prefers GIVN/SURN subtags over the slashed value', () => {
    const text = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Jack /SlashName/',
      '2 GIVN John',
      '2 SURN TagName',
      '0 TRLR',
    ].join('\n');
    const person = parseGedcom(text).tree.people.get('I1');
    expect(person?.displayName).toBe('John TagName');
  });

  it('handles missing slashes and suffixes', () => {
    const missingSlashes = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Madonna', '0 TRLR'].join('\n'),
    ).tree.people.get('I1');
    expect(missingSlashes?.displayName).toBe('Madonna');
    expect(missingSlashes?.surname).toBe('');

    const suffix = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME John /Doe/ Jr.', '0 TRLR'].join('\n'),
    ).tree.people.get('I1');
    expect(suffix?.suffix).toBe('Jr.');
    expect(suffix?.displayName).toBe('John Doe Jr.');
  });

  it('defaults missing or unknown sex to U', () => {
    const missing = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Jo /Bloggs/', '0 TRLR'].join('\n'),
    ).tree.people.get('I1');
    expect(missing?.sex).toBe('U');

    const unknown = parseGedcom(
      ['0 HEAD', '0 @I1@ INDI', '1 NAME Jo /Bloggs/', '1 SEX X', '0 TRLR'].join('\n'),
    ).tree.people.get('I1');
    expect(unknown?.sex).toBe('U');
  });

  it('ignores unknown tags without crashing or warning', () => {
    const text = [
      '0 HEAD',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Jo /Bloggs/',
      '1 _CUSTOM something',
      '2 SOUR a source',
      '1 FOO bar',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 _CUSTOM family tag',
      '0 TRLR',
    ].join('\n');
    const result = parseGedcom(text);
    expect(result.warnings).toEqual([]);
    expect(result.tree.people.get('I1')?.displayName).toBe('Jo Bloggs');
    expect(result.tree.families.get('F1')?.husband).toBe('I1');
  });

  it('warns about broken pointers instead of crashing', () => {
    const text = [
      '0 HEAD',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME John /Doe/',
      '1 FAMS @F9@',
      '0 @I2@ INDI',
      '1 NAME Jane /Roe/',
      '1 FAMS @F1@',
      '1 FAMC @F8@',
      '0 @F1@ FAM',
      '1 WIFE @I2@',
      '1 CHIL @I99@',
      '0 TRLR',
    ].join('\n');

    const result = parseGedcom(text);
    expect(result.tree.people.size).toBe(2);
    expect(result.tree.families.get('F1')?.children).toEqual([]);
    expect(result.tree.people.get('I1')?.fams).toEqual([]);
    expect(result.tree.people.get('I2')?.famc).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('missing family @F9@'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('missing family @F8@'))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('missing child @I99@'))).toBe(true);
  });

  it('supports a family with only one recorded parent', () => {
    const text = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Parent /One/',
      '1 FAMS @F1@',
      '0 @I2@ INDI',
      '1 NAME Child /One/',
      '1 FAMC @F1@',
      '0 @F1@ FAM',
      '1 HUSB @I1@',
      '1 CHIL @I2@',
      '0 TRLR',
    ].join('\n');
    const family = parseGedcom(text).tree.families.get('F1');
    expect(family?.husband).toBe('I1');
    expect(family?.wife).toBeUndefined();
    expect(family?.children).toEqual(['I2']);
  });

  it('reads photos from http(s) FILE subtags and OBJE pointers', () => {
    const text = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME Inline /Photo/',
      '1 OBJE',
      '2 FILE https://example.com/inline.jpg',
      '0 @O1@ OBJE',
      '1 FILE https://example.com/linked.jpg',
      '0 @I2@ INDI',
      '1 NAME Linked /Photo/',
      '1 OBJE @O1@',
      '0 TRLR',
    ].join('\n');
    const result = parseGedcom(text);
    expect(result.tree.people.get('I1')?.photoUrl).toBe('https://example.com/inline.jpg');
    expect(result.tree.people.get('I2')?.photoUrl).toBe('https://example.com/linked.jpg');
  });

  it('resolves NOTE record pointers', () => {
    const text = [
      '0 HEAD',
      '0 @N1@ NOTE This is a shared note.',
      '2 CONT It has two lines.',
      '0 @I1@ INDI',
      '1 NAME Jo /Bloggs/',
      '1 NOTE @N1@',
      '1 NOTE @N404@',
      '0 TRLR',
    ].join('\n');
    const result = parseGedcom(text);
    expect(result.tree.people.get('I1')?.notes).toEqual([
      'This is a shared note.\nIt has two lines.',
    ]);
    expect(result.warnings.some((warning) => warning.includes('missing note record'))).toBe(true);
  });

  it('honours HEAD _HOME and falls back when it is broken', () => {
    const base = [
      '0 HEAD',
      '1 _HOME @I2@',
      '0 @I1@ INDI',
      '1 NAME One /Person/',
      '0 @I2@ INDI',
      '1 NAME Two /Person/',
      '0 TRLR',
    ].join('\n');
    expect(parseGedcom(base).tree.homePersonId).toBe('I2');

    const broken = parseGedcom(base.replace('@I2@', '@I9@'));
    expect(broken.tree.homePersonId).toBe('I1');
    expect(broken.warnings.some((warning) => warning.includes('_HOME'))).toBe(true);
  });

  it('falls back to the first INDI when the header has no _HOME', () => {
    const text = ['0 HEAD', '0 @I7@ INDI', '1 NAME Seven /Person/', '0 TRLR'].join('\n');
    expect(parseGedcom(text).tree.homePersonId).toBe('I7');
  });

  it('returns an empty tree with a warning for a header-only file', () => {
    const result = parseGedcom('0 HEAD\n1 CHAR UTF-8\n0 TRLR\n');
    expect(result.tree.people.size).toBe(0);
    expect(result.tree.families.size).toBe(0);
    expect(result.tree.homePersonId).toBeUndefined();
    expect(result.warnings).toContain('No individuals were found in this file.');
  });

  it('warns about duplicate record ids', () => {
    const text = [
      '0 HEAD',
      '0 @I1@ INDI',
      '1 NAME First /Doe/',
      '0 @I1@ INDI',
      '1 NAME Second /Doe/',
      '0 TRLR',
    ].join('\n');
    const result = parseGedcom(text);
    expect(result.tree.people.size).toBe(1);
    expect(result.tree.people.get('I1')?.displayName).toBe('First Doe');
    expect(result.warnings.some((warning) => warning.includes('duplicate individual id'))).toBe(true);
  });

  it('warns about level jumps but still parses', () => {
    const text = [
      '0 HEAD',
      '1 CHAR UTF-8',
      '3 NOTE A note with a skipped level',
      '0 TRLR',
    ].join('\n');
    const result = parseGedcom(text);
    expect(result.warnings.some((warning) => warning.includes('unexpected level 3'))).toBe(true);
  });

  it('throws a GedcomError with a line number for non-GEDCOM input', () => {
    expect(() => parseGedcom('')).toThrow(GedcomError);
    expect(() => parseGedcom('hello world\nthis is not a gedcom file')).toThrow(/Line 1/);

    try {
      parseGedcom('hello world\nthis is not a gedcom file');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(GedcomError);
      expect((error as GedcomError).line).toBe(1);
    }

    expect(() => parseGedcom('{"json": true}')).toThrow(
      /does not look like a GEDCOM file/,
    );
  });
});

describe('parseGedcomBuffer: text encodings', () => {
  const text = [
    '0 HEAD',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME José /García/',
    '1 SEX M',
    '0 TRLR',
  ].join('\n');

  it('decodes UTF-8 with a BOM', () => {
    const bytes = new TextEncoder().encode(text);
    const withBom = new Uint8Array(bytes.length + 3);
    withBom.set([0xef, 0xbb, 0xbf], 0);
    withBom.set(bytes, 3);
    const result = parseGedcomBuffer(toArrayBuffer(withBom));
    expect(result.tree.people.get('I1')?.displayName).toBe('José García');
  });

  it('decodes UTF-16LE with a BOM', () => {
    const result = parseGedcomBuffer(utf16leBuffer(text));
    expect(result.tree.people.get('I1')?.displayName).toBe('José García');
  });

  it('decodes ANSEL/ANSI as windows-1252', () => {
    const ansiText = text.replace('1 CHAR UTF-8', '1 CHAR ANSEL');
    const result = parseGedcomBuffer(latin1Buffer(ansiText));
    expect(result.tree.people.get('I1')?.displayName).toBe('José García');
  });

  it('falls back to windows-1252 for invalid UTF-8 without a CHAR hint', () => {
    const latinText = text.replace('1 CHAR UTF-8\n', '');
    const result = parseGedcomBuffer(latin1Buffer(latinText));
    expect(result.tree.people.get('I1')?.displayName).toBe('José García');
  });

  it('reads plain UTF-8 buffers', () => {
    const result = parseGedcomBuffer(utf8Buffer(text));
    expect(result.tree.people.size).toBe(1);
  });
});

describe('parseGedcom: MyHeritage export quirks', () => {
  const text = [
    '0 HEAD',
    '1 SOUR MYHERITAGE',
    '2 NAME MyHeritage Family Tree Vosemeb',
    '1 FILE Exported by MyHeritage.com from Beka Family Tree in Beka Web Site on Tue, 13 Oct 2026',
    '1 CHAR UTF-8',
    '0 @I1@ INDI',
    '1 NAME Sekisepe / Fitivufub //',
    '2 GIVN Sekisepe / Fitivufub',
    '0 @I2@ INDI',
    '1 NAME  //',
    '0 @I3@ INDI',
    '1 NAME Mepe /Buvumus/',
    '0 TRLR',
  ].join('\n');
  const { tree } = parseGedcom(text);

  it('takes the tree name from HEAD FILE, not the exporting program', () => {
    expect(tree.sourceName).toBe('Beka Family Tree');
  });

  it('keeps a slash inside the given name when the surname is empty', () => {
    expect(tree.people.get('I1')?.displayName).toBe('Sekisepe / Fitivufub');
  });

  it('shows Unknown for an empty slashed name', () => {
    expect(tree.people.get('I2')?.displayName).toBe('Unknown');
  });

  it('still splits a normal surname', () => {
    expect(tree.people.get('I3')?.surname).toBe('Buvumus');
  });
});
