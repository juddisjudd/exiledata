# Datasets and versions

ExileData publishes one dataset per game patch. A request always reads from exactly one of them, and the response says which.

## One dataset per patch

A dataset holds every record ExileData builds from one patch of one game, for example Path of Exile 2 patch `0.5.5.4`. The patch number is the game client's own version, so it matches what the game reports.

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
      "gameVersion": "0.5.5.4",
      "generatedAt": "2026-10-06T02:30:14.967Z",
      "schemaVersion": "0.2.0",
      "sources": [ … ]
    }
  ]
}
```

## Choosing a patch

Data endpoints take an optional `version` query parameter:

- **Without it**, the newest published patch for that game answers. Patches compare as numbers, so `0.5.10.0` is newer than `0.5.9.3`. The old Path of Exile 2 numbers below are the one exception.
- **With it**, that exact patch answers, or you get `404 unknown_game_version` if it is not published.

Either way, `meta.gameVersion` in the response names the patch that answered. Store it next to anything you derive from the data.

## Path of Exile 2 patch numbers

Path of Exile 2 patches used `4.x` numbers until October 2026. Grinding Gear Games then renumbered them to `0.x`, and the patch after `4.5.5.4` is `0.5.5.4`. Path of Exile 1 still uses `3.x`.

The old `4.x` patches stay published, so a request pinned to one keeps working. ExileData sorts them before every `0.x` patch, so the newest patch still answers when you leave out `version`. If you sort patch numbers yourself, do the same: for `poe2`, a `4.x` patch is older than any `0.x` or `1.x` patch.

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
