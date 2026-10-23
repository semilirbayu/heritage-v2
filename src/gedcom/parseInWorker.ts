import GedcomWorker from './gedcom.worker?worker';
import { GedcomError } from './parser';
import type { ParseResult } from '../model/types';
import type { ParseJobEvent } from './workerJob';

/**
 * Parse a GEDCOM buffer off the main thread.
 * `onProgress` receives "Reading your file…" before the tree is returned.
 */
export function parseGedcomBufferInWorker(
  buffer: ArrayBuffer,
  onProgress?: (message: string) => void,
): Promise<ParseResult> {
  return new Promise((resolve, reject) => {
    const worker = new GedcomWorker();
    let settled = false;

    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      worker.terminate();
      callback();
    };

    worker.onmessage = (event: MessageEvent<ParseJobEvent>) => {
      const message = event.data;
      if (message.type === 'progress') {
        onProgress?.(message.message);
        return;
      }
      if (message.type === 'done') {
        finish(() => resolve({ tree: message.tree, warnings: message.warnings }));
        return;
      }
      if (message.name === 'GedcomError' && message.detail !== undefined && message.line !== undefined) {
        finish(() => reject(new GedcomError(message.detail ?? message.message, message.line ?? 1)));
        return;
      }
      finish(() => reject(new Error(message.message)));
    };

    worker.onerror = (event: ErrorEvent) => {
      finish(() => reject(new Error(event.message || 'Could not read this file.')));
    };

    worker.postMessage({ buffer });
  });
}
