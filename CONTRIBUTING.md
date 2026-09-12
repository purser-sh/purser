# Contributing

Thanks for wanting to help. Keep changes small and tied to a claim the product already makes.

## Setup

Requires [Bun](https://bun.sh) ≥ 1.3.14.

```bash
git clone https://github.com/purser-sh/purser
cd purser
bun install
```

Run the companion + web console with `bun run dev`. Use the Echo provider first to confirm the console works.

## Checks before you open a PR

```bash
bun run typecheck && bun test
```

Both must pass with zero failures.

## What a good PR looks like

- One concern per PR. Do not mix a docs tweak with an enforcement change.
- Say what claim you are defending or what user-visible failure you fixed.
- Prefer a failing test that names the claim, then the fix.
- Any PR that touches an enforcement point needs a test named after the claim it defends.
