import { memo, type KeyboardEvent, type ReactElement } from 'react';
import { cardFirstBaseline, cardSubtext } from '../../layout/cardText';
import { wrapName } from '../../layout/wrapName';
import type { Person } from '../../model/types';
import { genderColor, silhouetteKind, Silhouette } from './silhouettes';

interface PersonCardProps {
  person: Person;
  x: number;
  y: number;
  selected: boolean;
  /** Instance key, `personId#2` for a pedigree-collapse ghost. */
  instanceId?: string;
  /** Shown on a ghost card as `×N`. */
  copyCount?: number;
  ghost?: boolean;
  onSelect: (personId: string) => void;
}

function PersonCard({
  person,
  x,
  y,
  selected,
  instanceId,
  copyCount,
  ghost = false,
  onSelect,
}: PersonCardProps): ReactElement {
  const color = genderColor(person.sex);
  const lines = wrapName(person.displayName);
  const subtext = cardSubtext(person);
  const clipId = `card-avatar-${instanceId ?? person.id}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const firstBaseline = cardFirstBaseline(lines.length, Boolean(subtext));
  const lastBaseline = firstBaseline + Math.max(0, lines.length - 1) * 16;

  function onKeyDown(event: KeyboardEvent<SVGGElement>): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(person.id);
  }

  return (
    <g
      className={selected ? 'person-card is-selected' : 'person-card'}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={person.displayName}
      onClick={() => onSelect(person.id)}
      onKeyDown={onKeyDown}
    >
      <rect
        className="person-card__shape"
        width="220"
        height="102"
        rx="8"
        fill="#fff"
        stroke={color}
        strokeWidth={selected ? 3 : 2}
        filter={selected ? 'url(#card-select-shadow)' : undefined}
      />

      {/* userSpaceOnUse resolves in the clipped group's translated space, so centre at (32,32). */}
      <clipPath id={clipId}>
        <circle cx="32" cy="32" r="32" />
      </clipPath>
      <circle cx="42" cy="48" r="32" fill="#f5f5f5" />
      <g transform="translate(10 16)" clipPath={`url(#${clipId})`}>
        <Silhouette kind={silhouetteKind(person)} />
      </g>
      <circle cx="42" cy="48" r="31.5" fill="none" stroke="#ccc" />

      <text className="person-card__name" x="82" y={firstBaseline}>
        {lines.map((line, index) => (
          <tspan key={`${line}-${index}`} x="82" dy={index === 0 ? 0 : 16}>
            {line}
          </tspan>
        ))}
      </text>
      {subtext && (
        <text className="person-card__sub" x="82" y={lastBaseline + 19}>
          {subtext}
        </text>
      )}
      {ghost && copyCount !== undefined && copyCount > 1 && (
        <g className="person-card__ghost" transform="translate(186 8)">
          <rect width="28" height="16" rx="8" fill="#f76458" />
          <text className="person-card__badge" x="14" y="12" textAnchor="middle">
            {`×${copyCount}`}
          </text>
        </g>
      )}
    </g>
  );
}

export default memo(PersonCard);
