# IDE bridge (VS Code and Cursor)

Cursor and VS Code are **clients**. They must not spawn agents themselves.

## Contract

1. Read `~/.purser/config.json` for `token` and `port`.
2. Connect `ws://127.0.0.1:<port>`.
3. Send `hello` with the same protocol as the web console.
4. On send, include the active file and selection as extra context in `send_message` text, or a future `editor_context` frame.

Shared types live in `@purser-sh/integrations` (`IdeHost`, `IdeBridgeHello`).

## Why not two products

One runner already sandboxes the disk. An extension that shells out to a second agent would double-spend tokens and skip permission cards.

Ship as:

- `extensions/vscode` — VS Code
- `extensions/cursor` — Cursor (same source, different `publisher` / `engines`)

This folder is the review surface for that split. Implementation of the marketplace extensions follows once the protocol review is signed off.
