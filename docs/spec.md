# Heritage v2 — MVP spec

Goal: a local web app that imports a GEDCOM (`.ged`) file and lets the user explore it in a
read-only **Family view** that looks and behaves like MyHeritage's family tree "Family view".

Out of scope: editing, adding relatives, photos upload, pedigree/fan/list views, accounts,
persistence (memory only — reload returns to the import screen), MyHeritage branding/logo/assets.

Reference captures (live MyHeritage, 1440×900 viewport) are kept locally, not in the repo: they show a real family tree.
Behavioural rules: `docs/research/tree-rules.md` (produced by the REA research task).

## Stack

- Bun (package manager + scripts), Vite, React 19, TypeScript (strict), Vitest.
- Tree is rendered as one `<svg>` with a single transformed `<g>` (pan/zoom = transform).
- Plain CSS (CSS variables for tokens). No UI kit.
- No backend. GEDCOM is parsed in the browser.

## Screens

1. **Import screen** — drop zone / file picker for `.ged`; parse errors shown inline.
   After a successful parse go straight to the Family view rooted on the *home person*
   (first INDI in the file unless a better default is obvious, e.g. HEAD `_HOME`/`SUBM` link).
2. **Family view** — header bar + toolbar + canvas + optional left profile panel.

## Design tokens (measured on myheritage.com)

All tree geometry below is in *tree units*; MyHeritage renders the tree at default zoom 0.7.

| Token | Value |
|---|---|
| Font | `"Helvetica Neue", Helvetica, Arial, sans-serif` |
| Canvas background | `rgba(0,0,0,0.05)` over white (≈ `#f2f2f2`) |
| Card size | 220 × 102, corner radius 8, fill `#fff` |
| Card border | 2px; male `rgb(23,180,206)` `#17B4CE`; female `rgb(252,129,129)` `#FC8181`; unknown sex: `#999` |
| Selected card | extra 3px border overlay in the same gender colour + soft shadow (`feDropShadow` std 8, opacity .2) |
| Avatar | 64px circle at (10,16) inside the card, 1px `#ccc` ring; silhouette by sex (man/woman/boy/girl for living children – our own SVGs) |
| Name text | 15px, weight 500, `#000`, x=82, first baseline y=24, wraps to max 3 lines, line step 16 |
| Sub text (years / "Deceased") | 15px, normal, `#595959`, baseline 19px below last name line |
| Sub text rule | `birthYear – deathYear`; only birth → `1989`; dead without dates → `Deceased`; living w/o dates → empty |
| Connectors | 1px `#999`, orthogonal with 30-unit rounded corners |
| Generation step (vertical) | 188 units between card tops |
| Couple spacing | partner card left = card left + 254 (34-unit gap) |
| Sibling spacing | ≈ 277 units between adjacent sibling-unit lefts (min gap ≈ 57) |
| Child placement | single child centred under the midpoint of its parents' couple |
| "+ add" tab under cards, pencil/camera icons | **omit** (read-only) |
| "Add mother/father" dashed placeholders | **omit** (read-only) |

### Chrome around the canvas

- Header row (white): tree name (`Beka Family Tree`-style, 18px) then `|` and the home-person
  name (12–13px `#595959`); right side shows a single active tab "Family view" in
  `rgb(209,73,0)` (`#D14900`) with a 2px underline of the same colour.
- Toolbar row (over canvas, top): left: panel toggle chevron button and "`N of M people`"
  (13px `#595959`); right: generations dropdown (`1 2 3 4 5+`, label "Generations above/below
  main person", default `5+`… we default to 3 for performance if needed), "Find a person…" input
  (215×32, radius 15, bg `#f2f2f2`, 1px `#ccc`, 12px) with autocomplete.
- Zoom controls (bottom-right, vertical white rounded stack): fit-to-screen, home (re-center on
  root), `+`, `−`. Zoom percentage shown somewhere unobtrusive (MyHeritage shows `100%`).
- Left profile panel: 370px wide, white, full canvas height, slides in from the left, close
  chevron at top-right. Content (read-only): avatar + name (15px) + relationship to home person
  ("Your father" → we say "Father of <home>") + life summary; sections with 11px/500 uppercase
  `#595959` headers: **IMMEDIATE FAMILY** (parents, siblings, spouses, children — each row
  avatar + name + role "His father"/"Her son" + years) and **FACTS** (timeline: year column,
  13px/500 fact name e.g. "Birth", "Marriage to:", "Birth of son:", "Death", then place/person).
  Clicking a person in the panel selects them in the tree.

## Behaviour (observed)

- Initial render: tree centred on the root (home) person at zoom 0.7.
- Click a card (not selected) → it becomes *selected* (highlight) and the canvas animates
  (≈300–400ms ease) so that card is centred. Layout does **not** change.
- Click the already-selected card → opens the left profile panel for that person.
- "Make root / View his tree" (panel action) → re-roots the layout on that person.
- Drag on empty canvas → pan. Mouse wheel / trackpad → zoom around cursor. Buttons zoom in
  steps. Fit button fits all visible cards.
- Find a person → choosing a result re-roots? *(confirm in tree-rules.md)* — at minimum selects
  and centres them, re-rooting if they are not in the current layout.
- Generations dropdown limits ancestors above and descendants below the root.
- "`N of M people`": N = cards rendered, M = individuals in file.

## Acceptance

- `bun run build`, `bun run test`, `bun run typecheck` pass.
- Importing `tests/fixtures/*.ged` renders without console errors; 1000-person file stays
  interactive (pan/zoom ≥ 50fps feel, no layout > 200ms).
- Side-by-side with the live MyHeritage reference capture the card look,
  colours, spacing and connector style match closely.
