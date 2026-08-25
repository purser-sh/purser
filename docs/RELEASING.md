# Releasing AgentDeck

Companion binaries are `bun build --compile` outputs with the Vite UI embedded (`--asset ./ui`). First run creates `~/.agentdeck/config.json` (mode `0600`), serves the UI from the runner port, injects the token into HTML at request time, and opens the browser. **The token is never printed.**

## Local compile (current platform)

```bash
bun run compile
```

Writes `dist/bin/agentdeck-<os>-<arch>` and `dist/bin/SHA256SUMS`. Cross-compile every Phase 5 target:

```bash
bun run compile:all
```

Targets: `bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`, `bun-windows-x64`.

`apps/runner/ui` is a staged copy of `apps/web/dist` and is gitignored. The compile script rebuilds it.

## What the binary does

- Serves `/` and `/phone` from the embedded UI. `/__agentdeck/config` is **404** (the Vite dev route is closed in the package).
- HTML is Host-allowlisted. Document navigations may omit `Origin` but must send `Sec-Fetch-Site: none|same-origin|same-site`. curl without those headers does not receive the injected token.
- `agentdeck audit verify` checks `~/.agentdeck/audit.jsonl`.
- `AGENTDECK_NO_BROWSER=1` skips opening the browser.

## GitHub Actions

`.github/workflows/release.yml` on tag `v*`:

1. Ubuntu: `bun test`, `typecheck`, `compile:all`, upload artifacts.
2. macOS: codesign + `notarytool` **only if Apple secrets are set**.
3. Windows: Authenticode **only if Authenticode secrets are set**.
4. Draft GitHub release with binaries + `SHA256SUMS`.

Unsigned checksummed binaries are still attached when signing secrets are absent. Do not describe those as notarized.

## Secrets (repo or org)

Store these in GitHub Actions secrets. They never go in git, SQLite, or `config.json`.

| Secret | Used for |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | Base64-encoded Developer ID Application `.p12` |
| `APPLE_CERTIFICATE_PASSWORD` | Password for that `.p12` |
| `APPLE_CODESIGN_IDENTITY` | Exact codesign identity string (`Developer ID Application: …`) |
| `APPLE_API_KEY` | App Store Connect API key `.p8` body |
| `APPLE_API_KEY_ID` | Key id |
| `APPLE_API_ISSUER` | Issuer UUID |
| `AUTHENTICODE_PFX` | Base64-encoded Authenticode `.pfx` |
| `AUTHENTICODE_PFX_PASSWORD` | Password for that `.pfx` |

There is no Apple Team ID or Authenticode certificate in this repository. Until those secrets exist, CI ships **unsigned** binaries.

## install.sh and Homebrew

```bash
AGENTDECK_REPO=owner/name AGENTDECK_VERSION=v0.0.1 sh install.sh
```

Verifies `SHA256SUMS` then installs `agentdeck` into `$AGENTDECK_PREFIX/bin` (default `/usr/local`).

`Formula/agentdeck.rb` is a tap template. Its `sha256` values are zeros until the first real release; `brew install` will fail checksum until a human (or the release job) replaces them. There is no public Homebrew tap yet.

## Honest gaps

- linux-arm64 is not a Phase 5 target.
- `[::1]` is still not on the default Host allowlist.
- Cross-compiled darwin binaries are unsigned unless the macOS signing job ran with secrets.
- `install.sh` needs `AGENTDECK_REPO`; this clone may not have a GitHub remote yet.
