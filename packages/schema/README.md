# @exiledata/schema

The canonical ExileData schema. This is the most important package in the repository — it
defines the stable data model that the API, SDK, CLI, and datasets are built around.

## Why a canonical schema, not RePoE's/PoEDB's schema

Upstream sources (RePoE, PoEDB, others added later) are **inputs**, not the ExileData contract.
Their formats change, disagree with each other, and contain source-specific quirks that
shouldn't leak into a stable public API. `packages/schema` defines ExileData's own concepts;
ingestion packages are responsible for mapping upstream data into this shape.

## Field conventions

Every canonical entity (see `CanonicalEntity` in `src/common/entity.ts`) distinguishes four kinds
of data:

| Group                                | Field                                              | Meaning                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable ExileData concept             | top-level typed fields (e.g. `name`, `baseItemId`) | Normalized, documented, part of the public contract. Changes are versioned.                                                                  |
| Provenance                           | `source`                                           | Where the data came from (name/version/retrievedAt). Never mixed into normalized fields, so a record can have multiple contributing sources. |
| Source-specific / not-yet-normalized | `ext`                                              | Raw or source-specific fields not yet promoted to a stable concept. Not part of the public contract and may change shape.                    |
| Derived                              | `derived`                                          | Values ExileData computes itself (aggregates, resolved refs, normalized ranges) that don't exist verbatim in any upstream source.            |

This separation exists so:

- the public API/SDK can be documented and versioned independently of upstream churn,
- new upstream sources can be added without redesigning the schema,
- consumers can tell the difference between "ExileData guarantees this" and "this is raw
  passthrough data, use at your own risk".

## Game independence

`PoE 1` and `PoE 2` are modeled independently (see `Game` in `src/common/entity.ts`). They share
schema _conventions_ (the same `CanonicalEntity` shape, the same entity concepts) but not data —
a PoE 1 `Item` and a PoE 2 `Item` are distinct records, potentially with different fields in
`ext`/`derived` as the games diverge.

## Status

This package currently contains **placeholders and extension points**, not a complete data
model. Entities are intentionally minimal:

- `Tag`, `Stat`, `ModifierGroup`, `Modifier`
- `BaseItem`, `UniqueItem`, `Item`
- `Skill`, `SkillGem`, `SupportGem`
- `Passive`, `PassiveTree`

Expect breaking changes as real ingestion work informs the model. Bump `schemaVersion` in
`EntityVersionInfo` when making breaking changes to any entity shape.

## Dataset & versioning types

`src/common/dataset.ts` defines `DatasetMetadata` (what ships with a generated dataset) and
`DatasetDiff` (the shape of a comparison between two dataset versions). See the root README for
the dataset storage model — generated datasets are never committed to this repository.
