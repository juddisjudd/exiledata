# docker/

Local development infrastructure. Currently just PostgreSQL, which holds application/service
state (API clients, keys, dataset metadata, usage) — not game data itself (see root README's
"Database" section).

```
docker compose -f docker/docker-compose.yml up -d
```
