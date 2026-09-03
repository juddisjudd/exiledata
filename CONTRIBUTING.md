# Contributing to ExileData

ExileData is currently a private, early-stage infrastructure project. This document will
expand as the project stabilizes.

## Development setup

1. Install [pnpm](https://pnpm.io/) (do not use npm or yarn).
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env` and adjust as needed.
4. Start local infrastructure: `docker compose -f docker/docker-compose.yml up -d`
5. Run builds/tests: `pnpm build`, `pnpm test`

## Conventions

- TypeScript everywhere, strict mode on.
- One package = one responsibility. Avoid cross-package hacks; extend shared types/schema instead.
- Do not commit generated datasets or large fixtures.
- Do not commit `.env` or secrets.
- Keep the canonical schema (`packages/schema`) upstream-agnostic. Source-specific quirks belong
  in ingestion packages, not the schema.

## Commit style

Use clear, descriptive commit messages. Explain _why_ a change was made when it isn't obvious
from the diff itself.

## Pull requests

Ensure `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` all pass before opening a PR.
