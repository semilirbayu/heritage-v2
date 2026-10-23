import { GedcomError, parseGedcomBuffer } from './parser';
import type { FamilyTree } from '../model/types';

export interface ParseProgress {
  type: 'progress';
  message: string;
}

export interface ParseDone {
  type: 'done';
  warnings: string[];
  tree: FamilyTree;
}

export interface ParseFailure {
  type: 'error';
  name: string;
  message: string;
  line?: number;
  detail?: string;
}

export type ParseJobEvent = ParseProgress | ParseDone | ParseFailure;

/** Decode and parse a GEDCOM buffer, reporting progress before the work starts. */
export function runParseJob(buffer: ArrayBuffer): ParseJobEvent[] {
  const events: ParseJobEvent[] = [{ type: 'progress', message: 'Reading your file…' }];
  try {
    const result = parseGedcomBuffer(buffer);
    events.push({ type: 'done', warnings: result.warnings, tree: result.tree });
  } catch (caught) {
    if (caught instanceof GedcomError) {
      events.push({
        type: 'error',
        name: 'GedcomError',
        message: caught.message,
        line: caught.line,
        detail: caught.detail,
      });
    } else {
      const message = caught instanceof Error ? caught.message : 'Could not read this file.';
      events.push({ type: 'error', name: 'Error', message });
    }
  }
  return events;
}
