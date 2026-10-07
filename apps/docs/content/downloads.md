# Downloads

<!-- downloads-browser -->

## Addresses

Each file has a permanent address:

```
https://data.exiledata.dev/{game}/{patch}/{file}
```

For example, [`https://data.exiledata.dev/poe2/0.5.5.4/mods.min.json`](https://data.exiledata.dev/poe2/0.5.5.4/mods.min.json). A file at a patch address never changes, so you can cache it for good.

To follow the newest patch, write `latest` instead of the patch. `latest` redirects to the patch address, and every file response carries an `x-exiledata-patch` header, so you always know which patch you got.

| What                     | Address                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| Every published patch    | [`https://data.exiledata.dev/index.json`](https://data.exiledata.dev/index.json)   |
| One patch's file list    | `https://data.exiledata.dev/{game}/{patch}/manifest.json`                          |
| One patch's JSON, zipped | `https://data.exiledata.dev/{game}/{patch}/{game}-{patch}.zip`                     |
| One PoB tree, zipped     | `https://data.exiledata.dev/{game}/{patch}/{game}-{patch}-pob-tree-{tree}.zip`     |
| Patches not out yet      | [`https://data.exiledata.dev/status.json`](https://data.exiledata.dev/status.json) |

The files allow cross-origin requests, so a browser tool can fetch them directly.

## When a new patch is late

New patches are published within six hours. Some patches change how the game lays out its data tables, and the export then waits for the community schema, [dat-schema](https://github.com/poe-tool-dev/dat-schema), to catch up. A notice at the top of this page says which patch is waiting and why, and `status.json` holds the same notice for tools: the game, the patch, the newest published patch, and the tables that changed. Until then, `latest` keeps pointing at the newest published patch.

## What each patch contains

- **Game files.** The JSON exported from the game client, one file per kind of data, as described in [Data sources](./sources.md). Their fields follow the game files and can change between patches. The [File map](./file-map.md) shows which fields join the files.
- **`normalized/`.** ExileData records in the [record format](./schema.md). Today that is `base_items.json`, the same records `GET /v1/{game}/bases` serves.
- **`pob_tree/`.** Path of Building's passive tree data, laid out like PoB's `src/TreeData`. There is one folder per tree, named as in PoB, such as `0_5`, `3_29` or `3_29_ruthless`. Each holds `tree.lua` and the tree images.
- **`manifest.json`.** Every file with its size and SHA-256 checksum, plus the record count of each JSON file, so you can check a download or skip files you already have.
- **The zips.** Every minified JSON file of the patch in one archive, and each PoB tree in an archive of its own. A tree archive holds one folder, such as `0_5/`, so it unpacks straight into `src/TreeData`.

Each JSON file comes twice: `name.json` is indented for reading, and `name.min.json` is the same data minified. Files in `pob_tree/` come once, in the form PoB reads. Item, skill and buff icons from the game files are not published yet.

## Files or the API

Download files when you want a whole patch, for example to bundle it with your tool or load it into your own database. Use the [API](/api) when you want a few records at a time, filtered and paged for you. The API needs a key and is rate-limited; the files need neither.
