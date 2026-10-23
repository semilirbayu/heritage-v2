import { useId, type ReactElement } from 'react';
import type { Person, Sex } from '../../model/types';
import { showsChildSilhouette } from '../../layout/cardText';

export type SilhouetteKind = 'man' | 'woman' | 'boy' | 'girl' | 'unknown';

const HAIR = '#b3b3b3';
const HAIR_LINE = '#a9a9a9';
const FACE = '#e6e6e6';
const COLLAR = '#f2f2f2';
const SCALP = '#c5c5c5';

export function silhouetteKind(person: Person): SilhouetteKind {
  const child = showsChildSilhouette(person);
  if (person.sex === 'M') return child ? 'boy' : 'man';
  if (person.sex === 'F') return child ? 'girl' : 'woman';
  return 'unknown';
}

export function genderColor(sex: Sex): string {
  if (sex === 'M') return '#17B4CE';
  if (sex === 'F') return '#FC8181';
  return '#999';
}

/**
 * Original filled busts in a 64×64 box, clipped by the caller's r=32 circle.
 * The figure is a light grey torso; hair is a darker shape; the face is a
 * blank near-white oval. Gradient ids are per instance so many cards can
 * render at once.
 */
export function Silhouette({ kind }: { kind: SilhouetteKind }): ReactElement {
  const bustId = `bust-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fill = `url(#${bustId})`;
  return (
    <g>
      <defs>
        <linearGradient id={bustId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfcfcf" />
          <stop offset="100%" stopColor="#d7d7d7" />
        </linearGradient>
      </defs>
      {kind === 'woman' && <Woman fill={fill} />}
      {kind === 'girl' && <Girl fill={fill} />}
      {kind === 'boy' && <Boy fill={fill} />}
      {kind === 'unknown' && <Unknown fill={fill} />}
      {kind === 'man' && <Man fill={fill} />}
    </g>
  );
}

function AdultTorso({ fill }: { fill: string }): ReactElement {
  return (
    <g>
      <path
        fill={fill}
        d="M-8 80C6 58 8 46 18 40C23 37 26.5 34.5 27.2 31.2C27.8 28.6 29.4 27.4 32 27.4C34.6 27.4 36.2 28.6 36.8 31.2C37.5 34.5 41 37 46 40C56 46 58 58 72 80Z"
      />
      <path fill={COLLAR} d="M28.4 40.6L32 49L35.6 40.6C34.2 42.2 33.1 42.8 32 42.8C30.9 42.8 29.8 42.2 28.4 40.6Z" />
    </g>
  );
}

function ChildTorso({ fill }: { fill: string }): ReactElement {
  return (
    <g>
      <path
        fill={fill}
        d="M18 57.5C17.2 50.4 20.4 45.2 25.2 42.6C27.2 41.4 28.6 39 29 36.8C29.3 35.2 30.4 34.4 32 34.4C33.6 34.4 34.7 35.2 35 36.8C35.4 39 36.8 41.4 38.8 42.6C43.6 45.2 46.8 50.4 46 57.5C45.3 62 39.6 63.6 32 63.6C24.4 63.6 18.7 62 18 57.5Z"
      />
      <path fill={COLLAR} d="M29.4 45.6L32 51.4L34.6 45.6C33.7 47.1 32.9 47.7 32 47.7C31.1 47.7 30.3 47.1 29.4 45.6Z" />
    </g>
  );
}

function Man({ fill }: { fill: string }): ReactElement {
  return (
    <g>
      <AdultTorso fill={fill} />
      <ellipse cx="32" cy="22.6" rx="7.9" ry="9.6" fill={FACE} />
      {/* Short crop: a cap over the crown with a soft hairline, no ring round the face. */}
      <path
        fill={HAIR}
        d="M23.7 22.4C22.7 14.6 26.5 9.8 32 9.8C37.5 9.8 41.3 14.6 40.3 22.4C39.8 19 38.6 17 36.4 16.2C34.2 17.4 29.6 17.6 27.2 16.6C25.4 17.4 24.2 19.4 23.7 22.4Z"
      />
    </g>
  );
}

function Woman({ fill }: { fill: string }): ReactElement {
  return (
    <g>
      <AdultTorso fill={fill} />
      {/* Long hair falls in front of the shoulders and leaves the neck open. */}
      <path
        fill={HAIR}
        d="M21.2 25C20.4 14.8 25.2 8.8 32 8.8C38.8 8.8 43.6 14.8 42.8 25C42.4 34 44.2 41.6 47 48.4C42.6 50.6 38.6 48.6 37.6 43.4L37 33.6L27 33.6L26.4 43.4C25.4 48.6 21.4 50.6 17 48.4C19.8 41.6 21.6 34 21.2 25Z"
      />
      <ellipse cx="32" cy="23.4" rx="7.5" ry="9.4" fill={FACE} />
      <path
        fill={HAIR}
        d="M24.2 22.6C23.8 15.4 27.4 11.4 32 11.4C36.6 11.4 40.2 15.4 39.8 22.6C38.4 18.6 35.6 16.8 33.2 16.6C30.4 17.6 27 19.2 24.2 22.6Z"
      />
    </g>
  );
}

function Boy({ fill }: { fill: string }): ReactElement {
  return (
    <g>
      <ChildTorso fill={fill} />
      <ellipse cx="32" cy="27.8" rx="7" ry="7.6" fill={FACE} />
      {/* Bowl cut with a straight fringe. */}
      <path
        fill={HAIR}
        d="M24.4 28.4C23.4 21 27.2 16.6 32 16.6C36.8 16.6 40.6 21 39.6 28.4C39.2 26 38.4 24.6 37.2 24C35.4 24.6 28.6 24.6 26.8 24C25.6 24.6 24.8 26 24.4 28.4Z"
      />
    </g>
  );
}

function Girl({ fill }: { fill: string }): ReactElement {
  return (
    <g>
      <ChildTorso fill={fill} />
      {/* Two round bunches tied high on each side of the head. */}
      <ellipse cx="21.2" cy="29.6" rx="3.6" ry="4.6" fill={HAIR} />
      <ellipse cx="42.8" cy="29.6" rx="3.6" ry="4.6" fill={HAIR} />
      <circle cx="24.4" cy="26.2" r="1.2" fill={HAIR_LINE} />
      <circle cx="39.6" cy="26.2" r="1.2" fill={HAIR_LINE} />
      <ellipse cx="32" cy="28" rx="6.8" ry="7.4" fill={FACE} />
      <path
        fill={HAIR}
        d="M24.8 28C24 21.2 27.6 17.2 32 17.2C36.4 17.2 40 21.2 39.2 28C38.2 24.4 35.8 23 33.4 22.8C30.8 23.6 27.4 25 24.8 28Z"
      />
    </g>
  );
}

function Unknown({ fill }: { fill: string }): ReactElement {
  return (
    <g>
      <AdultTorso fill={fill} />
      <path
        fill={SCALP}
        d="M23.2 23.6C22.6 16.2 26.2 10.6 32 10.2C37.8 10.6 41.4 16.2 40.8 23.6C40.2 27.8 37.2 30.2 32 30.4C26.8 30.2 23.8 27.8 23.2 23.6Z"
      />
      <ellipse cx="32" cy="22.6" rx="7.8" ry="9.2" fill={FACE} />
    </g>
  );
}

export function Avatar({
  person,
  size,
  title,
}: {
  person: Person;
  size: number;
  title?: string;
}): ReactElement {
  const clipId = `avatar-${person.id}-${size}`.replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title ?? person.displayName}>
      <defs>
        <clipPath id={clipId}>
          <circle cx="32" cy="32" r="32" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="32" fill="#f5f5f5" />
      <g clipPath={`url(#${clipId})`}>
        <Silhouette kind={silhouetteKind(person)} />
      </g>
      <circle cx="32" cy="32" r="31.5" fill="none" stroke="#ccc" />
    </svg>
  );
}
