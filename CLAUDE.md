# CLAUDE.md

The project rules live in AGENTS.md, which is shared by every coding agent. It is imported
below. Follow it as written.

@AGENTS.md

## Claude-specific notes

- If you delegate to subagents, give them only synthetic data or the anonymised fixtures in
  `tests/fixtures/`, never anything from `.scratch/`.
- Keep `AGENTS.md` the single source of truth: update it rather than adding project rules here.