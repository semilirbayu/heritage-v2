/**
 * GEDCOM date parsing.
 *
 * GEDCOM dates are famously messy. This parser is deliberately forgiving: it never
 * throws, and anything it cannot understand comes back with no year and an unknown
 * sort key. Callers can still show `raw`.
 */

export type DateQualifier =
  | 'ABT'
  | 'CAL'
  | 'EST'
  | 'BEF'
  | 'AFT'
  | 'BET'
  | 'FROM'
  | 'TO'
  | 'INT';

export interface ParsedDate {
  /** Original date text, trimmed. */
  raw: string;
  year?: number;
  /** 1-12 when known. */
  month?: number;
  /** 1-31 when known. */
  day?: number;
  qualifier?: DateQualifier;
  /** End of a BET..AND / FROM..TO range, when present. */
  endYear?: number;
  endMonth?: number;
  endDay?: number;
  /**
   * Sortable value: `year * 10000 + month * 100 + day`, with unknown month/day
   * treated as 0. Undated values sort last via UNKNOWN_DATE_SORT_KEY.
   */
  sortKey: number;
}

/** Sort key used for dates without a usable year. Sorts after every real date. */
export const UNKNOWN_DATE_SORT_KEY = Number.MAX_SAFE_INTEGER;

const MONTHS: Record<string, number> = {
  JAN: 1,
  JANUARY: 1,
  FEB: 2,
  FEBRUARY: 2,
  MAR: 3,
  MARCH: 3,
  APR: 4,
  APRIL: 4,
  MAY: 5,
  JUN: 6,
  JUNE: 6,
  JUL: 7,
  JULY: 7,
  AUG: 8,
  AUGUST: 8,
  SEP: 9,
  SEPT: 9,
  SEPTEMBER: 9,
  OCT: 10,
  OCTOBER: 10,
  NOV: 11,
  NOVEMBER: 11,
  DEC: 12,
  DECEMBER: 12,
};

const QUALIFIER_PREFIXES: ReadonlyArray<[RegExp, DateQualifier]> = [
  [/^ABT\.?\s+/i, 'ABT'],
  [/^ABOUT\.?\s+/i, 'ABT'],
  [/^CIRCA\.?\s+/i, 'ABT'],
  [/^CA\.?\s+/i, 'ABT'],
  [/^CAL\.?\s+/i, 'CAL'],
  [/^CALCULATED\.?\s+/i, 'CAL'],
  [/^EST\.?\s+/i, 'EST'],
  [/^ESTIMATED\.?\s+/i, 'EST'],
  [/^BEF\.?\s+/i, 'BEF'],
  [/^BEFORE\.?\s+/i, 'BEF'],
  [/^AFT\.?\s+/i, 'AFT'],
  [/^AFTER\.?\s+/i, 'AFT'],
  [/^INT\.?\s+/i, 'INT'],
  [/^INTERPRETED\.?\s+/i, 'INT'],
];

const YEAR_RE = /^(\d{1,4})(?:\/(\d{1,2}))?$/;

interface DateParts {
  year?: number;
  month?: number;
  day?: number;
}

function parseYearToken(token: string): number | undefined {
  const match = YEAR_RE.exec(token);
  if (!match) return undefined;
  const yearText = match[1];
  if (yearText === undefined) return undefined;
  const year = Number.parseInt(yearText, 10);
  return Number.isFinite(year) && year > 0 ? year : undefined;
}

function parseCore(input: string): DateParts {
  const text = input
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return {};

  // ISO-ish dates show up in exports that ignore GEDCOM syntax: 1898-03-12.
  const iso = /^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(text);
  if (iso) {
    const year = Number.parseInt(iso[1] ?? '', 10);
    const month = Number.parseInt(iso[2] ?? '', 10);
    const day = iso[3] === undefined ? undefined : Number.parseInt(iso[3], 10);
    return {
      year: Number.isFinite(year) ? year : undefined,
      month: month >= 1 && month <= 12 ? month : undefined,
      day: day !== undefined && day >= 1 && day <= 31 ? day : undefined,
    };
  }

  const tokens = text.split(' ').filter(Boolean);

  const monthIndex = tokens.findIndex((token) => MONTHS[token.toUpperCase()] !== undefined);
  if (monthIndex >= 0) {
    const monthText = tokens[monthIndex];
    const month = monthText === undefined ? undefined : MONTHS[monthText.toUpperCase()];

    let day: number | undefined;
    for (let i = 0; i < monthIndex; i += 1) {
      const token = tokens[i];
      if (token === undefined) continue;
      if (/^\d{1,2}$/.test(token)) {
        const value = Number.parseInt(token, 10);
        if (value >= 1 && value <= 31) day = value;
      }
    }

    let year: number | undefined;
    for (let i = monthIndex + 1; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === undefined) continue;
      const value = parseYearToken(token);
      if (value !== undefined) {
        year = value;
        break;
      }
    }

    return { year, month, day };
  }

  // No month name. Prefer a 4-digit year, otherwise the last numeric token.
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const token = tokens[i];
    if (token === undefined) continue;
    const year = parseYearToken(token);
    if (year !== undefined && token.replace(/\D/g, '').length >= 3) {
      return { year };
    }
  }

  const last = tokens[tokens.length - 1];
  if (last !== undefined) {
    const year = parseYearToken(last);
    if (year !== undefined) {
      return { year };
    }
  }

  return {};
}

function withQualifier(
  raw: string,
  qualifier: DateQualifier | undefined,
  parts: DateParts,
  end?: DateParts,
): ParsedDate {
  const sortKey =
    parts.year === undefined ? UNKNOWN_DATE_SORT_KEY : parts.year * 10000 + (parts.month ?? 0) * 100 + (parts.day ?? 0);

  const result: ParsedDate = { raw, sortKey };
  if (parts.year !== undefined) result.year = parts.year;
  if (parts.month !== undefined) result.month = parts.month;
  if (parts.day !== undefined) result.day = parts.day;
  if (qualifier !== undefined) result.qualifier = qualifier;
  if (end?.year !== undefined) result.endYear = end.year;
  if (end?.month !== undefined) result.endMonth = end.month;
  if (end?.day !== undefined) result.endDay = end.day;
  return result;
}

/**
 * Parse a GEDCOM date value. Handles qualifiers, ranges, month names, year-only
 * and partial dates, dual years (`1700/01`) and calendar escape prefixes.
 * Never throws.
 */
export function parseGedcomDate(raw: string): ParsedDate {
  const trimmed = (raw ?? '').trim();

  try {
    if (!trimmed) {
      return { raw: trimmed, sortKey: UNKNOWN_DATE_SORT_KEY };
    }

    // Calendar escape, e.g. "@#DJULIAN@ 1 JAN 1700".
    const withoutEscape = trimmed.replace(/^@#[^@]*@\s*/, '').trim();

    const between = /^BET(?:WEEN)?\.?\s+(.+?)\s+AND\s+(.+)$/i.exec(withoutEscape);
    if (between) {
      const start = between[1] ?? '';
      const finish = between[2] ?? '';
      return withQualifier(trimmed, 'BET', parseCore(start), parseCore(finish));
    }

    const fromTo = /^FROM\.?\s+(.+?)(?:\s+TO\.?\s+(.+))?$/i.exec(withoutEscape);
    if (fromTo) {
      const start = fromTo[1] ?? '';
      const finish = fromTo[2];
      return withQualifier(
        trimmed,
        'FROM',
        parseCore(start),
        finish === undefined ? undefined : parseCore(finish),
      );
    }

    const to = /^TO\.?\s+(.+)$/i.exec(withoutEscape);
    if (to) {
      return withQualifier(trimmed, 'TO', parseCore(to[1] ?? ''));
    }

    for (const [pattern, qualifier] of QUALIFIER_PREFIXES) {
      if (pattern.test(withoutEscape)) {
        return withQualifier(trimmed, qualifier, parseCore(withoutEscape.replace(pattern, '')));
      }
    }

    return withQualifier(trimmed, undefined, parseCore(withoutEscape));
  } catch {
    // Defensive: malformed input must never break an import.
    return { raw: trimmed, sortKey: UNKNOWN_DATE_SORT_KEY };
  }
}

/** `1898`, or `1900–1910` for a range with two different years. Empty when undated. */
export function formatYear(date: ParsedDate | undefined | null): string {
  if (!date || date.year === undefined) return '';
  if (date.endYear !== undefined && date.endYear !== date.year) {
    return `${date.year}–${date.endYear}`;
  }
  return String(date.year);
}
