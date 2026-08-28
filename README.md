# Purser

**The purser for your coding agents** — one console that meters every run, records every change, and keeps an audit you can verify. Agents run on your machine; Purser's job is spend you can trust.

<!-- TODO: demo GIF — I am recording it separately. -->

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

**Ollama models:** Purser sends all seven file tools (`read_file`, `write_file`, `apply_patch`, …) on every run. Many generic **instruct** models — including `qwen2.5:7b-instruct`, which declares tool support — still only call read/search tools and never `write_file` or `apply_patch`. Your run finishes with no proposed edit and it looks like Purser is broken; the tools were sent, the model just didn't use them.

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
| ripgrep_search fails with `Cause: …` | The tool row shows the cause inline (not just ✗). Typical fix: restart Purser from a terminal, or install [ripgrep](https://github.com/BurntSushi/ripgrep). The runner also prepends Cursor/VS Code bundled `rg` and your login-shell PATH at startup. |

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

`install.sh` in this repo **requires a public GitHub Release** and `PURSER_REPO=owner/name`. There is no tagged public release yet, so:

```bash
curl -fsSL purser.sh/install | sh   # does not work yet — do not use
```

Use the Quickstart above until **v0.1.0**. Details for maintainers: [docs/RELEASING.md](docs/RELEASING.md).

`bun run compile` builds the web UI (Vite), embeds it in the runner, and compiles a standalone binary — **no separate manual UI build**. Output lands in `dist/bin/` (e.g. `dist/bin/purser-linux-x64` on Linux, plus a `dist/bin/purser` symlink):

```bash
bun run compile
./dist/bin/purser audit verify
```

## Done (Phases 0–7)

| Phase | What landed |
| --- | --- |
| **0** | Loopback Host/Origin guards, no CORS on config, pairing frames sealed after pair, secrets out of SQLite |
| **1** | Append-only token ledger; official catalog only; unpriced models stay `NULL` cost (never invent dollars) |
| **2** | Budget governor (token + USD caps); spend UI |
| **3** | Hash-chained `~/.purser/audit.jsonl` (mode `0600`); `bun run purser -- audit verify` (or `./dist/bin/purser audit verify` after compile); path redaction |
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
| **4 — Cards** | `DecisionCard`, `DiffCard`, `ToolRow`, permission and budget prompts. |
| **5 — Polish** | Command palette (⌘K), first-run tip, toasts, empty-session prompts. Prompt coach under the composer (token count + optional shorter rewrite). |

**Browser vs runner tokenizers:** The prompt coach runs in the browser (Vite aliases `@purser-sh/pricing` → `browser.ts`). Anthropic ids stay **approximate** in-browser; the runner keeps exact Claude counts for the ledger. See [docs/METERING.md](docs/METERING.md).

Also shipped: workspaces, sessions, diffs, permission modes (`ask` / `auto_edit` / `bypass` with TTL), adapters (Echo, Claude Code, Codex, Cursor CLI, Gemini CLI, Ollama, Grok, OpenAI-compatible, Perplexity), session git worktrees, drop-folder → `.inbox/`, voice + `/phone`.

## Not shipped

- VS Code / Cursor marketplace extensions (protocol notes only)
- Live Postgres / hosted cells (schema and types only; postgres URL throws)
- A Google / Gemini local tokenizer (coach counts for `gemini_cli` stay approximate in-browser)
- A tagged public release, Homebrew tap with real sha256, or signing secrets
- Purser's own price (see [PRICING.md](PRICING.md))
- Web console bundle code-splitting (current production build is ~3.6 MB / ~1.6 MB gzipped — tolerable locally, worth trimming before v1)
- Commit provenance trailers / `purser provenance` (Phase C)
- Discriminated `Spend` union without `usdMicros` on subscription runs (Phase B2)
- Security decision cards (`sec.*` rules) and full DecisionCard keyboard focus ring audit

## Docs

| Doc | What |
| --- | --- |
| [docs/REVIEW.md](docs/REVIEW.md) | Architecture, protocol, repo map |
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
