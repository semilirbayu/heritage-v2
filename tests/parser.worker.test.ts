import { describe, expect, it } from 'vitest';
import { runParseJob } from '../src/gedcom/workerJob';

function bufferFrom(text: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(text);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe('GEDCOM worker job', () => {
  it('reports progress and returns the tree', () => {
    const events = runParseJob(bufferFrom('0 HEAD\n0 @I1@ INDI\n1 NAME Ada /Lovelace/\n0 TRLR\n'));
    expect(events[0]).toEqual({ type: 'progress', message: 'Reading your file…' });
    expect(events[1]).toMatchObject({ type: 'done' });
    if (events[1]?.type !== 'done') throw new Error('expected a parsed tree');
    expect(events[1].tree.people.get('I1')?.displayName).toContain('Ada');
  });

  it('returns an error event for a file that is not GEDCOM', () => {
    const events = runParseJob(bufferFrom(''));
    expect(events[0]).toMatchObject({ type: 'progress', message: 'Reading your file…' });
    expect(events[1]).toMatchObject({
      type: 'error',
      name: 'GedcomError',
    });
    if (events[1]?.type !== 'error') throw new Error('expected an error');
    expect(events[1].message).toMatch(/empty/i);
    expect(events[1].detail).toBeTruthy();
  });
});
