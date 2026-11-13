# migrations/

Plain SQL migrations for PostgreSQL: API clients, keys and usage. Game data does not live in the
database.

Apply them with the CLI, which reads `DATABASE_URL`:

```
pnpm exiledata db migrate
```

Files run in name order, each in a transaction, and are recorded in `schema_migrations`. Never
edit a migration that has been applied anywhere; add a new file instead. Tests apply every file
to an in-process Postgres (PGlite), so a migration that fails to parse fails `pnpm test`.
