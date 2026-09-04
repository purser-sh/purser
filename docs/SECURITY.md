# Purser security

This document is the threat model and control list for the **local companion** (laptop runner + Vite UI + optional pairing relay). Hosted cells are specified, not shipped.

Disclosure: there is no published security mailbox yet. Until launch, report issues as a private GitHub security advisory on the Purser repository. Replace this paragraph with a dedicated address before any public release.

## Who the attacker is

| Attacker | What they can do if we do nothing |
| --- | --- |
| Malicious web page in the user's browser | Open `ws://127.0.0.1:7420` from any origin. Loopback binding does **not** stop this — the browser same-origin policy does not apply to WebSocket upgrades. |
| DNS rebinding | Point an attacker hostname at `127.0.0.1` and speak our protocol with `Host: evil.example`. |
| Other local processes running as the same user | Read `~/.purser/secrets.json` and `config.json` (mode `0600`). We do **not** defend against this. Say so plainly. |
| Compromised pairing relay | See whatever it forwards. After Phase 0, post-pair frames are AES-GCM sealed with a key derived from the pairing code via HKDF, so a honest-but-curious relay carries ciphertext. The pairing messages themselves (`pair` / `pair_ok`) stay plaintext. |
| Malicious repo / prompt-injecting agent | Trick the model into calling tools. Permission cards and bypass TTL are the controls. Bypass still means unattended tools for that session until expiry. |
| Cross-site fetch of `/__purser/config` | Steal the runner token from the Vite dev server. |

## Controls (Phase 0)

| Control | Defends against |
| --- | --- |
| Websocket `Origin` allowlist (`http://127.0.0.1:7410`, `http://localhost:7410`, plus `allowedOrigins`) | Malicious web pages talking to the runner. |
| Websocket `Host` allowlist (`127.0.0.1:<port>`, `localhost:<port>`, plus `allowedHosts`) | DNS rebinding. Default list does **not** include `[::1]`. |
| Non-browser upgrades require `Authorization: Bearer <runner token>` (or `?token=`) when `Origin` is absent | Local pages cannot skip Origin; CLI/VS Code clients must present the token at handshake. Logged as `token-client`. |
| `hello` token check (timing-safe). Via-relay hello uses the pairing code, not the runner token. | Defence in depth after a successful upgrade. |
| Vite `/__purser/config` (development only) Host + Origin + `Sec-Fetch-Site !== cross-site`, `Cache-Control: no-store`, `Vary: Origin`, `X-Content-Type-Options: nosniff`, no `Access-Control-Allow-Origin`. Production Vite and the runner both 404 this path. Packaged HTML injects the token under `checkUiHttp` (Host allowlist; document nav may omit Origin if `Sec-Fetch-Site` is `none`/`same-origin`/`same-site`). | Token theft from a web page or a production static server. |
| `/health` returns only `{ ok: true, protocolVersion: 4 }` | Accidental leak of token, roots, or workspace names. |
| Pairing codes: Crockford base32, length ≥ 8 (~40 bits), TTL 120s, single use, max 5 attempts per code, max 20 attempts per source per minute, `timingSafeEqual` via SHA-256 digests. | Relay guessing and reuse. |
| Relay frame seal: HKDF-SHA-256(pairing code) → AES-256-GCM. | Relay reading protocol payloads (including the runner token on `hello` from the phone path — the phone authenticates with the pairing code, not the runner token). |
| Bypass: per-session re-confirm (type `bypass` + checkbox), TTL 30 minutes and 10 runs (configurable `bypassTtlMs` / `bypassMaxRuns`), non-dismissible banner, every tool call under bypass appended to `~/.purser/audit.jsonl` with `bypassed: true`. | Accidental god-mode that never expires. |
| `run_bash` disabled by default; opt-in per workspace in Setup → Shell. When enabled, commands pass through an allowlist classifier; unknown syntax is treated as mutating. Irreversible patterns (`rm -rf`, `git reset --hard`, `curl \| sh`, …) are refused unless **Allow destructive shell** is on. Mutating commands snapshot the git working tree when possible; **Undo last shell command** is session-scoped. Network commands (`curl`, `wget`, …) are flagged on their own card. Execution requires `ApprovedShellCommand` through the same tool gate as file writes. | Prompt-injected shell that bypasses file-edit staging or exfiltrates data. |
| Hash-chained `audit.jsonl` (`prevHash` = SHA-256 of the previous canonical line), 64 MB rotation with `rotate_head`, `bun run purser -- audit verify`, optional `redactPaths`. Shell restore point ids are logged as `shell_restore_point`. | Tampering or truncation of the companion audit log. Same-user processes can still delete the files. |

## What is explicitly not defended

- A process running as the same OS user can read `~/.purser/secrets.json` (mode `0600`) and the SQLite file.
- Connecting to the runner via IPv6 loopback (`[::1]`) is rejected unless the user adds it to `allowedHosts`.
- Production token injection: the compiled companion injects `window.__PURSER_BOOTSTRAP__` into HTML at request time. `/__purser/config` is 404 on the runner. Vite still mounts the JSON route in development only. See [docs/RELEASING.md](RELEASING.md).
- Folder watch and host filesystem paths never go to a cloud API (README §4.2). That rule is not a local-attacker control.

## Document conversion (`read_document`)

- **Built-in (no extra install):** PDF (`pdf-parse`), Word (`mammoth`), Excel (`xlsx` / SheetJS).
- **Optional:** [MarkItDown](https://github.com/microsoft/markitdown) (MIT, Microsoft) via a subprocess when installed — PowerPoint, images with OCR, EPUB, ZIP, and other long-tail formats. Missing Python or MarkItDown degrades gracefully; install/build never depend on it.
- **Sandbox:** Only workspace-relative paths accepted; same resolver as `read_file`. No remote URLs. Subprocess invocations pass the absolute file path as an argument array element — never through a shell string.
- **Limits:** Default 50 MB input cap and 30 s convert timeout (Settings → Workspace). Converted markdown is cached under `~/.purser/doc-cache/` (mode `0600`), keyed by content hash.
- **Cost gate:** Token count uses the same path as the ledger. Documents over the threshold require explicit approval before entering context.
- **Network:** Conversion is local. Built-in converters do not fetch remote content. MarkItDown is only invoked on local files Purser has already resolved inside the workspace.

## Shell (`run_bash`)

- **Default:** off. Enable per workspace in Setup → Shell.
- **Classifier:** allowlist only (`ls`, `cat`, `git status`, `git diff` without `--output`, …). Chains split on `;`, `&&`, `||`, `|`, newline, and bare `&`. Anything not positively identified as read-only is mutating. Subshells, redirects, backticks, `$()`, and `eval` are unclassifiable → mutating.
- **Refused outright** (unless destructive shell is enabled): `rm -rf` / `rm -r`, `git reset --hard`, `git clean -f`, `git checkout -- .`, `git push --force`, `dd`, `mkfs`, `truncate`, `shred`, `chmod -R`, `chown -R`, and piping a download into a shell.
- **Undo:** before a mutating command, Purser records a git restore point when the workspace is a git repo and the tree is below a size cap. Undo is available for the current session only via Setup → **Undo last shell command**. Non-git folders show “No undo available” on the card.
- **Network:** `curl`, `wget`, `nc`, `ssh`, and similar commands are flagged as contacting the network. An enabled shell can reach the network; Purser itself adds no egress, but the model-invoked shell does.

## Secrets posture

- API keys: `~/.purser/secrets.json`, created `0600`, never SQLite.
- Runner token: `~/.purser/config.json`, `0600`.
- Audit log: `~/.purser/audit.jsonl`, `0600`. Redaction: no API keys, no file contents, no prompt bodies. Paths may appear on the companion.

## Relay honesty

The relay **does not store frames**. It **does forward them**. Before pairing completes it can read `pair` JSON (code + role). After pairing, Purser seals the JSON payload; the relay still sees ciphertext length and timing. Do not describe the relay as unable to read traffic unless you mean after the seal is in place.
