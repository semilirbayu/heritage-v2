import type { ParsedDate } from '../gedcom/date';

export type Sex = 'M' | 'F' | 'U';

export interface GedEvent {
  /** GEDCOM event tag, e.g. BIRT, CHR, DEAT, BURI, OCCU. */
  type: string;
  /**
   * Raw date text from the event's DATE subtag ('' when the event has no date).
   * The structured form is in `date`.
   */
  raw: string;
  date?: ParsedDate;
  place?: string;
  /** Direct value on the event tag, e.g. the occupation in `1 OCCU Architect`. */
  value?: string;
}

export interface Person {
  /** Xref without the @ delimiters, e.g. `I1`. */
  id: string;
  givenName: string;
  surname: string;
  suffix?: string;
  displayName: string;
  sex: Sex;
  birth?: GedEvent;
  death?: GedEvent;
  /**
   * No death/burial event and either no known birth year or a birth year less
   * than 110 years ago.
   */
  isLiving: boolean;
  /** Individual events (BIRT, CHR, DEAT, BURI, OCCU, RESI, ...), in file order. */
  events: GedEvent[];
  notes: string[];
  /** Families in which this person is a child. */
  famc: string[];
  /** Families in which this person is a spouse. */
  fams: string[];
  /** Absolute http(s) image URL from an OBJE/FILE subtag, when present. */
  photoUrl?: string;
}

export interface Family {
  /** Xref without the @ delimiters, e.g. `F1`. */
  id: string;
  husband?: string;
  wife?: string;
  /** Child person ids in file order. */
  children: string[];
  marriage?: GedEvent;
  divorced: boolean;
}

export interface FamilyTree {
  people: Map<string, Person>;
  families: Map<string, Family>;
  /** HEAD `_HOME` when valid, otherwise the first INDI record. */
  homePersonId: string | undefined;
  /** Tree/source name from HEAD (SOUR NAME or NAME), when present. */
  sourceName?: string;
}

export interface ParseResult {
  tree: FamilyTree;
  warnings: string[];
}
