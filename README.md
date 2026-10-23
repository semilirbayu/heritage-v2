# Heritage v2

A local, read-only family-tree viewer. Import a GEDCOM (`.ged`) file and explore it in a
**Family view** modelled on MyHeritage's: gender-coloured person cards, couple and child
connectors, pan/zoom, a profile panel, and "View family branch" re-rooting.

Everything runs in the browser. There is no backend and no persistence: the file is parsed in
a Web Worker, kept in memory, and gone on reload.

## Quick start

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev        # http://localhost:5173
```

Open the app and drop a `.ged` file on the import screen. `tests/fixtures/` has made-up
samples to try (`sample.ged`, `live-reference.ged`, `large-1000.ged`).

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Vite dev server |
| `bun run build` | Typecheck, then production build to `dist/` |
| `bun run preview` | Serve the production build |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run test` | Vitest, once |
| `bun run gen:fixture` | Regenerate the synthetic 1000-person fixture |

## Features

- GEDCOM 5.5/5.5.1 import, including MyHeritage export quirks (home person from `_HOME`,
  tree name from `HEAD FILE`, slashes inside given names).
- Family view: the root with spouses and descendants, direct ancestors, and collaterals from
  parents and grandparents, capped at 1000 cards.
- Connectors for multiple marriages, matching MyHeritage's split bars and lines running behind
  a middle spouse.
- "View family branch" pills on anyone with hidden relatives; clicking re-roots, and a
  breadcrumb trail leads back.
- Card select and centre, profile panel (immediate family and facts), find-a-person,
  generation limit, fit, zoom and keyboard navigation.

Not included: editing, photos, other chart types, accounts, saving.

## Project layout

```
src/
  gedcom/        GEDCOM parser, dates, Web Worker wrapper
  model/         FamilyTree types and relationship helpers
  layout/        Pure layout: who is visible, card positions, connectors, text wrapping
  components/    React UI (ImportScreen, family-view/*)
  styles/        Plain CSS with design tokens
tests/           Vitest suites and synthetic .ged fixtures
docs/            spec.md and research notes on MyHeritage's tree rules
scripts/         Fixture generator
```

## Docs

- [`docs/spec.md`](docs/spec.md): MVP scope, design tokens and behaviour.
- [`docs/research/`](docs/research): how MyHeritage picks, places and prunes people.
- [`AGENTS.md`](AGENTS.md): working rules for contributors and coding agents.

## Disclaimer

An independent study project, not affiliated with MyHeritage. It uses no MyHeritage code,
logos, images or other assets; card silhouettes and icons are original drawings.
