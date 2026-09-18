# Downloads

<!-- downloads-browser -->

## Addresses

Each file has a permanent address:

```
https://data.exiledata.dev/{game}/{patch}/{file}
```

For example, [`https://data.exiledata.dev/poe2/4.5.5.3/mods.min.json`](https://data.exiledata.dev/poe2/4.5.5.3/mods.min.json). A file at a patch address never changes, so you can cache it for good.

To follow the newest patch, write `latest` instead of the patch. `latest` redirects to the patch address, and every file response carries an `x-exiledata-patch` header, so you always know which patch you got.

| What                  | Address                                                                          |
| --------------------- | -------------------------------------------------------------------------------- |
| Every published patch | [`https://data.exiledata.dev/index.json`](https://data.exiledata.dev/index.json) |
| One patch's file list | `https://data.exiledata.dev/{game}/{patch}/manifest.json`                        |
| One patch, zipped     | `https://data.exiledata.dev/{game}/{patch}/{game}-{patch}.zip`                   |

The files allow cross-origin requests, so a browser tool can fetch them directly.

## What each patch contains

- **Game files.** The JSON exported from the game client, one file per kind of data, as described in [Data sources](./sources.md). Their fields follow the game files and can change between patches.
- **`normalized/`.** ExileData records in the [record format](./schema.md). Today that is `base_items.json`, the same records `GET /v1/{game}/bases` serves.
- **`manifest.json`.** Every file with its size, SHA-256 checksum and record count, so you can check a download or skip files you already have.
- **The zip.** Every minified file of the patch in one archive.

Each file comes twice: `name.json` is indented for reading, and `name.min.json` is the same data minified. Images from the game files are not published yet.

## Files or the API

Download files when you want a whole patch, for example to bundle it with your tool or load it into your own database. Use the [API](/api) when you want a few records at a time, filtered and paged for you. The API needs a key and is rate-limited; the files need neither.
