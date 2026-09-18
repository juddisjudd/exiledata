# Datasets and versions

ExileData publishes one dataset per game patch. A request always reads from exactly one of them, and the response says which.

## One dataset per patch

A dataset holds every record ExileData builds from one patch of one game, for example Path of Exile 2 patch `4.5.5.3`. The patch number is the game client's own version, so it matches what the game reports.

List the published datasets with `GET /v1/versions`:

```sh
$ curl -H "x-api-key: $EXILEDATA_KEY" "https://api.exiledata.dev/v1/versions"
```

```json
{
  "datasets": [
    {
      "game": "poe1",
      "gameVersion": "3.29.3.3",
      "generatedAt": "2026-09-18T16:14:25.635Z",
      "schemaVersion": "0.2.0",
      "sources": [ … ]
    },
    {
      "game": "poe2",
      "gameVersion": "4.5.5.3",
      "generatedAt": "2026-09-18T16:14:26.911Z",
      "schemaVersion": "0.2.0",
      "sources": [ … ]
    }
  ]
}
```

## Choosing a patch

Data endpoints take an optional `version` query parameter:

- **Without it**, the highest published patch for that game answers. Patches compare as numbers, so `4.5.10.0` is higher than `4.5.9.3`.
- **With it**, that exact patch answers, or you get `404 unknown_game_version` if it is not published.

Either way, `meta.gameVersion` in the response names the patch that answered. Store it next to anything you derive from the data.

## Pinning

Reading the latest patch is convenient, but the data changes as soon as a new patch ships. If your tool depends on exact values, pin a patch:

1. Read without `version` once, and note `meta.gameVersion`.
2. Send that value as `?version=` from then on.
3. Move to a newer patch when you are ready, after checking the [changelog](./changelog.md).

## Rebuilds

A patch can be rebuilt, for example to fix how a field is read from the game files. A rebuild replaces the dataset for that patch and changes its `generatedAt`, and records can change even though the patch number stays the same.

During the preview, older patches can also be removed. The changelog lists every rebuild and removal.

## Schema version

`schemaVersion` says which version of the [record format](./schema.md) a dataset follows. It changes when the shape of records changes, not when game data changes. Every record carries it in `version.schemaVersion` as well.

Schema changes can break clients while ExileData is in preview, and each one gets a changelog entry that says what to update.
