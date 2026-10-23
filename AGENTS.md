# AGENTS.md

Rules for coding agents in this repo. See [`README.md`](README.md) for what the app does and
[`docs/spec.md`](docs/spec.md) for the scope.

## Language

Always write responses and explanations in ASD-STE100 (Simplified Technical English):
short sentences, simple words, active voice, and one instruction in each sentence.

## Commands

Use Bun. Do not use npm, npx, yarn or pnpm.

```sh
bun install
bun run dev
bun run typecheck
bun run test
bun run build
```

Before you say that work is done, make sure that typecheck, test and build all pass.

## How to work

- Make the app look and work like the MyHeritage Family view.
- Measure MyHeritage. Do not guess.
- Write each rule that you find in `docs/research/`, and add a test for it.
- Make each fix general. Do not make a fix for only one family.
- Do not copy or trace MyHeritage images, icons, logos or code. Make your own.
- For a visual change, run the app and look at the result.

## Privacy

This repo is public. Real family files contain names of living people.

- Do not commit real `.ged` files, screenshots of real trees, or real names.
- Use only made-up people in tests and fixtures.
- Keep real data in `.scratch/`. Git ignores this folder.
- Do not send real family data to other AI services.

## Git

- The owner commits and pushes. Do not commit unless the owner tells you to.
- Push only `main`. Do not use `git push --all` or `--mirror`.
