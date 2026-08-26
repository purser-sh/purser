# Purser

**The purser for your coding agents.**

One console for the coding agents you already pay for. Every run metered, every change recorded, every audit provable. You grant a folder, pick a provider, and chat (or talk). The agent runs **on your machine**. Purser’s job is **spend you can audit**: an append-only token ledger, budget caps, and a hash-chained log.

It is not a Cursor/VS Code clone. Editors stay editors. Multi-CLI orchestration and git worktrees are common in 2026; see [docs/COMPETITORS.md](docs/COMPETITORS.md). The wedge is the ledger, the governor, and `audit verify`.

**Echo is a fake agent.** Use it to wire the UI. Switch provider for a real CLI or API.

License and Purser’s own price are **not chosen**. See `LICENSE` and [PRICING.md](PRICING.md).

## Run (dev)

Requires [Bun](https://bun.sh) ≥ 1.3.14.

```bash
bun install
bun run dev
```

| Process | URL |
| --- | --- |
| Web console | http://127.0.0.1:7410 |
| Phone UI | http://127.0.0.1:7410/phone |
| Runner websocket | `ws://127.0.0.1:7420` (loopback) |
| Health | http://127.0.0.1:7420/health → `{ ok, protocolVersion }` only |

First start writes `~/.purser/config.json` (mode `0600`). The token is **never printed**. API keys go in Settings → `~/.purser/secrets.json`, never SQLite. Open the **web console** (7410), not the runner port alone — Vite injects the bootstrap token into HTML on document navigation (same idea as the packaged binary).

```bash
bun test
bun run typecheck
```

Packaged binary (embeds the UI, injects the token into HTML, opens the browser):

```bash
bun run compile
```

Details: [docs/RELEASING.md](docs/RELEASING.md). There is no public release yet.

When releases ship:

```bash
curl -fsSL purser.sh/install | sh
```

## Done (Phases 0–6)

Companion foundation and the spend wedge are in tree:

| Phase | What landed |
| --- | --- |
| **0** | Loopback Host/Origin guards, no CORS on config, pairing frames sealed after pair, secrets out of SQLite |
| **1** | Append-only token ledger; official catalog only; unpriced models stay `NULL` cost (never invent dollars) |
| **2** | Budget governor (token + USD caps); protocol **v2** (later bumped for TokenCount); spend UI |
| **3** | Hash-chained `~/.purser/audit.jsonl` (mode `0600`); `audit verify` CLI; path redaction |
| **4** | Prompt coach returns `TokenCount` from the **selected model id** (`exact` \| `approximate`). Exact: OpenAI-native ids with matching encoding (`gpt-5`/`o3`/`o4-mini` → `o200k_base`; `gpt-4` → `cl100k_base`; Claude → `@anthropic-ai/tokenizer`). Approximate: Grok, Perplexity, Ollama, Gemini, Cursor, unknown ids. Counts **this prompt**, not the agent loop |
| **5** | `bun run compile` / `compile:all`; UI embedded in the binary; CI release workflow; token never printed |
| **6** | Public README vs architecture docs; competitor matrix; platform-risk notes |

### Web console (UI phases 1–5)

The React app (`apps/web`) got a full visual and layout pass. Spend is the product surface; the accent colour marks **one primary action per screen** (usually Send).

| UI phase | What landed |
| --- | --- |
| **1 — Foundation** | Design tokens in `apps/web/src/styles/tokens.css` (light default, dark via `prefers-color-scheme` or `data-theme`). Theme toggle in the top bar. Type/spacing/radius scales. All component colours go through tokens — no hard-coded palette classes in TSX. User messages: quiet left rule, no filled bubble. Approve = `--pass`; Reject = neutral outline. Accent copper `#C2560F` / `#F0743A`. |
| **2 — Layout** | Top bar: brand, **provider · model · permission** (Bypass shows TTL countdown), compact run meter, connection, theme, settings. Right column: **Spend · Files · Setup** tabs (320px). Conversation column centred `640–900px`. Left rail 240px. Task board and duplicate Usage/Spend strips removed. Workspace paths behind `PathDisclosure` (truncate, copy). |
| **3 — Run meter** | `RunMeter.tsx`: **compact** in the top bar (tokens, cost or `n/a`, budget bar; click opens Spend tab) and **full** in the Spend tab (this run / today / month, breakdown by provider and session via `get_spend`, unpriced + catalog staleness, inline budgets). One spend model, one place — no parallel “USAGE” or “Purser: X today” labels. |
| **4 — Cards** | `DecisionCard` (severity: pass / block / info / warn). `DiffCard`: full-width diff, path truncated from the left, +/- gutter rules, collapse hunks >40 lines, keyboard **A** / **R** / ↑↓. `ToolRow`: one-line collapsed tool call/result. Permission and budget prompts use the same card shape. |
| **5 — Polish** | Command palette (⌘K / Ctrl+K): sessions, providers, permission, open Spend/Files/Setup. First-run metering tip (dismissible). Toasts bottom-right. Empty session suggested prompts. Echo banner as slim info strip. `prefers-reduced-motion` respected on meter animation. |

**Web code map** (where to look):

```
apps/web/src/
  styles/tokens.css          # single source of colour/type/spacing tokens
  index.css                  # Tailwind bridge + focus rings
  lib/theme.ts               # light / dark / system, localStorage
  lib/store.ts               # Zustand; rightPanelTab, commandPaletteOpen, spend_update
  lib/format-tokens.ts         # compact token/cost display for the meter
  lib/paths.ts               # truncate path from left, clipboard copy
  lib/toast.ts               # bottom-right toast queue
  components/
    TopBar.tsx               # session controls + compact RunMeter
    LeftRail.tsx             # workspaces / sessions
    ChatPane.tsx             # conversation + composer (Send = sole accent)
    RightPanel.tsx           # Spend / Files / Setup tabs
    RunMeter.tsx             # compact + full meter
    DecisionCard.tsx         # shared decision shell
    DiffCard.tsx             # diff + permission + budget cards
    ToolRow.tsx              # collapsed tool lines
    CommandPalette.tsx       # ⌘K navigation
    PathDisclosure.tsx         # paths off the primary surface
    FirstRunTip.tsx          # one-time metering honesty
    TokenCountLabel.tsx      # exact vs ≈ with tooltip (protocol TokenCount)
  vite.config.ts             # aliases @purser-sh/pricing → browser entry (no WASM)
```

**Browser vs runner tokenizers:** The prompt coach runs in the browser. Vite aliases `@purser-sh/pricing` to `packages/pricing/src/browser.ts`, which uses `gpt-tokenizer` only (Anthropic ids stay **approximate** in-browser). The runner keeps full `@anthropic-ai/tokenizer` for exact Claude counts in the ledger. See [docs/METERING.md](docs/METERING.md).

Also shipped around that:

- Companion: web UI + runner + optional pairing relay
- Workspaces, sessions, diffs, permission modes (`ask` / `auto_edit` / `bypass` with TTL)
- Adapters: Echo, Claude Code, Codex, Cursor CLI, Gemini CLI, Ollama, Grok, OpenAI-compatible, Perplexity
- Session git worktrees, drop-folder → `.inbox/`, GitHub and GitLab origin link
- Voice (PCM + optional STT/TTS) and `/phone`
- Dev: Vite serves bootstrap via HTML inject; runner `/__purser/config` stays **404** (JSON config route is Vite-dev only)

## Not shipped

- VS Code / Cursor marketplace extensions (protocol notes only)
- Live Postgres / hosted cells (schema and types only; postgres URL throws)
- A Google / Gemini local tokenizer (coach counts for `gemini_cli` stay approximate in-browser; runner ledger unchanged)
- A tagged public release, Homebrew tap with real sha256, or signing secrets
- A chosen license or Purser price
- Commit provenance trailers / `purser provenance` (Phase C)
- Discriminated `Spend` union without `usdMicros` on subscription runs (Phase B2)
- Security decision cards (`sec.*` rules) and full DecisionCard keyboard focus ring audit (spec Phase 5 leftovers)

## Docs

| Doc | What |
| --- | --- |
| [docs/REVIEW.md](docs/REVIEW.md) | Architecture, protocol, repo map |
| [docs/SECURITY.md](docs/SECURITY.md) | Companion threat model |
| [docs/METERING.md](docs/METERING.md) | What we can observe and price |
| [docs/COMPETITORS.md](docs/COMPETITORS.md) | Honest matrix (asOf 2026-08-25) |
| [docs/PLATFORM-RISK.md](docs/PLATFORM-RISK.md) | Vendor terms we opened |
| [docs/RELEASING.md](docs/RELEASING.md) | Binary, embed, codesign secrets |

## Repo

```
apps/web          React console (Vite + Tailwind v4 + tokens)
apps/runner       Bun websocket server, ledger, budgets, adapters
apps/relay        Optional phone pairing relay
packages/protocol shared frames (protocol v3, TokenCount)
packages/pricing  catalog, tokenizer, browser.ts for Vite
packages/prompt-coach  pre-send token estimate
packages/db  adapters  voice  integrations
```
