import { parseGedcomDate } from './date';
import type {
  Family,
  FamilyTree,
  GedEvent,
  ParseResult,
  Person,
  Sex,
} from '../model/types';

/** Thrown only when the input cannot be treated as GEDCOM at all. */
export class GedcomError extends Error {
  /** 1-based line number of the offending input. */
  readonly line: number;
  /** Message without the `Line N:` prefix, so a worker can rebuild the error. */
  readonly detail: string;

  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.name = 'GedcomError';
    this.line = line;
    this.detail = message;
  }
}

interface GedcomLine {
  level: number;
  xref: string | null;
  tag: string;
  value: string;
  lineNumber: number;
}

interface GedcomNode {
  tag: string;
  value: string;
  xref?: string;
  line: number;
  children: GedcomNode[];
}

const LINE_RE = /^(\d{1,3})[ \t]+(?:(@[^@\s]+@)[ \t]+)?(\S+)(?:[ \t]([\s\S]*))?$/;
const TAG_RE = /^[A-Za-z0-9_]+$/;

/**
 * Event tags we surface in `Person.events` / `Family.marriage`. Unknown event
 * tags are still ignored safely; this list covers common GEDCOM 5.5.1 facts.
 */
const EVENT_TAGS = new Set([
  'BIRT',
  'CHR',
  'BAPM',
  'BARM',
  'BASM',
  'BLES',
  'BURI',
  'CENS',
  'CHRA',
  'CONF',
  'CREM',
  'DEAT',
  'EMIG',
  'FCOM',
  'GRAD',
  'IMMI',
  'NATU',
  'OCCU',
  'ORDN',
  'PROB',
  'RESI',
  'RETI',
  'WILL',
  'ADOP',
  'ANUL',
  'DIV',
  'DIVF',
  'MARR',
  'MARB',
  'MARC',
  'MARL',
  'MARS',
  'EVEN',
  'CAST',
  'EDUC',
  'NCHI',
  'RELI',
  'TITL',
  'PROP',
]);

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitLines(text: string): string[] {
  return stripBom(text).replace(/\r\n?/g, '\n').split('\n');
}

function pointerId(value: string): string {
  const trimmed = value.trim();
  const match = /^@([^@]+)@$/.exec(trimmed);
  return (match?.[1] ?? trimmed).trim();
}

function uniquePush(target: string[], value: string): void {
  if (value && !target.includes(value)) target.push(value);
}

function childValue(node: GedcomNode, tag: string): string | undefined {
  const child = node.children.find((candidate) => candidate.tag === tag);
  const value = child?.value.trim();
  return value ? value : undefined;
}

function parseLines(text: string, warnings: string[]): GedcomLine[] {
  const rawLines = splitLines(text);
  const lines: GedcomLine[] = [];

  rawLines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trimStart();
    if (line.trim() === '') return;

    const match = LINE_RE.exec(line);
    if (!match) {
      warnings.push(`Line ${lineNumber}: could not parse this line; it was ignored.`);
      return;
    }

    const levelText = match[1];
    const tagText = match[3];
    if (levelText === undefined || tagText === undefined) {
      warnings.push(`Line ${lineNumber}: could not parse this line; it was ignored.`);
      return;
    }

    const tag = tagText.toUpperCase();
    if (!TAG_RE.test(tag)) {
      warnings.push(`Line ${lineNumber}: unsupported tag "${tagText}"; the line was ignored.`);
      return;
    }

    lines.push({
      level: Number.parseInt(levelText, 10),
      xref: match[2] ?? null,
      tag,
      value: match[4] ?? '',
      lineNumber,
    });
  });

  return lines;
}

function buildForest(lines: GedcomLine[], warnings: string[]): GedcomNode[] {
  const roots: GedcomNode[] = [];
  const stack: Array<GedcomNode | undefined> = [];
  let previousLevel = -1;

  for (const line of lines) {
    const node: GedcomNode = {
      tag: line.tag,
      value: line.value,
      line: line.lineNumber,
      children: [],
    };
    if (line.xref !== null) node.xref = line.xref;

    if (line.level === 0) {
      roots.push(node);
      stack.length = 0;
      stack[0] = node;
      previousLevel = 0;
      continue;
    }

    if (line.level > previousLevel + 1) {
      warnings.push(
        `Line ${line.lineNumber}: unexpected level ${line.level} after level ${previousLevel}; attached to the nearest open record.`,
      );
    }

    let parentIndex = Math.min(line.level - 1, stack.length - 1);
    while (parentIndex >= 0 && stack[parentIndex] === undefined) parentIndex -= 1;

    const parent = parentIndex >= 0 ? stack[parentIndex] : undefined;
    if (!parent) {
      warnings.push(
        `Line ${line.lineNumber}: level ${line.level} record has no parent; treated as a top-level record.`,
      );
      roots.push(node);
    } else {
      parent.children.push(node);
    }

    stack[line.level] = node;
    stack.length = line.level + 1;
    previousLevel = line.level;
  }

  return roots;
}

/** Fold CONC/CONT children into their parent's value. */
function applyContinuations(node: GedcomNode): void {
  if (node.children.length === 0) return;

  const kept: GedcomNode[] = [];
  for (const child of node.children) {
    if (child.tag === 'CONC') {
      node.value += child.value;
    } else if (child.tag === 'CONT') {
      node.value += `\n${child.value}`;
    } else {
      kept.push(child);
    }
  }

  node.children = kept;
  for (const child of kept) applyContinuations(child);
}

function readEvent(node: GedcomNode): GedEvent {
  const dateText = childValue(node, 'DATE') ?? '';
  const placeText = childValue(node, 'PLAC');

  const event: GedEvent = { type: node.tag, raw: dateText };
  if (dateText) event.date = parseGedcomDate(dateText);
  if (placeText) event.place = placeText.replace(/\s*\n\s*/g, ', ');
  const value = node.value.trim();
  if (value && value !== 'Y') event.value = value;
  return event;
}

interface ParsedName {
  givenName: string;
  surname: string;
  suffix?: string;
  displayName: string;
}

function readName(personNode: GedcomNode): ParsedName {
  // GEDCOM allows several NAME records; the first one is the primary name.
  const nameNode = personNode.children.find((child) => child.tag === 'NAME');
  if (!nameNode) {
    return { givenName: '', surname: '', displayName: 'Unknown' };
  }

  const rawValue = nameNode.value.trim();
  // The surname is the last /…/ pair, so a slash inside the given part
  // ("Ana / Budi //") stays in the given name.
  const slash = /^(.*)\/([^/]*)\/([^/]*)$/.exec(rawValue);

  const givenSubtag = childValue(nameNode, 'GIVN');
  const surnameSubtag = childValue(nameNode, 'SURN');

  let givenName = givenSubtag ?? slash?.[1]?.trim() ?? '';
  let surname = surnameSubtag ?? slash?.[2]?.trim() ?? '';
  const suffix = slash?.[3]?.trim() ?? '';

  // A NAME without slashes carries no surname according to GEDCOM. Keep the
  // whole value as the given name rather than inventing a split.
  if (!slash && !givenSubtag && !surnameSubtag) {
    givenName = rawValue;
    surname = '';
  }

  const displayName =
    [givenName, surname, suffix].filter((part) => part.length > 0).join(' ') ||
    (slash ? '' : rawValue) ||
    'Unknown';

  const result: ParsedName = { givenName, surname, displayName };
  if (suffix) result.suffix = suffix;
  return result;
}

function readSex(personNode: GedcomNode): Sex {
  const raw = childValue(personNode, 'SEX')?.toUpperCase();
  if (raw === 'M' || raw === 'MALE') return 'M';
  if (raw === 'F' || raw === 'FEMALE') return 'F';
  return 'U';
}

function readNotes(
  personNode: GedcomNode,
  noteRecords: Map<string, string>,
  warnings: string[],
): string[] {
  const notes: string[] = [];

  for (const child of personNode.children) {
    if (child.tag !== 'NOTE') continue;
    let text = child.value;
    const reference = /^@([^@]+)@$/.exec(text.trim());
    if (reference) {
      const id = reference[1];
      const note = id === undefined ? undefined : noteRecords.get(id);
      if (note === undefined) {
        warnings.push(
          `Line ${child.line}: NOTE pointer ${text.trim()} refers to a missing note record; it was ignored.`,
        );
        continue;
      }
      text = note;
    }
    if (text.trim()) notes.push(text.trim());
  }

  return notes;
}

function findPhotoUrl(
  personNode: GedcomNode,
  objectFiles: Map<string, string>,
  warnings: string[],
): string | undefined {
  for (const objectNode of personNode.children) {
    if (objectNode.tag !== 'OBJE') continue;

    let file = childValue(objectNode, 'FILE');
    if (!file) {
      const reference = /^@([^@]+)@$/.exec(objectNode.value.trim());
      if (reference) {
        const id = reference[1];
        const referenced = id === undefined ? undefined : objectFiles.get(id);
        if (referenced === undefined) {
          warnings.push(
            `Line ${objectNode.line}: OBJE pointer ${objectNode.value.trim()} refers to a missing media record; it was ignored.`,
          );
          continue;
        }
        file = referenced;
      }
    }

    if (file && /^https?:\/\//i.test(file)) return file;
  }

  return undefined;
}

function collectPointers(node: GedcomNode, tag: string): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    if (child.tag === tag) uniquePush(ids, pointerId(child.value));
  }
  return ids;
}

interface FamilyRecord {
  family: Family;
  line: number;
}

interface PersonRecord {
  person: Person;
  line: number;
}

function parseGedcomNodes(roots: GedcomNode[], warnings: string[]): FamilyTree {
  const head = roots.find((node) => node.tag === 'HEAD');

  const noteRecords = new Map<string, string>();
  const objectFiles = new Map<string, string>();

  for (const node of roots) {
    if (!node.xref) continue;
    const id = pointerId(node.xref);
    if (node.tag === 'NOTE') noteRecords.set(id, node.value);
    if (node.tag === 'OBJE') {
      const file = childValue(node, 'FILE');
      if (file) objectFiles.set(id, file);
    }
  }

  const personRecords: PersonRecord[] = [];
  const familyRecords: FamilyRecord[] = [];
  const people = new Map<string, Person>();
  const families = new Map<string, Family>();
  const currentYear = new Date().getFullYear();

  for (const node of roots) {
    if (node.tag !== 'INDI' && node.tag !== 'FAM') continue;

    if (!node.xref) {
      warnings.push(
        `Line ${node.line}: ${node.tag} record has no cross-reference id; it was skipped.`,
      );
      continue;
    }

    const id = pointerId(node.xref);

    if (node.tag === 'FAM') {
      if (families.has(id)) {
        warnings.push(`Line ${node.line}: duplicate family id @${id}@; this record was skipped.`);
        continue;
      }

      const husbandId = collectPointers(node, 'HUSB')[0];
      const wifeId = collectPointers(node, 'WIFE')[0];
      const children = collectPointers(node, 'CHIL');
      const marriageNode = node.children.find((child) => child.tag === 'MARR');

      const family: Family = {
        id,
        children,
        divorced: node.children.some((child) => child.tag === 'DIV' || child.tag === 'DIVF'),
      };
      if (husbandId) family.husband = husbandId;
      if (wifeId) family.wife = wifeId;
      if (marriageNode) family.marriage = readEvent(marriageNode);

      families.set(id, family);
      familyRecords.push({ family, line: node.line });
      continue;
    }

    if (people.has(id)) {
      warnings.push(`Line ${node.line}: duplicate individual id @${id}@; this record was skipped.`);
      continue;
    }

    const name = readName(node);
    const events: GedEvent[] = node.children
      .filter((child) => EVENT_TAGS.has(child.tag))
      .map(readEvent);
    const birth = events.find((event) => event.type === 'BIRT');
    const death = events.find((event) => event.type === 'DEAT');
    const hasDeathIndication = events.some(
      (event) => event.type === 'DEAT' || event.type === 'BURI' || event.type === 'CREM',
    );
    const birthYear = birth?.date?.year;

    const person: Person = {
      id,
      givenName: name.givenName,
      surname: name.surname,
      displayName: name.displayName,
      sex: readSex(node),
      isLiving:
        !hasDeathIndication && (birthYear === undefined || birthYear > currentYear - 110),
      events,
      notes: readNotes(node, noteRecords, warnings),
      famc: collectPointers(node, 'FAMC'),
      fams: collectPointers(node, 'FAMS'),
    };

    if (name.suffix) person.suffix = name.suffix;
    if (birth) person.birth = birth;
    if (death) person.death = death;

    const photoUrl = findPhotoUrl(node, objectFiles, warnings);
    if (photoUrl) person.photoUrl = photoUrl;

    people.set(id, person);
    personRecords.push({ person, line: node.line });
  }

  // Resolve and validate pointers in both directions.
  for (const { family, line } of familyRecords) {
    if (family.husband !== undefined && !people.has(family.husband)) {
      warnings.push(
        `Line ${line}: family @${family.id}@ references missing husband @${family.husband}@; the link was dropped.`,
      );
      delete family.husband;
    }
    if (family.wife !== undefined && !people.has(family.wife)) {
      warnings.push(
        `Line ${line}: family @${family.id}@ references missing wife @${family.wife}@; the link was dropped.`,
      );
      delete family.wife;
    }

    const validChildren: string[] = [];
    for (const childId of family.children) {
      if (people.has(childId)) {
        validChildren.push(childId);
      } else {
        warnings.push(
          `Line ${line}: family @${family.id}@ references missing child @${childId}@; the link was dropped.`,
        );
      }
    }
    family.children = validChildren;
  }

  for (const { person, line } of personRecords) {
    person.famc = person.famc.filter((familyId) => {
      if (families.has(familyId)) return true;
      warnings.push(
        `Line ${line}: @${person.id}@ FAMC pointer refers to missing family @${familyId}@; the link was dropped.`,
      );
      return false;
    });

    person.fams = person.fams.filter((familyId) => {
      if (families.has(familyId)) return true;
      warnings.push(
        `Line ${line}: @${person.id}@ FAMS pointer refers to missing family @${familyId}@; the link was dropped.`,
      );
      return false;
    });
  }

  // Some exporters only record links on one side. Keep both directions usable.
  for (const family of families.values()) {
    const spouses = [family.husband, family.wife];
    for (const spouseId of spouses) {
      if (spouseId === undefined) continue;
      const spouse = people.get(spouseId);
      if (spouse) uniquePush(spouse.fams, family.id);
    }
    for (const childId of family.children) {
      const child = people.get(childId);
      if (child) uniquePush(child.famc, family.id);
    }
  }

  let homePersonId: string | undefined = people.keys().next().value;
  const homeNode = head?.children.find((child) => child.tag === '_HOME' || child.tag === '_ROOT');
  if (homeNode) {
    const candidate = pointerId(homeNode.value);
    if (candidate && people.has(candidate)) {
      homePersonId = candidate;
    } else {
      warnings.push(
        `Line ${homeNode.line}: HEAD _HOME points to missing person ${homeNode.value.trim() || '(empty)'}; using the first individual instead.`,
      );
    }
  }

  // MyHeritage puts the tree name in HEAD FILE ("Exported by MyHeritage.com
  // from Beka Family Tree in Beka Web Site on …"); its SOUR NAME is the
  // exporting program, so FILE wins when it has that shape.
  const sourceNode = head?.children.find((child) => child.tag === 'SOUR');
  const headFile = head?.children.find((child) => child.tag === 'FILE')?.value.trim() ?? '';
  const sourceName =
    /\bfrom (.+?) in .+ on /.exec(headFile)?.[1]?.trim() ||
    sourceNode?.children.find((child) => child.tag === 'NAME')?.value.trim() ||
    head?.children.find((child) => child.tag === 'NAME')?.value.trim() ||
    undefined;

  if (people.size === 0) {
    warnings.push('No individuals were found in this file.');
  }

  const tree: FamilyTree = {
    people,
    families,
    homePersonId,
  };
  if (sourceName) tree.sourceName = sourceName;

  return tree;
}

function parseText(text: string): ParseResult {
  const warnings: string[] = [];

  if (text.trim() === '') {
    throw new GedcomError('the file is empty or contains no GEDCOM records.', 1);
  }

  const lines = parseLines(text, warnings);

  if (lines.length === 0) {
    const firstContentLine =
      splitLines(text).findIndex((line) => line.trim() !== '') + 1 || 1;
    throw new GedcomError('this does not look like a GEDCOM file (no records found).', firstContentLine);
  }

  const roots = buildForest(lines, warnings);
  const hasHeader = roots.some((node) => node.tag === 'HEAD');
  const hasTreeRecords = roots.some((node) => node.tag === 'INDI' || node.tag === 'FAM');

  if (!hasHeader && !hasTreeRecords) {
    throw new GedcomError(
      'this does not look like a GEDCOM file (no HEAD, INDI or FAM records found).',
      roots[0]?.line ?? 1,
    );
  }

  for (const root of roots) applyContinuations(root);

  const tree = parseGedcomNodes(roots, warnings);
  return { tree, warnings };
}

/**
 * Parse GEDCOM text. Throws `GedcomError` only when the input is not GEDCOM at
 * all; recoverable problems are returned in `warnings`.
 */
export function parseGedcom(text: string): ParseResult {
  return parseText(text);
}

function decodeUtf16Be(bytes: Uint8Array): string {
  const evenLength = bytes.length - (bytes.length % 2);
  const swapped = new Uint8Array(evenLength);
  for (let i = 0; i < evenLength; i += 2) {
    const low = bytes[i] ?? 0;
    const high = bytes[i + 1] ?? 0;
    swapped[i] = high;
    swapped[i + 1] = low;
  }
  return new TextDecoder('utf-16le').decode(swapped);
}

function countNulBytes(bytes: Uint8Array, start: number, step: number): number {
  let count = 0;
  for (let i = start; i < bytes.length; i += step) {
    if (bytes[i] === 0) count += 1;
  }
  return count;
}

/**
 * Decode a GEDCOM byte buffer into text.
 *
 * BOMs for UTF-8 and UTF-16 LE/BE are honoured, UTF-16 without a BOM is detected
 * heuristically, and ANSEL/ANSI (and invalid UTF-8) falls back to windows-1252.
 */
export function decodeGedcomBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length === 0) return '';

  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return decodeUtf16Be(bytes.subarray(2));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }

  const sampleLength = Math.min(2048, bytes.length);
  const evenNuls = countNulBytes(bytes.subarray(0, sampleLength), 0, 2);
  const oddNuls = countNulBytes(bytes.subarray(0, sampleLength), 1, 2);
  if (evenNuls + oddNuls > sampleLength / 8) {
    if (oddNuls >= evenNuls) {
      return new TextDecoder('utf-16le').decode(bytes);
    }
    return decodeUtf16Be(bytes);
  }

  // ANSEL is close enough to windows-1252 for the Latin text this app needs.
  const headerSample = new TextDecoder('windows-1252').decode(bytes.subarray(0, sampleLength));
  const charDeclaration = /^[ \t]*1[ \t]+CHAR[ \t]+(\S+)/im.exec(headerSample)?.[1]?.toUpperCase();
  if (
    charDeclaration === 'ANSEL' ||
    charDeclaration === 'ANSI' ||
    charDeclaration === 'ASCII' ||
    charDeclaration === 'WINDOWS-1252' ||
    charDeclaration === 'CP1252'
  ) {
    return new TextDecoder('windows-1252').decode(bytes);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Decode a UTF-8/UTF-16/windows-1252 GEDCOM buffer and parse it. */
export function parseGedcomBuffer(buffer: ArrayBuffer): ParseResult {
  return parseText(decodeGedcomBuffer(buffer));
}
