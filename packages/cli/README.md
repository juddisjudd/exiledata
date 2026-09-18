# @exiledata/cli

Operations CLI for ExileData. Run it from the repository root with `pnpm exiledata <command>`,
which loads `.env`. It runs against the built workspace packages, so run `pnpm build` first.

## Datasets

```
exiledata ingest --game poe1|poe2 --extract-dir <path> [--dry-run] [--overwrite]
exiledata datasets list [--game poe2]
exiledata datasets delete --game poe2 --patch 4.5.5.3 --yes
```

`ingest` normalizes a GGPK extract's base items and writes `{game}/{patch}/dataset.json`, taking
the patch from the extract's `version.txt`. It refuses to replace an existing patch without
`--overwrite`. All three commands use the storage that `DATASET_STORAGE_DRIVER` selects.

## Database

```
exiledata db migrate [--baseline 0001_initial.sql]
```

Applies pending `migrations/*.sql` to `DATABASE_URL`, each in its own transaction. `--baseline`
marks migrations up to that file as applied without running them, for a database set up by hand.

## API keys

```
exiledata keys list
exiledata keys create --client <name> [--rate-limit <n>]
exiledata keys limit <key-id> <requests-per-minute>
exiledata keys revoke <key-id>
```

These call the admin API with `ADMIN_TOKEN`, so the hashing secret stays on the server. They
target `https://api.exiledata.dev` unless `EXILEDATA_API_URL` or `--api-url` names another API.

`validate`, `build`, `diff` and `inspect` are placeholders.
