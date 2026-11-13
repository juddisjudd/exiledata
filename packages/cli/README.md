# @exiledata/cli

Operations CLI for ExileData. Run it from the repository root with `pnpm exiledata <command>`,
which loads `.env`. It runs against the built workspace packages, so run `pnpm build` first.

## Datasets

```
exiledata ingest --game poe1|poe2 --extract-dir <path> [--dry-run] [--overwrite]
exiledata datasets list [--game poe2]
exiledata datasets delete --game poe2 --patch 0.5.5.4 --yes
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
- every file in the tree folders of `pob_tree/`, such as `pob_tree/0_5/`, as it is. These are
  Path of Building's `src/TreeData` files. Files at the root of `pob_tree/` are the exporter's
  own and are left out, and an extract without `pob_tree/` publishes without trees;
- `{game}-{patch}.zip` with every minified file;
- `{game}-{patch}-pob-tree-{tree}.zip` for each tree, holding `{tree}/...`. Images and `.zst`
  files are stored in it uncompressed, since they are compressed already;
- `manifest.json` with each file's size, SHA-256 and description, the record count and `min`
  variant of each JSON file, and the tree zips under `trees`.

It writes the manifest after the files and `downloads/index.json` last, so the index never lists
a patch whose files are missing. It refuses to replace a published patch without `--overwrite`.
Files are served as immutable, so an overwrite does not reach copies already cached. Descriptions
come from `src/file-descriptions.ts`; add a line there when the extractor gains a file.

`list` prints the published patches from the index. Both commands use the storage that
`DATASET_STORAGE_DRIVER` selects, so set it to `r2` to publish to production.

## Patches

```
exiledata patch [poe1] [poe2]
exiledata update [poe1] [poe2] [--check] [--force] [--dry-run] [--work-dir work]
```

`patch` prints each game's current patch, as GGG's patch servers report it to the game client.

`update` compares that patch with the latest one in `downloads/index.json`. For each game that
is behind, it runs ggpk-explorer against the patch CDN, then ingests and publishes the result:

```
ggpk-explorer export-data --cdn <patch> --<game> --trade-stats --strip-null -o <work>/<game> [--schema <DAT_SCHEMA>]
ggpk-explorer export-tree --cdn <patch> --<game> --flat -o <work>/<game>/<patch>-stripped/pob_tree [--schema <DAT_SCHEMA>]
```

- `--check` only prints the comparison. Under GitHub Actions it also writes
  `stale=<games>` to `GITHUB_OUTPUT`. A game whose published patch has no saved tables yet
  counts too.
- `--force` treats every game as behind, and replaces the dataset and the published patch.
  Without it, a dataset already in storage is kept and only the downloads are published.
- `--dry-run` exports and builds everything but writes nothing to storage.

Each export's `export_report.json` names the tables the patch moved (`refused` or `skipped`). For
those, `update` downloads the previous patch's saved tables and the layouts it was published with,
and re-fits them:

```
ggpk-explorer refit --cdn <patch> --<game> --old <published> --old-dir <tables> --table <A,B> --write --strict
```

It then exports again and publishes only if nothing is left refused. After a publish it saves the
patch's tables (`refit --save`) to `refit/<game>/<patch>/` for the next patch. Each game keeps its
re-fitted layouts in `<work>/<game>/schema_overrides.json` (`GGPK_EXPLORER_OVERRIDES`).

A game that cannot be published is written to `downloads/status.json`: `waiting` when tables
did not re-fit, `failed` for anything else, with the patch, the newest published patch and the
time it first failed. A later publish of that game clears it.

ggpk-explorer's output goes to `<work>/<game>/<patch>.log`. When it exits with an error, the
end of its output is printed. A game that fails does not stop the other one, but `update` exits
with an error. The binary is `ggpk-explorer` on `PATH` unless `GGPK_EXPLORER` names another.
`DAT_SCHEMA`, when set, is passed as `--schema`.

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
