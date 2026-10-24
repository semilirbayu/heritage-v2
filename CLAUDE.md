# CLAUDE.md

The project rules live in AGENTS.md, which is shared by every coding agent. It is imported
below. Follow it as written.

@AGENTS.md

## Claude-specific notes

- If you delegate to subagents, give them only synthetic data or the anonymised fixtures in
  `tests/fixtures/`, never anything from `.scratch/`.
- Keep `AGENTS.md` the single source of truth: update it rather than adding project rules here.

## Models for orchestration

You are the orchestrator. Give the work to subagents with T3 `delegate_task`. Use this table
to select the model.

| Work | Model | Why |
|---|---|---|
| Visual and UI work: layout, SVG, CSS, Family view look | Cursor `grok-4.7` (reasoning effort high) | Good results on the Family view. It tells you when the spec is wrong. |
| Logic, parser, tests, a fix with a clear target | OpenCode Go `opencode-go/deepseek-v4.1-flash` | Clean and cheap. All tests passed on the first try. |
| Code review, research, logic only | OpenCode Go `opencode-go/muse-spark-1.3-contributor` | Cheapest model ($0.10 / $0.20 for each million tokens). Accurate reviews. |
| Small or slow tasks, if the free quota is available | `opencode/deepseek-v4.1-flash-free`, `opencode/glm-5.3-flash-free`, `opencode/mimo-v2.6-flash-free` | Free. |

Rules:

- Do not use Muse for visual or design work. Its visual results are bad.
- Muse trains on prompts. Do not give Muse private or real data.
- The free OpenCode quota is shared by all free models. If one free model shows
  "Free usage limit reached", do not try the other free models. Use the paid DeepSeek model.
- Stop a subagent that works for a long time with no progress (for example, more than
  20 minutes on open position tuning). Make the remaining task smaller. Give it to DeepSeek.
- Give each subagent a target that it can measure, for example a test or a compare script.
- Look at the result of each visual change yourself before you report it.
- Get the current model IDs from `orchestrator_capabilities`. The IDs in this table can change.