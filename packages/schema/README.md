# @exiledata/schema

The record format that every dataset, API response and download follows. Ingestion maps the game
files into it, so the format stays the same when an extractor or the game files change shape.

## Field groups

Every record extends `CanonicalEntity` (`src/common/entity.ts`) and keeps four kinds of data
apart:

| Field                         | Holds                                                     | Stable                        |
| ----------------------------- | --------------------------------------------------------- | ----------------------------- |
| Top-level fields, e.g. `name` | Normalized values ExileData documents                     | Yes; changes bump the version |
| `source`                      | Where the record came from: name, version, time, locator  | Yes                           |
| `ext`                         | Every other field from the game files, under its own name | No; follows the game files    |
| `derived`                     | Values ExileData computes itself                          | Empty today                   |

`source` is a list, so a record could combine several sources. Today each record has one.

A field in `ext` moves to the top level once it proves useful and stable, in a new schema
version.

## Games

PoE 1 and PoE 2 records are separate. Both follow the conventions above, and their `ext` fields
differ where the games do.

## Contents

- `CanonicalEntity`, `SourceProvenance`, `EntityVersionInfo` and `Game`: the shared shape.
- `BaseItem`: the only entity ingested today.
- `DatasetMetadata` and `Dataset`: what a dataset file holds.
- `SCHEMA_VERSION`: bump it when the shape of any entity changes. Every record and dataset carries
  it.
