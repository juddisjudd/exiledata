# Contributing

Issues and pull requests are welcome. For anything larger than a fix, open an issue first so we
can agree on the approach.

## Setup

Follow [Development](./README.md#development) in the README. Use pnpm, the version pinned in
`packageManager`.

## Conventions

- TypeScript in strict mode.
- One package per job. Extend the shared types or schema instead of reaching into another
  package.
- `packages/schema` stays independent of where data comes from. Source-specific handling belongs
  in the ingestion packages.
- Never commit generated datasets, `.env` or secrets.
- Explain why a change was made in its commit message when the diff does not show it.

## Pull requests

`pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` must pass. CI runs the same four.
