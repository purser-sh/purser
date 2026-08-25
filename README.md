# AgentDeck

One console for the coding agents you already pay for. You grant a folder, pick a provider, and chat (or talk). The agent runs **on your machine**. AgentDeck’s job is **spend you can audit**: an append-only token ledger, budget caps, and a hash-chained log.

It is not a Cursor/VS Code clone. Editors stay editors. Multi-CLI orchestration and git worktrees are common in 2026; see [docs/COMPETITORS.md](docs/COMPETITORS.md). The wedge is the ledger, the governor, and `audit verify`.

**Echo is a fake agent.** Use it to wire the UI. Switch provider for a real CLI or API.

License and AgentDeck’s own price are **not chosen**. See `LICENSE` and [PRICING.md](PRICING.md).

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

First start writes `~/.agentdeck/config.json` (mode `0600`). The token is **never printed**. API keys go in Settings → `~/.agentdeck/secrets.json`, never SQLite.

```bash
bun test
bun run typecheck
```

Packaged binary (embeds the UI, injects the token into HTML, opens the browser):

```bash
bun run compile
```

Details: [docs/RELEASING.md](docs/RELEASING.md). There is no public GitHub Release yet.

## Shipped

- Companion: web UI + runner + optional pairing relay (frames sealed after pair)
- Workspaces, sessions, diffs, permission modes (`ask` / `auto_edit` / `bypass` with TTL)
- Adapters: Echo, Claude Code, Codex, Cursor CLI, Gemini CLI, Ollama, Grok, OpenAI-compatible, Perplexity
- Session git worktrees, drop-folder → `.inbox/`, GitHub and GitLab origin link
- Voice (PCM + optional STT/TTS) and `/phone`
- Token ledger (official catalog only; OpenAI unpriced as of 2026-08-25), budget governor, protocol **v2**
- Hash-chained `~/.agentdeck/audit.jsonl`; `bun apps/runner/src/index.ts audit verify`
- Prompt coach uses `gpt-tokenizer` (not `ceil(chars/4)`); counts **this prompt**, not the agent loop
- Compile path + CI workflow; runner `/__agentdeck/config` is 404 (Vite dev still has the JSON route)

## Not shipped

- VS Code / Cursor marketplace extensions (protocol notes only)
- Live Postgres / hosted cells (schema and types only; postgres URL throws)
- `@anthropic-ai/tokenizer`
- A tagged public release, Homebrew tap with real sha256, or signing secrets
- A chosen license or AgentDeck price

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
apps/web  apps/runner  apps/relay
packages/protocol  db  adapters  voice  prompt-coach  pricing  integrations
```
