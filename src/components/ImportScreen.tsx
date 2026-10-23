import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { parseGedcomBufferInWorker } from '../gedcom/parseInWorker';
import { GedcomError } from '../gedcom/parser';
import type { FamilyTree } from '../model/types';

export interface ImportedDataset {
  fileName: string;
  tree: FamilyTree;
  warnings: string[];
}

interface ImportScreenProps {
  onImport: (dataset: ImportedDataset) => void;
}

export default function ImportScreen({ onImport }: ImportScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Reading your file…');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function handleFile(file: File): Promise<void> {
    setError(null);

    if (!/\.(ged|gedcom)$/i.test(file.name)) {
      setError('Please choose a GEDCOM file (.ged or .gedcom).');
      return;
    }

    setStatus('Reading your file…');
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseGedcomBufferInWorker(buffer, (message) => {
        if (mounted.current) setStatus(message);
      });
      if (!mounted.current) return;
      onImport({ fileName: file.name, tree: result.tree, warnings: result.warnings });
    } catch (caught) {
      if (!mounted.current) return;
      if (caught instanceof GedcomError) {
        setError(caught.message);
      } else {
        const detail = caught instanceof Error ? caught.message : 'Unknown error';
        setError(`Could not read this file: ${detail}`);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function openPicker(): void {
    if (!busy) inputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openPicker();
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    // Allow choosing the same file again after an error.
    event.target.value = '';
  }

  return (
    <div className="import-screen">
      <main className="import-card">
        <p className="import-card__eyebrow">Family tree viewer</p>
        <h1 className="import-card__title">Bring your family history to life</h1>
        <p className="import-card__lede">
          Import a GEDCOM file to explore your family in an interactive tree. Your file is read
          locally and is never uploaded.
        </p>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".ged,.gedcom"
          tabIndex={-1}
          onChange={handleInputChange}
        />

        <div
          className={[
            'dropzone',
            dragActive ? 'dropzone--active' : '',
            busy ? 'dropzone--busy' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="button"
          tabIndex={0}
          aria-busy={busy}
          aria-label="Import a GEDCOM file"
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            const nextTarget = event.relatedTarget;
            if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
              setDragActive(false);
            }
          }}
          onDrop={handleDrop}
        >
          <span className="dropzone__icon" aria-hidden="true">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
              <path d="M14 3v5h5" />
              <path d="M12 12v5" />
              <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
            </svg>
          </span>
          <p className="dropzone__title" role={busy ? 'status' : undefined}>
            {busy ? status : 'Drop your .ged file here'}
          </p>
          <p className="dropzone__hint">
            or <span className="dropzone__link">browse your computer</span>
          </p>
          <p className="dropzone__meta">GEDCOM 5.5 / 5.5.1 · UTF-8, UTF-16 or ANSI</p>
        </div>

        {error !== null && (
          <div className="import-error" role="alert">
            <strong className="import-error__title">This file could not be imported</strong>
            {error}
          </div>
        )}

        <p className="import-card__footer">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="10" width="16" height="11" rx="2" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          Everything stays in this browser tab. Nothing is stored or sent anywhere.
        </p>
      </main>
    </div>
  );
}
