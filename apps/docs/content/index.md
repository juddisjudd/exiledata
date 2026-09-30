# ExileData documentation

ExileData serves Path of Exile 1 and 2 game data over HTTP. Each game patch becomes its own dataset of normalized records, so your tool reads JSON instead of parsing game files. Query the data through the API with a key, or [download](./downloads.md) whole patches without one.

> ExileData is in preview. The API can change between releases, and every change is listed in the [changelog](./changelog.md).

## Quick start

### 1. Get an API key

Every request under `/v1` needs a key. Keys are issued by hand during the preview, so ask [@juddisjudd](https://github.com/juddisjudd) for one.

Keep the key out of client-side code and public repositories. The examples in these docs read it from an environment variable:

```sh
$ export EXILEDATA_KEY="exd_..."
```

### 2. Make a request

Ask for the first amulet base in the latest Path of Exile 2 patch:

```sh
$ curl -H "x-api-key: $EXILEDATA_KEY" \
    "https://api.exiledata.dev/v1/poe2/bases?itemClass=Amulet&limit=1"
```

```json
{
  "data": [
    {
      "id": "Metadata/Items/Amulets/FourAmulet1",
      "name": "Crimson Amulet",
      "itemClass": "Amulet",
      "version": { "schemaVersion": "0.2.0", "game": "poe2", "gameVersion": "4.5.5.3" },
      "source": [ … ],
      "ext": { "drop_level": 1, "implicit_text": ["(2-4) Life Regeneration per second"], … }
    }
  ],
  "meta": { "game": "poe2", "gameVersion": "4.5.5.3", "total": 25 }
}
```

### 3. Pin the patch

`meta.gameVersion` names the patch that answered. Without `?version=`, you always get the newest patch, so the data can change under you when a new patch ships. To keep it fixed, send the patch you tested against:

```sh
$ curl -H "x-api-key: $EXILEDATA_KEY" \
    "https://api.exiledata.dev/v1/poe2/bases?version=4.5.5.3&itemClass=Amulet"
```

[Datasets and versions](./datasets.md) explains how patches are published and replaced.

## What is available

| Data                      | Endpoint                           | Status                            |
| ------------------------- | ---------------------------------- | --------------------------------- |
| Base items                | `GET /v1/{game}/bases`             | Available for both games          |
| Items, mods, gems, skills | `GET /v1/{game}/items` and similar | Planned. These return `501` today |
| Every exported game file  | [Downloads](./downloads.md)        | Available for both games, no key  |
| Path of Building trees    | [Downloads](./downloads.md)        | Available for both games, no key  |

`{game}` is `poe1` or `poe2`. `GET /v1/versions` lists every published patch.

## Where to go next

- [Authentication](./authentication.md): sending the key, rate limits, error codes.
- [Record format](./schema.md): what each field means and which fields are stable.
- [API reference](/api): every endpoint and parameter.
- [Downloads](./downloads.md): every file of a patch as JSON, without a key.

There is no published SDK yet. The [OpenAPI document](/openapi.json) works with client generators and with tools such as Postman or Insomnia.
