# migrations/

Plain SQL migrations for PostgreSQL application/service state (API clients, keys, usage). Not
for game data — see the root README.

Apply them with the CLI, which reads `DATABASE_URL`:

```
pnpm exiledata db migrate
```

Files run in name order, each in a transaction, and are recorded in `schema_migrations`. Never
edit a migration that has been applied anywhere; add a new file instead. Tests apply every file
to an in-process Postgres (PGlite), so a migration that fails to parse fails `pnpm test`.
