# Data sources

All data comes from the game client's own files. Nothing is scraped from websites, and no request to the API waits on a third party.

## How a dataset is built

1. **Extract.** The game files of a patch are exported ahead of time into JSON, one file per kind of data.
2. **Normalize.** ExileData maps each exported entry into a record: stable fields at the top level, the rest in `ext`.
3. **Validate.** Every record needs a unique id, a name, the right game, and a source. A patch with any invalid record is not published.
4. **Publish.** The records are stored as one dataset for that patch, and the API serves them from there. The exported files and the records are also published as [downloads](./downloads.md).

Building happens offline. The API only reads datasets that are already published.

## Provenance

Every record says where it came from in its `source` field:

```json
{
  "name": "poe2-ggpk-extract",
  "version": "0.5.5.4",
  "retrievedAt": "2026-10-06T02:30:14.967Z",
  "locator": "base_items.json#Metadata/Items/Amulets/FourAmulet1"
}
```

| Field         | Meaning                                                   |
| ------------- | --------------------------------------------------------- |
| `name`        | Which source: `poe1-ggpk-extract` or `poe2-ggpk-extract`. |
| `version`     | The game patch the files came from.                       |
| `retrievedAt` | When the files were read.                                 |
| `locator`     | The exported file and the entry in it.                    |

`source` is a list so that a record can combine several sources later. Today each record has exactly one.

## Game data ownership

Path of Exile game data, names and assets belong to Grinding Gear Games. ExileData is an independent community project. It is not affiliated with or endorsed by Grinding Gear Games, and it is not an official source of Path of Exile data.
