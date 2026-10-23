import type { ReactElement } from 'react';
import { buildFacts } from '../../layout/facts';
import { cardSubtext } from '../../layout/cardText';
import { possessiveRole, relationshipToHome } from '../../layout/relationship';
import { getChildren, getParents, getSiblings, getSpouses } from '../../model/helpers';
import type { FamilyTree, Person } from '../../model/types';
import { Avatar } from './silhouettes';

interface ProfilePanelProps {
  tree: FamilyTree;
  person: Person;
  home: Person;
  open: boolean;
  onClose: () => void;
  onFocusPerson: (personId: string) => void;
  onViewTree: (personId: string) => void;
}

interface FamilyRow {
  person: Person;
  role: string;
}

function immediateFamily(tree: FamilyTree, personId: string): FamilyRow[] {
  const rows: FamilyRow[] = [];
  const seen = new Set<string>();
  const push = (relative: Person): void => {
    if (seen.has(relative.id)) return;
    seen.add(relative.id);
    rows.push({ person: relative, role: possessiveRole(tree, personId, relative.id) });
  };

  for (const parent of getParents(tree, personId)) push(parent);
  for (const sibling of getSiblings(tree, personId)) push(sibling.person);
  for (const spouse of getSpouses(tree, personId)) push(spouse.person);
  for (const child of getChildren(tree, personId)) push(child);

  return rows;
}

export default function ProfilePanel({
  tree,
  person,
  home,
  open,
  onClose,
  onFocusPerson,
  onViewTree,
}: ProfilePanelProps): ReactElement {
  const relationship = relationshipToHome(tree, person.id, home.id);
  const summary = cardSubtext(person);
  const family = immediateFamily(tree, person.id);
  const facts = buildFacts(tree, person.id);
  const notes = person.notes.map((note) => note.trim()).filter((note) => note.length > 0);

  return (
    <aside
      className={open ? 'profile-panel is-open' : 'profile-panel'}
      aria-hidden={!open}
      aria-label="Profile"
      inert={!open}
    >
      <div className="profile-panel__bar">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close profile">
          <Chevron direction="left" />
        </button>
      </div>

      <div className="profile-panel__identity">
        <Avatar person={person} size={72} />
        <div>
          <h2 className="profile-panel__name">{person.displayName}</h2>
          <p className="profile-panel__relation">{relationship}</p>
          {summary && <p className="profile-panel__summary">{summary}</p>}
        </div>
      </div>

      <button type="button" className="profile-panel__view-tree" onClick={() => onViewTree(person.id)}>
        View tree
      </button>

      <div className="profile-panel__body">
        <section>
          <h3 className="profile-section__title">Immediate family</h3>
          {family.length === 0 ? (
            <p className="profile-empty">No immediate family in this file.</p>
          ) : (
            <ul className="family-rows">
              {family.map((row) => (
                <li key={row.person.id}>
                  <button type="button" className="family-row" onClick={() => onFocusPerson(row.person.id)}>
                    <Avatar person={row.person} size={36} />
                    <span className="family-row__text">
                      <span className="family-row__name">{row.person.displayName}</span>
                      <span className="family-row__role">{row.role}</span>
                    </span>
                    <span className="family-row__years">{cardSubtext(row.person)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="profile-section__title">Facts</h3>
          {facts.length === 0 ? (
            <p className="profile-empty">No facts recorded.</p>
          ) : (
            <ol className="facts">
              {facts.map((fact, index) => (
                <li key={`${fact.label}-${fact.detail ?? ''}-${index}`} className="fact">
                  <span className="fact__year">{fact.year}</span>
                  <span className="fact__body">
                    <span className="fact__label">
                      {fact.label}
                      {fact.detail && <span className="fact__detail"> {fact.detail}</span>}
                    </span>
                    {fact.place && <span className="fact__place">{fact.place}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {notes.length > 0 && (
          <section>
            <h3 className="profile-section__title">Notes</h3>
            {notes.map((note) => (
              <p key={note} className="profile-note">
                {note}
              </p>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}

export function Chevron({ direction }: { direction: 'left' | 'right' }): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M10 3.5 5.5 8 10 12.5' : 'M6 3.5 10.5 8 6 12.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
