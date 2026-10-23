import { getChildren, getSpouses } from '../model/helpers';
import type { FamilyTree, GedEvent } from '../model/types';

export interface FactEntry {
  year: string;
  label: string;
  detail?: string;
  place?: string;
}

const EVENT_LABELS: Record<string, string> = {
  CHR: 'Christening',
  BAPM: 'Baptism',
  BARM: 'Bar mitzvah',
  BASM: 'Bas mitzvah',
  BLES: 'Blessing',
  CENS: 'Census',
  CHRA: 'Adult christening',
  CONF: 'Confirmation',
  CREM: 'Cremation',
  EDUC: 'Education',
  EMIG: 'Emigration',
  EVEN: 'Event',
  FCOM: 'First communion',
  GRAD: 'Graduation',
  IMMI: 'Immigration',
  NATU: 'Naturalization',
  OCCU: 'Occupation',
  ORDN: 'Ordination',
  PROB: 'Probate',
  RELI: 'Religion',
  RESI: 'Residence',
  RETI: 'Retirement',
  TITL: 'Title',
  WILL: 'Will',
  ADOP: 'Adoption',
};

interface Draft extends FactEntry {
  sort: number;
}

function yearOf(event: GedEvent | undefined): number | undefined {
  return event?.date?.year;
}

function add(
  drafts: Draft[],
  year: number | undefined,
  kind: number,
  label: string,
  detail?: string,
  place?: string,
): void {
  const undatedBirth = year === undefined && kind === 0;
  const undatedEnding = year === undefined && kind >= 8;
  const sort = year === undefined
    ? undatedBirth
      ? -1
      : undatedEnding
        ? 1_000_000 + kind
        : 900_000 + kind
    : year * 10 + kind;

  const entry: Draft = { sort, year: year === undefined ? '' : String(year), label };
  if (detail) entry.detail = detail;
  if (place) entry.place = place;
  drafts.push(entry);
}

/** Timeline rows for the profile panel, earliest year first. */
export function buildFacts(tree: FamilyTree, personId: string): FactEntry[] {
  const person = tree.people.get(personId);
  if (!person) return [];

  const drafts: Draft[] = [];
  const birth = person.birth ?? person.events.find((event) => event.type === 'BIRT');
  if (birth) add(drafts, yearOf(birth), 0, 'Birth', undefined, birth.place);

  for (const event of person.events) {
    if (event.type === 'BIRT' || event.type === 'DEAT' || event.type === 'BURI') continue;
    const label = EVENT_LABELS[event.type] ?? event.type;
    const detail = event.value?.trim() || undefined;
    if (!detail && !event.place && !event.date) continue;
    add(drafts, yearOf(event), 4, label, detail, event.place);
  }

  for (const spouse of getSpouses(tree, personId)) {
    const family = tree.families.get(spouse.familyId);
    add(drafts, yearOf(family?.marriage), 2, 'Marriage to:', spouse.person.displayName, family?.marriage?.place);
    if (family?.divorced) add(drafts, undefined, 5, 'Divorce from:', spouse.person.displayName);
  }

  for (const child of getChildren(tree, personId)) {
    const noun = child.sex === 'M' ? 'son' : child.sex === 'F' ? 'daughter' : 'child';
    add(drafts, yearOf(child.birth), 3, `Birth of ${noun}:`, child.displayName, child.birth?.place);
  }

  const death = person.death ?? person.events.find((event) => event.type === 'DEAT');
  if (death || !person.isLiving) add(drafts, yearOf(death), 8, 'Death', undefined, death?.place);

  const burial = person.events.find((event) => event.type === 'BURI');
  if (burial) add(drafts, yearOf(burial), 9, 'Burial', undefined, burial.place);

  drafts.sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
  return drafts.map(({ year, label, detail, place }) => {
    const entry: FactEntry = { year, label };
    if (detail) entry.detail = detail;
    if (place) entry.place = place;
    return entry;
  });
}
