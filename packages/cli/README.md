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

## Downloads

```
exiledata downloads publish --game poe1|poe2 --extract-dir <path> [--dry-run] [--overwrite]
exiledata downloads list
```

`publish` puts a patch on https://data.exiledata.dev. Ingest the patch first: the normalized
records come from its dataset. It uploads, under `downloads/{game}/{patch}/`:

- every `X.json` and `X.min.json` pair from the extract, top level plus the `base_items`,
  `passive_skill_trees` and `stat_translations` folders (the extractor's report and images are
  left out);
- `normalized/base_items.json` and `.min.json`, the records the API serves;
- `{game}-{patch}.zip` with every minified file;
- `manifest.json` with each file's size, SHA-256, record count and description.

It writes the manifest after the files and `downloads/index.json` last, so the index never lists
a patch whose files are missing. It refuses to replace a published patch without `--overwrite`.
Files are served as immutable, so an overwrite does not reach copies already cached. Descriptions
come from `src/file-descriptions.ts`; add a line there when the extractor gains a file.

`list` prints the published patches from the index. Both commands use the storage that
`DATASET_STORAGE_DRIVER` selects, so set it to `r2` to publish to production.

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
