# migrations/

Plain SQL migrations for PostgreSQL application/service state (API clients, keys, dataset
metadata, usage). Not for game data — see the root README.

No migration runner is wired up yet. Apply manually during scaffolding, e.g.:

```
psql "$DATABASE_URL" -f migrations/0001_initial.sql
```
