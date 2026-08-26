# Metering

What Purser can observe, price, and persist. Unpriced is stored as SQL `NULL`, never `$0.00`.

Catalog rows live in `packages/pricing` and are copied from official pages with an `asOf` date. Override any row with `~/.purser/pricing.json` (array of catalog rows, or `{ "rows": [...] }`). User rows deep-merge onto the builtin catalog.

## Prompt token counts (composer / coach)

Composer estimates use `TokenCount`: `{ value, source: "exact" | "approximate", tokenizer, providerFamily }`.
Family is resolved from the **selected model id**, not the adapter. `exact` requires a positive match between the tokenizer and that family (plus a known OpenAI encoding when family is `openai`). **Unknown defaults to approximate.** Approximate counts render as `≈ N` with a tooltip. This is **not** the agent loop and **not** the ledger.

OpenAI-compatible wire format ≠ OpenAI BPE. Hosts like Grok, Perplexity, and Ollama may return OpenAI-shaped `usage` JSON but use different tokenizers.

| Example model id | Resolved family | Tokenizer used | Coach count |
| --- | --- | --- | --- |
| `gpt-5`, `o3`, `o4-mini` (Codex) | openai | `gpt-tokenizer/o200k_base` | **exact** |
| `gpt-4`, `gpt-3.5-turbo` | openai | `gpt-tokenizer/cl100k_base` | **exact** |
| `gpt-4o`, `o1`, `o3-mini` | openai | `gpt-tokenizer/model/…` or `o200k_base` | **exact** |
| `sonnet`, `opus`, `haiku`, `claude-*` | anthropic | `@anthropic-ai/tokenizer` | **exact** (package is rough for Claude 3+ — prefer provider `usage` for bills) |
| `gemini-*` | google | `gpt-tokenizer/cl100k_base` (no Google tokenizer in-tree) | **approximate** |
| `grok-*` | unknown | `gpt-tokenizer/cl100k_base` | **approximate** |
| `sonar*`, `llama*`, `mistral*`, … | unknown | `gpt-tokenizer/cl100k_base` | **approximate** |
| `auto`, `composer-*`, `echo-v1`, empty | unknown | `gpt-tokenizer/cl100k_base` | **approximate** |

If encode throws, source is `approximate` with tokenizer `heuristic` (`ceil(chars/4)`).

## Adapter observability (ledger / spend)

| Adapter | `costModel` | Usage we can see | What we price |
| --- | --- | --- | --- |
| `echo` | `local` | Estimated from model id when known; otherwise approximate | Never. Local fake agent. |
| `grok` | `metered` | OpenAI-style `usage` when the API returns it (`prompt_tokens`, `completion_tokens`, `cached_tokens`). Otherwise estimated at run finish from the observed transcript. | Token rates from [xAI pricing](https://docs.x.ai/developers/pricing) for `grok-4.6`, `grok-4.5`, `grok-4.3`. Cache **write** is unpublished → the whole event is unpriced if cache-write tokens are present. Requests ≥200k input use the published long-context rates for the **whole** request. |
| `perplexity` | `metered` | Same OpenAI-style `usage` if present; else estimate at finish. | Token rates only for `sonar`, `sonar-pro`, `sonar-reasoning-pro` from [Perplexity pricing](https://docs.perplexity.ai/getting-started/pricing). Per-request and search fees are **not** in the ledger. |
| `generic_llm` | `metered` | Same as grok when the endpoint returns `usage`. | **No builtin rows.** The official OpenAI pricing page could not be fetched when the catalog was written (`asOf` 2026-08-25). Add rows in `pricing.json` if you want dollars. |
| `ollama` | `local` | Same `usage` or estimate | Never. Local models. |
| `claude_code` | `subscription` | SDK `usage` (`input_tokens`, `output_tokens`, cache read/creation when present). | Tokens are recorded. Dollars stay `NULL` — this is a subscription seat, not a public token tariff we will invent. |
| `codex` | `subscription` | JSONL `usage` / `stats` when the mapper sees it; else estimate at finish. | Tokens only. |
| `cursor_agent` | `subscription` | Same JSONL path as other CLIs. | Tokens only. |
| `gemini_cli` | `subscription` | Same JSONL path as other CLIs. | Tokens only. |

CLI adapters often print nothing we can parse. Missing fields stay `null` on the wire and `0` in SQLite token columns (counts must be numbers). `cost_usd_micros` stays `NULL` when we cannot price.

## Ledger

`token_ledger` is append-only (SQLite triggers abort `UPDATE`/`DELETE`). Each provider `usage` event writes one row. `run_finished` (including cancel and error) writes a finalising row. Cancelled runs still keep whatever was recorded.

Session `tokensIn` / `tokensOut` are observed counters for the UI. They are not an invoice. The session `costUsd` column still exists for compatibility and is **not** incremented by the meter — dollar truth is `cost_usd_micros` on the ledger.

## Honest gaps

- OpenAI / unnamed compatible models are unpriced until an official catalog row exists.
- Perplexity request fees are outside the token ledger.
- Gemini, Grok, Ollama, and unrecognized model ids: coach counts stay approximate.
- We do not hash-chain the ledger. Audit chaining applies to `audit.jsonl`, not this table.
