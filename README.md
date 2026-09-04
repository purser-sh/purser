# Purser

**The purser for your coding agents.**

Nothing an agent produces reaches your disk without your approval, and that is enforced by the type system: the only function that can write to your workspace requires a token only the approval step can mint.

Every change is recorded in a hash-chained audit log you can verify from the CLI. Every run is metered — tokens for every provider, dollars only where a plan price is knowable from the outside.

Agents run on your machine. Purser does not replace them, does not resell tokens, and never holds your provider logins — you keep those.

**Free and open source · Apache-2.0 · Runs entirely on your machine**

## The problem

You run more than one coding agent now. Claude Code for one thing,
Cursor for another, a local model for the cheap work.

**How much did they cost this week?**
Claude shows you Claude. Cursor shows you Cursor. Nobody shows the total.

**Which agent wrote this file, and did anyone check it?**
The commit says your name. The prompt, the model and the review are gone.

**What stops a runaway agent at 2am?**
Nothing. You find out when the bill arrives.

Purser sits in front of the agents you already run and answers those
three questions. It does not replace your agents, does not resell
tokens, and never holds your provider logins — you keep those.

*For anyone running more than one coding agent.*

## Quickstart

Primary path today is clone and run (the packaged installer lands with **v0.1.0**):

```bash
git clone https://github.com/purser-sh/purser
cd purser
bun install
bun run dev
```

Then open **http://127.0.0.1:7410**, open a folder, pick a provider, and send a prompt. Use **Echo** first to confirm the console works before wiring a real provider.

Verify the audit chain (works immediately after `bun install`, no compile step):

```bash
bun run purser -- audit verify
```

Requires [Bun](https://bun.sh) ≥ **1.3.14**.

| Process | Port |
| --- | --- |
| Web console | http://127.0.0.1:7410 |
| Phone UI | http://127.0.0.1:7410/phone |
| Runner websocket | `ws://127.0.0.1:7420` |
| Optional relay | `ws://127.0.0.1:7430` |

First start writes `~/.purser/config.json` (mode `0600`). The token is **never printed**. API keys go in Settings → `~/.purser/secrets.json`, never SQLite.

## Development

```bash
bun test
bun run typecheck
```

## Prerequisites, per provider

| Provider | Needs |
| --- | --- |
| **Echo** | nothing — use it to check the console works |
| **Ollama** | `ollama serve` running + a **coder-tuned** model pulled (see **Ollama models** below) |
| **Claude Code** | `npm i -g @anthropic-ai/claude-code`, then `claude` → `/login`; requires a Claude Pro or Max plan. Also `bun add @anthropic-ai/claude-agent-sdk` in this repo if the SDK package is missing |
| **Codex / Cursor CLI / Gemini CLI** | their CLI installed and logged in (`codex`, `cursor-agent`, `gemini`). Prefer `cursor-agent` over the short `agent` symlink — `agent` collides with other tools |
| **Grok / Perplexity / OpenAI-compatible** | an API key, added in Settings |

Unready providers show as blocked in the top-bar selector with the exact command to fix them. Purser will not start a run against a provider it already knows will fail.

**Ollama models:** Purser sends eight workspace tools (`read_file`, `read_document`, `write_file`, `apply_patch`, …) on every run. Many generic **instruct** models — including `qwen2.5:7b-instruct`, which declares tool support — still only call read/search tools and never `write_file` or `apply_patch`. Your run finishes with no proposed edit and it looks like Purser is broken; the tools were sent, the model just didn't use them.

For coding tasks, pull a **coder-tuned** model and select it in the top-bar model picker:

```bash
ollama pull qwen2.5-coder:7b    # minimum for file edits; use 14b or 32b if you have VRAM
```

Do not rely on chat/instruct variants for edits unless you have verified they call write tools on your hardware.

## Troubleshooting

| Failure | Fix |
| --- | --- |
| Port 7410 / 7420 / 7430 already in use | Purser prints the port and how to free it (no Node stack). Free with `lsof -ti:7410,7420,7430 \| xargs -r kill`, or move: `PURSER_WEB_PORT=7411 PURSER_PORT=7421 PURSER_RELAY_PORT=7431 bun run dev`. |
| Claude Agent SDK missing | From the repo root: `bun add @anthropic-ai/claude-agent-sdk` (workspace: `packages/adapters`). |
| Claude Code: "Not logged in · Please run /login" | That `/login` is Claude's terminal command, not a Purser route. Run `claude` in a terminal, use `/login`, then reload Purser. |
| Ollama: `llama-server` binary not found | Broken Ollama install. Reinstall from https://ollama.com (`curl -fsSL https://ollama.com/install.sh \| sh`), then `ollama serve`. |
| Ollama: connection refused | Start it: `ollama serve`. |
| No models / empty model list on Ollama | `ollama pull qwen2.5-coder:7b` (or larger), then pick it in the top bar. |
| Ollama run reads files but never proposes an edit | Purser sent write tools; the model didn't call them. Switch from an instruct/chat model to a **coder** model (`qwen2.5-coder:7b` minimum). Instruct models often stop after `read_file` / `ripgrep_search` even when tool support is advertised. |
| Agent asked for `README`, got a bare miss | `read_file` (and `list_dir`) now resolve an unambiguous extensionless hit (`README` → `README.md`) and otherwise return near matches: `Did you mean: README.md, …?` |
| ripgrep_search fails with `Cause: …` | The tool row shows the cause inline (not just ✗). The runner prepends standard system paths (`/usr/bin`, `/bin`, …), Cursor/VS Code bundled `rg`, and your login-shell PATH at startup — so apt-installed ripgrep is found even when the IDE inherits a minimal bun/pyenv-only PATH. Restart Purser after installing `ripgrep`. |

## Git worktrees and your working folder

When you open a **git repository**, each new session gets an isolated worktree under `~/.purser/worktrees/<session-id>/`, checked out at **HEAD** (last commit). Parallel agents do not edit the same checkout.

| | |
| --- | --- |
| **What the agent sees** | Committed files at HEAD only — **not** uncommitted changes in the folder you opened. |
| **Non-git folders** | No worktree; the agent runs directly in your open folder and sees everything on disk. |
| **Approve a diff** | Copies that file from the session worktree into your open workspace folder (overwrites that path). |
| **Reject a diff** | Discards the agent's edit inside the worktree only. |
| **Need the agent on dirty files?** | Commit or stash first, then start a session — we do not clone uncommitted state into the worktree. |

Purser warns at session creation when your open folder has uncommitted changes. See also Setup → Workspace in the right panel.

## Packaged install (not ready yet)

A one-line installer ships with v0.1.0. Until then, use the Quickstart above. Maintainer details: [docs/RELEASING.md](docs/RELEASING.md).

`bun run compile` builds the web UI (Vite), embeds it in the runner, and compiles a standalone binary — **no separate manual UI build**. Output lands in `dist/bin/` (e.g. `dist/bin/purser-linux-x64` on Linux, plus a `dist/bin/purser` symlink):

```bash
bun run compile
./dist/bin/purser audit verify
```

<details>
<summary>Development history — what landed in each phase</summary>

## Done (Phases 0–7)

| Phase | What landed |
| --- | --- |
| **0** | Loopback Host/Origin guards, no CORS on config, pairing frames sealed after pair, secrets out of SQLite |
| **1** | Append-only token ledger; official catalog only; unpriced models stay `NULL` cost (never invent dollars) |
| **2** | Budget governor (token + USD caps) with **pre-run gate** (blocks over-cap runs before the agent starts); spend UI |
| **3** | Hash-chained `~/.purser/audit.jsonl` (mode `0600`); `bun run purser -- audit verify` (or `./dist/bin/purser audit verify` after compile) with per-break chain diagnostics; path redaction |
| **4** | Prompt coach: live token count under the composer (`exact` / `≈` for the typed prompt), with a one-click shorter rewrite when one exists. Counts **this prompt**, not the agent loop — the run meter in the top bar is the spend headline |
| **5** | `bun run compile` / `compile:all`; UI embedded in the binary; CI release workflow; token never printed |
| **6** | Public README vs architecture docs; competitor matrix; platform-risk notes |
| **7** | Provider readiness + vendor-error translation (protocol **v4**); provider/model coherence (no model id crosses a provider switch; ledger rejects impossible pairs) |

### Web console (UI phases 1–5)

Spend is the product surface; the accent colour marks **one primary action per screen** (usually Send).

| UI phase | What landed |
| --- | --- |
| **1 — Foundation** | Design tokens in `apps/web/src/styles/tokens.css`. Theme toggle. User messages: quiet left rule. Accent copper `#C2560F` / `#F0743A`. |
| **2 — Layout** | Top bar: brand, **provider · model · permission**, compact run meter. Right column: **Spend · Files · Setup**. |
| **3 — Run meter** | This run / today / month from the ledger; click opens Spend. |
| **4 — Cards** | `DecisionCard`, `DiffCard`, `ToolRow` (300px scroll cap + “Show all”), permission and budget prompts, `ProviderBlockedCard` with fix commands. |
| **5 — Polish** | Command palette (⌘K), first-run tip, toasts, empty-session prompts. Prompt coach under the composer (token count + optional shorter rewrite). |

**Browser vs runner tokenizers:** The prompt coach runs in the browser (Vite aliases `@purser-sh/pricing` → `browser.ts`). Anthropic ids stay **approximate** in-browser; the runner keeps exact Claude counts for the ledger. See [docs/METERING.md](docs/METERING.md).

Also shipped: workspaces, sessions (title from first prompt), diffs, permission modes (`ask` / `auto_edit` / `bypass` with TTL), adapters (Echo, Claude Code, Codex, Cursor CLI, Gemini CLI, Ollama, Grok, OpenAI-compatible, Perplexity), session git worktrees at HEAD, `read_file` / `read_document` / `list_dir` near-match hints, runner PATH augmentation for `ripgrep_search`, drop-folder → `.inbox/`, voice + `/phone`.

### Workspace tools

| Tool | What it does |
| --- | --- |
| `read_file` | Text files inside the workspace (512 KB preview cap) |
| `read_document` | PDF, Word (DOCX), and Excel (XLSX) via built-in converters; PowerPoint, images, and other formats when [MarkItDown](https://github.com/microsoft/markitdown) is installed (`pip install 'markitdown[all]'`) |
| `write_file` / `apply_patch` | Staged edits with diff cards |
| `list_dir` / `ripgrep_search` | Navigate and search the tree |
| `run_bash` | Opt-in shell (workspace setting) |
| `web_search` | Research providers only |

`read_document` converts locally (no network). Large conversions ask before entering context; see Settings → Workspace for the token threshold and file-size cap.

</details>

## Not shipped

- No tagged public release or packaged installer yet (use the Quickstart)
- Live Postgres / hosted cells (schema and types only; postgres URL throws)
- VS Code / Cursor marketplace extensions (protocol notes only)
- A Google / Gemini local tokenizer (coach counts for `gemini_cli` stay approximate in-browser)
- Purser's own price (see [PRICING.md](PRICING.md))

## Docs

| Doc | What |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | What Purser is, system diagram, safety model |
| [docs/REVIEW.md](docs/REVIEW.md) | Protocol, repo map, review checklist |
| [docs/SECURITY.md](docs/SECURITY.md) | Companion threat model |
| [docs/METERING.md](docs/METERING.md) | What we can observe and price |
| [docs/COMPETITORS.md](docs/COMPETITORS.md) | Honest matrix |
| [docs/PLATFORM-RISK.md](docs/PLATFORM-RISK.md) | Vendor terms we opened |
| [docs/RELEASING.md](docs/RELEASING.md) | Binary, embed, codesign secrets |

## Repo

```
apps/web          React console (Vite + Tailwind v4 + tokens)
apps/runner       Bun websocket server, ledger, budgets, adapters
apps/relay        Optional phone pairing relay
packages/protocol shared frames (protocol v4, TokenCount, readiness, provider/model table)
packages/pricing  catalog, tokenizer, browser.ts for Vite
packages/prompt-coach  pre-send token estimate
packages/db  adapters  voice  integrations
```

Licensed under **Apache-2.0** (see [LICENSE](LICENSE)). Purser's own price is not decided yet — see [PRICING.md](PRICING.md).
