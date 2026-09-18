# Record format

Every record has the same outer shape, whatever it describes. Fields at the top level are the stable contract. Everything else from the game files sits in `ext`.

## Common fields

| Field     | Meaning                                                         |
| --------- | --------------------------------------------------------------- |
| `id`      | Stable id. The same game entity keeps its id across patches.    |
| `version` | `schemaVersion`, `game` and `gameVersion` of this record.       |
| `source`  | Where the record came from. See [Data sources](./sources.md).   |
| `ext`     | Every other field from the game files, under its original name. |
| `derived` | Values ExileData computes itself. Empty today.                  |

## Stable fields and `ext`

Top-level fields such as `name` and `itemClass` are normalized and documented. A change to one of them is a schema change, announced in the [changelog](./changelog.md).

`ext` keeps the game files' own field names and values, unchanged. Nothing is dropped, so you can reach data that ExileData has not normalized yet. The trade-off is that `ext` is not a stable contract: its fields follow the game files and can differ between games and patches. Read `ext` defensively, and expect fields to appear or disappear.

When a field in `ext` proves useful and stable, it is promoted to a top-level field in a later schema version.

## Base items

A base item is the template for an item type before any modifiers, such as Crimson Amulet or Iron Ring. Read them with `GET /v1/{game}/bases`.

| Field       | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| `id`        | The game's metadata path, e.g. `Metadata/Items/Amulets/FourAmulet1`.   |
| `name`      | Display name, e.g. `Crimson Amulet`.                                   |
| `itemClass` | The game's item class, e.g. `Amulet`. Filter on it with `?itemClass=`. |

Fields usually present in `ext` for base items:

| Field                                 | Meaning                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`                              | Which modifier pool the base draws from, e.g. `item` or `flask`. `"undefined"` means the base cannot take modifiers, as with most currency. |
| `drop_level`                          | Level at which the base starts to drop.                                                                                                     |
| `implicits`, `implicit_text`          | Implicit modifier ids and their text.                                                                                                       |
| `inherits_from`                       | The abstract base this item extends in the game files.                                                                                      |
| `inventory_width`, `inventory_height` | Size in inventory cells.                                                                                                                    |
| `properties`                          | Class-specific values, such as damage for weapons or stack size for currency.                                                               |
| `release_state`                       | Whether the base is released in the game.                                                                                                   |
| `requirements`                        | Level and attribute requirements, when the base has them.                                                                                   |
| `tags`                                | The game's tags for the base.                                                                                                               |
| `visual_identity`                     | Art reference for the item icon.                                                                                                            |

Game-specific fields also appear, for example `skills_granted` on Path of Exile 2 bases that grant a skill.

## What is left out

The game files contain internal placeholder entries with no name, such as `RandomFossilOutcome*`. These are not real items, so ExileData leaves them out. There are about 420 of them per game.

The full field list for every shape is in the [API reference](/api#schemas).
