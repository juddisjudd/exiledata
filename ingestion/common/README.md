# @exiledata/ingestion-common

Shared ingestion pipeline used by `ingestion/poe1` and `ingestion/poe2`.

## Conceptual flow

```
source → parser → normalized model → validator → dataset
```

- **`IngestionSource`** — fetches raw upstream data. No parsing.
- **`Parser`** — turns raw data into a source-shaped intermediate representation.
- **`Normalizer`** — maps parsed data into canonical `@exiledata/schema` entities, populating
  `source`, `ext`, and `derived` per the schema's conventions.
- **`Validator`** — validates normalized entities before they're included in a dataset.
- **`IngestionStage`** / **`runStage`** — ties the above together for a single entity type and
  reports structured errors and warnings per stage.

## GGPK extracts

`src/extract/` reads the directories ggpk-explorer exports. PoE 1 and PoE 2 extracts share one
format, so the base-item stage is written once here and takes the game as a parameter. Each game
package binds it (`createBaseItemsStage(extractDir)`), which is where game-specific handling goes
when the formats diverge.
