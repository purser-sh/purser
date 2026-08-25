# Competitors (asOf 2026-08-25)

AgentDeck is **not** unique for multi-CLI orchestration, git worktrees, a desktop console, voice dictation, or a phone client. Those exist. This page is the honest matrix. Sources are linked. If a cell is blank, we did not verify it.

**Our wedge (what we actually ship that this table is about):** append-only `token_ledger` with official catalog rows only, budget caps (`warn` / `ask` / `hard_stop`), and a hash-chained `audit.jsonl` with `audit verify`. Unpriced stays `NULL`, never `$0.00`.

If a row below already has that stack, the wedge is wrong — update this file, do not paper over it.

| Product | What it is (verified) | Multi-CLI / worktrees / phone | Spend ledger + budget caps + hash-chained audit |
| --- | --- | --- | --- |
| **AgentDeck** | Local companion: web UI + runner on loopback. User’s CLIs and keys. | Yes (several adapters, session worktrees, `/phone` via relay). | **Yes, shipped.** See [METERING.md](METERING.md), runner `budget.ts`, `audit.ts`. |
| [Conductor](https://conductor.build) (Melty Labs) | Native **macOS** app for parallel agents and diff review. Closed source. | Claude Code, Codex, Cursor, OpenCode; git worktrees. No phone in the sources we opened. | Not claimed in the pages we opened. Do not assume they lack it. |
| [AgentsRoom](https://agentsroom.dev) | Desktop “command center” for many CLI agents; they also publish comparison pages. | Many CLIs; they claim a mobile companion + encrypted relay. Treat their marketing as theirs. | Not verified. |
| [Omnara](https://www.omnara.com/) | Open-source **agent runtime / API** (durable execution, self-host). A different product also used the name for mobile steering of Claude — do not merge them without a URL. | Not a laptop multi-CLI console in the page we opened. | Not a companion spend ledger. |
| [Paseo](https://paseo.sh) | Self-hosted orchestrator: daemon on your machine, desktop / web / mobile / CLI. Compared on 2026-07-26 by CodeAgentSwarm’s own docs. | Phone + web clients; CLI agents you host. | Not verified. |
| [Sculptor](https://imbue.com/product/sculptor/) (Imbue) | OSS desktop (MIT) for parallel agents. Local, no Imbue subscription. [github.com/imbue-ai/sculptor](https://github.com/imbue-ai/sculptor) | Isolated worktrees; Pi + Claude Code + any terminal agent. | Not claimed on the product page we opened. |
| [Claude Squad](https://github.com/smtg-ai/claude-squad) | Terminal session manager (tmux + worktrees). AGPL-3.0 in 2026 roundups. | Claude Code, Codex, Gemini, Aider. No GUI spend product. | No. |
| [Vibe Kanban](https://github.com/BloopAI/vibe-kanban) | Local web UI + task board. Apache in 2026 roundups. Community-maintained. | Many CLIs, git worktrees. | Board is task state, not a priced ledger. |
| [CodeAgentSwarm](https://www.codeagentswarm.com/en) | Closed-source macOS/Windows ADE. They disclose no Linux, no mobile. | Claude Code, Codex, Antigravity, OpenCode, Kimi, Grok Build, Cursor Agent. | Not verified. Their comparison pages are first-party. |
| [T3 Code](https://github.com/pingdotgg/t3code) | OSS harness control surface: desktop, web, mobile. MIT. Wraps CLIs you already logged into. | Codex, Claude Code, Cursor, Grok Build, OpenCode. | Event-sourced session log ≠ priced USD ledger. |
| [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent) | Agents on **Cursor-managed VMs**, not your laptop disk. Launch from app / web / phone / Slack. Cursor also has **local** worktrees in the Agents Window. | One vendor stack (Cursor), not a mixed BYO CLI fleet. Cloud path needs git remote. | Cursor bills model usage on their plans. That is not AgentDeck’s ledger. |

Also in the 2026 field (not a full row): Crystal / Nimbalyst, Emdash, Superset, Munder Difflin, Orca. Same rule: orchestration is crowded; spend-governance is the claim to defend.

## What we must not say

- “Nobody else sits in front of several CLI agents.” False.
- “Nobody else does git worktrees per session.” False.
- “Nobody else has a phone client.” False (T3 Code, Paseo, AgentsRoom, Omnara-the-mobile-one, Cursor).
- “IDE assistants never bill after the run, only we coach before spend.” Prompt coaching is small; the loop is the bill. Others also show usage. Our difference is **integer micro-USD from official pages, NULL when unknown, and a hard stop**.

## Sources

- [Augment Code, 9 OSS orchestrators](https://www.augmentcode.com/tools/open-source-agent-orchestrators)
- [Nimbalyst, 2026 coding vs workflow](https://nimbalyst.com/blog/best-ai-agent-orchestration-platforms-2026/)
- [AgentsRoom comparisons](https://agentsroom.dev/blog/best-multi-agent-coding-tools) (first-party)
- [Cursor Cloud Agents docs](https://cursor.com/docs/cloud-agent)
- Product pages linked in the table
