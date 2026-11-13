# docker/

`docker-compose.yml` runs PostgreSQL for local development. It holds API clients, keys and usage
counts, never game data.

```
docker compose -f docker/docker-compose.yml up -d
```

`api.Dockerfile` builds the API image.
