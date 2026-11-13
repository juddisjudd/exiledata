# @exiledata/ingestion-common

The ingestion pipeline shared by `ingestion/poe1` and `ingestion/poe2`. A stage reads one entity
type through four steps:

```
source → parser → normalizer → validator → dataset
```

The source fetches raw data and does no parsing. The parser turns it into a source-shaped list.
The normalizer maps that into `@exiledata/schema` records, filling `source` and `ext`. The
validator checks the records before they go into a dataset. `runStage` runs all four and collects
errors and warnings per step instead of throwing.

## GGPK extracts

`src/extract/` reads the folders ggpk-explorer exports. PoE 1 and PoE 2 extracts share one
format, so the base-item stage is written once here and takes the game as a parameter. Each game
package binds it (`createBaseItemsStage(extractDir)`), and game-specific handling goes there when
the formats diverge.
