# @exiledata/ingestion-common

Shared ingestion pipeline interfaces used by `ingestion/poe1` and `ingestion/poe2`.

## Conceptual flow

```
source → parser → normalized model → validator → dataset
```

- **`IngestionSource`** — fetches raw upstream data (RePoE JSON, PoEDB HTML, etc). No parsing.
- **`Parser`** — turns raw data into a source-shaped intermediate representation.
- **`Normalizer`** — maps parsed data into canonical `@exiledata/schema` entities, populating
  `source`, `ext`, and `derived` per the schema's conventions.
- **`Validator`** — validates normalized entities before they're included in a dataset.
- **`IngestionStage`** / **`IngestionRunResult`** — ties the above together for a single entity
  type and reports structured errors per stage.

This package intentionally contains **interfaces only**. Concrete implementations (actually
downloading and parsing RePoE/PoEDB data) belong in `ingestion/poe1` and `ingestion/poe2`.
