/**
 * Generate a deterministic, plausible multi-generation GEDCOM fixture.
 *
 *   bun scripts/gen-large-gedcom.ts 1000 > tests/fixtures/large-1000.ged
 */

interface SimpleDate {
  year: number;
  month: number;
  day: number;
}

interface PersonRec {
  id: string;
  given: string;
  surname: string;
  sex: 'M' | 'F';
  birth: SimpleDate;
  death?: SimpleDate;
  famc: string[];
  fams: string[];
}

interface FamilyRec {
  id: string;
  husband?: PersonRec;
  wife?: PersonRec;
  children: PersonRec[];
  marriage: SimpleDate;
  divorce?: SimpleDate;
}

const TARGET = Math.max(2, Number.parseInt(process.argv[2] ?? '1000', 10) || 1000);
const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const PLACES = [
  'Leeds, Yorkshire, England',
  'York, England',
  'Bradford, Yorkshire, England',
  'Manchester, Lancashire, England',
  'Sheffield, Yorkshire, England',
  'Hull, Yorkshire, England',
  'Edinburgh, Scotland',
  'Cardiff, Wales',
  'Dublin, Ireland',
  'Boston, Massachusetts, USA',
  'Chicago, Illinois, USA',
  'Hamilton, Ontario, Canada',
  'Sydney, New South Wales, Australia',
  'Auckland, New Zealand',
  'Cape Town, South Africa',
];

const MALE_NAMES = [
  'Arthur', 'Thomas', 'William', 'George', 'Samuel', 'David', 'Peter', 'Michael', 'Daniel',
  'James', 'Robert', 'John', 'Edward', 'Charles', 'Henry', 'Albert', 'Frederick', 'Joseph',
  'Benjamin', 'Oliver', 'Jack', 'Harry', 'Stephen', 'Andrew', 'Paul', 'Mark', 'Simon', 'Adam',
];

const FEMALE_NAMES = [
  'Margaret', 'Eleanor', 'Rose', 'Joan', 'Susan', 'Anne', 'Claire', 'Emily', 'Karen', 'Maria',
  'Sophie', 'Janet', 'Eliza', 'Harriet', 'Maya', 'Priya', 'Alice', 'Charlotte', 'Elizabeth',
  'Hannah', 'Grace', 'Lucy', 'Emma', 'Sarah', 'Laura', 'Rachel', 'Rebecca', 'Victoria',
];

const SURNAMES = [
  'Hartley', 'Whitfield', 'Whitaker', 'Okafor', 'Chen', 'Bennett', 'Fletcher', 'Graham',
  'Hargreaves', 'Kendall', 'Marsh', 'Naylor', 'Pearson', 'Riley', 'Sutcliffe', 'Turner',
  'Walker', 'Wright', 'Atkinson', 'Barker', 'Dawson', 'Ellis', 'Foster', 'Gibson',
];

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(0x5eed1234);

function rand(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  const item = items[rand(0, items.length - 1)];
  if (item === undefined) throw new Error('Cannot pick from an empty list.');
  return item;
}

function randomDate(year: number): SimpleDate {
  return { year, month: rand(1, 12), day: rand(1, 28) };
}

function maybeDeath(birthYear: number): SimpleDate | undefined {
  const age = CURRENT_YEAR - birthYear;
  if (age < 55) return undefined;
  if (age > 105) {
    return randomDate(Math.min(birthYear + rand(60, 95), CURRENT_YEAR - 1));
  }
  if (rng() < 0.45) {
    return randomDate(Math.min(birthYear + rand(50, 90), CURRENT_YEAR - 1));
  }
  return undefined;
}

const people: PersonRec[] = [];
const families: FamilyRec[] = [];
let nextPerson = 1;
let nextFamily = 1;

function addPerson(sex: 'M' | 'F', surname: string, birth: SimpleDate): PersonRec {
  const person: PersonRec = {
    id: `I${nextPerson}`,
    given: pick(sex === 'M' ? MALE_NAMES : FEMALE_NAMES),
    surname,
    sex,
    birth,
    famc: [],
    fams: [],
  };
  nextPerson += 1;

  const death = maybeDeath(birth.year);
  if (death) person.death = death;

  people.push(person);
  return person;
}

function addFamily(husband: PersonRec, wife: PersonRec, marriage: SimpleDate): FamilyRec {
  const family: FamilyRec = {
    id: `F${nextFamily}`,
    husband,
    wife,
    children: [],
    marriage,
  };
  nextFamily += 1;

  husband.fams.push(family.id);
  wife.fams.push(family.id);
  families.push(family);
  return family;
}

function addChild(family: FamilyRec, sex: 'M' | 'F', birth: SimpleDate): PersonRec {
  const surname = family.husband?.surname ?? family.wife?.surname ?? pick(SURNAMES);
  const child = addPerson(sex, surname, birth);
  family.children.push(child);
  child.famc.push(family.id);
  return child;
}

function makeCouple(birthYear: number): FamilyRec {
  const surname = pick(SURNAMES);
  const husband = addPerson('M', surname, randomDate(birthYear + rand(-2, 2)));
  const wife = addPerson('F', pick(SURNAMES), randomDate(birthYear + rand(-2, 2)));
  const marriageYear = Math.max(husband.birth.year, wife.birth.year) + rand(21, 28);
  return addFamily(husband, wife, randomDate(Math.min(marriageYear, CURRENT_YEAR)));
}

function makeSpouse(sex: 'M' | 'F', birthYear: number, surname: string): PersonRec {
  return addPerson(sex, surname, randomDate(birthYear));
}

let frontier: FamilyRec[] = [];
const startingCouples = Math.min(4, Math.max(1, Math.floor(TARGET / 8)));
for (let i = 0; i < startingCouples; i += 1) {
  frontier.push(makeCouple(1780 + i * 6));
}

for (let generation = 0; generation < 8 && people.length < TARGET; generation += 1) {
  const nextFrontier: FamilyRec[] = [];

  for (const family of frontier) {
    if (people.length >= TARGET) break;

    const childCount = rand(3, 6);
    let birthYear = family.marriage.year + rand(1, 3);

    for (let index = 0; index < childCount; index += 1) {
      if (people.length >= TARGET) break;
      if (birthYear >= CURRENT_YEAR) break;

      const sex: 'M' | 'F' = rng() < 0.5 ? 'M' : 'F';
      addChild(family, sex, randomDate(birthYear));
      birthYear += rand(2, 4);
    }

    // Marry some of this generation's children so the tree keeps branching.
    for (const child of family.children) {
      if (people.length >= TARGET) break;
      if (child.fams.length > 0) continue;
      if (CURRENT_YEAR - child.birth.year < 20) continue;
      if (rng() > 0.64) continue;

      const spouseBirthYear = Math.min(
        CURRENT_YEAR - 19,
        Math.max(1700, child.birth.year + rand(-3, 3)),
      );
      const marriageYear = Math.max(child.birth.year, spouseBirthYear) + rand(21, 28);
      if (marriageYear >= CURRENT_YEAR) continue;
      if (people.length + 1 > TARGET) break;

      const spouseSurname = child.sex === 'M' ? child.surname : pick(SURNAMES);
      const spouse = makeSpouse(child.sex === 'M' ? 'F' : 'M', spouseBirthYear, spouseSurname);
      const newFamily =
        child.sex === 'M'
          ? addFamily(child, spouse, randomDate(marriageYear))
          : addFamily(spouse, child, randomDate(marriageYear));
      nextFrontier.push(newFamily);

      // A second marriage for some people: gives the tree half-siblings and
      // multiple-marriage layout cases.
      if (rng() < 0.2 && people.length + 2 <= TARGET) {
        const remarriageYear = marriageYear + rand(12, 20);
        if (remarriageYear < CURRENT_YEAR) {
          newFamily.divorce = randomDate(marriageYear + rand(4, 9));
          const newSpouseSurname = child.sex === 'M' ? child.surname : pick(SURNAMES);
          const newSpouse = makeSpouse(
            child.sex === 'M' ? 'F' : 'M',
            Math.min(CURRENT_YEAR - 19, child.birth.year + rand(-2, 2)),
            newSpouseSurname,
          );
          const secondFamily =
            child.sex === 'M'
              ? addFamily(child, newSpouse, randomDate(remarriageYear))
              : addFamily(newSpouse, child, randomDate(remarriageYear));
          nextFrontier.push(secondFamily);
        }
      }
    }
  }

  frontier = nextFrontier;
  if (frontier.length === 0) break;
}

// Safety net for very large targets where the generation cap was reached.
while (people.length < TARGET) {
  const birthYear = Math.min(CURRENT_YEAR - 18, Math.max(1700, CURRENT_YEAR - rand(18, 90)));
  addPerson(rng() < 0.5 ? 'M' : 'F', pick(SURNAMES), randomDate(birthYear));
}

function placeFor(index: number): string {
  return PLACES[(index * 7 + 3) % PLACES.length] ?? 'Unknown place';
}

function formatDate(date: SimpleDate): string {
  const month = MONTHS[date.month - 1] ?? 'JAN';
  if (date.day % 7 === 0) return String(date.year);
  if (date.day % 5 === 0) return `${month} ${date.year}`;
  return `${date.day} ${month} ${date.year}`;
}

const lines: string[] = [];
lines.push('0 HEAD');
lines.push('1 SOUR HeritageGen');
lines.push('2 VERS 1.0');
lines.push(`2 NAME Generated family tree (${people.length} people)`);
lines.push('1 GEDC');
lines.push('2 VERS 5.5.1');
lines.push('2 FORM LINEAGE-LINKED');
lines.push('1 CHAR UTF-8');
lines.push(`1 DATE 1 JAN ${CURRENT_YEAR}`);
lines.push('1 SUBM @U1@');
lines.push(`1 _HOME @${people[0]?.id ?? 'I1'}@`);
lines.push('0 @U1@ SUBM');
lines.push('1 NAME Heritage Generator');

people.forEach((person, index) => {
  lines.push(`0 @${person.id}@ INDI`);
  lines.push(`1 NAME ${person.given} /${person.surname}/`);
  lines.push(`2 GIVN ${person.given}`);
  lines.push(`2 SURN ${person.surname}`);
  lines.push(`1 SEX ${person.sex}`);

  lines.push('1 BIRT');
  lines.push(`2 DATE ${formatDate(person.birth)}`);
  if ((index + person.birth.year) % 5 !== 0) {
    lines.push(`2 PLAC ${placeFor(index)}`);
  }

  if (person.death) {
    lines.push('1 DEAT');
    lines.push(`2 DATE ${formatDate(person.death)}`);
    if ((index + person.death.year) % 4 !== 0) {
      lines.push(`2 PLAC ${placeFor(index + 2)}`);
    }
  }

  if ((index + 1) % 37 === 0) {
    lines.push(`1 NOTE Generated record for ${person.given} ${person.surname}.`);
  }

  for (const familyId of person.fams) lines.push(`1 FAMS @${familyId}@`);
  for (const familyId of person.famc) lines.push(`1 FAMC @${familyId}@`);
});

families.forEach((family, index) => {
  lines.push(`0 @${family.id}@ FAM`);
  if (family.husband) lines.push(`1 HUSB @${family.husband.id}@`);
  if (family.wife) lines.push(`1 WIFE @${family.wife.id}@`);
  for (const child of family.children) lines.push(`1 CHIL @${child.id}@`);

  lines.push('1 MARR');
  lines.push(`2 DATE ${formatDate(family.marriage)}`);
  lines.push(`2 PLAC ${placeFor(index + 1)}`);

  if (family.divorce) {
    lines.push('1 DIV');
    lines.push(`2 DATE ${formatDate(family.divorce)}`);
  }
});

lines.push('0 TRLR');
process.stdout.write(`${lines.join('\n')}\n`);
