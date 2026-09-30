# Changelog

Changes to the API, the record format and the published datasets, newest first.

## 2026-09-29

### Breaking changes

- **`min` and `records` can be missing in `manifest.json`.** Files in `pob_tree/` are published once and have no record count. Check for `min` before you use it.

### Added

- Path of Building passive tree data in [Downloads](./downloads.md). Each patch has a `pob_tree/` folder laid out like PoB's `src/TreeData`, one folder per tree, and a zip for each tree.
- `trees` in `manifest.json` lists the tree zips.

## 2026-09-18

### Breaking changes

- **API keys are required.** Every `/v1` request needs a key in `x-api-key` or `Authorization: Bearer`. Requests without one get `401`. See [Authentication](./authentication.md).
- **Datasets are keyed by game patch.** `?version=` now takes a patch such as `4.5.5.3`, not a date-based dataset version.
- **`meta.datasetVersion` is now `meta.gameVersion`** in list responses.
- **Schema version 0.2.0.** Dataset metadata no longer has `datasetVersion`; `gameVersion` identifies a dataset.
- **Out-of-range paging is an error.** `limit` outside 1 to 1000, or a negative `offset`, now returns `400 invalid_request` instead of being adjusted silently.

### Added

- Path of Exile 1 base items, from patch `3.29.3.3`.
- Rate limits per key, reported in `x-ratelimit-*` headers.
- The OpenAPI document at `https://api.exiledata.dev/openapi.json`.
- Every error, including unknown routes, now uses the `{ "error", "message" }` body.
- [Downloads](./downloads.md) at `https://data.exiledata.dev`: every exported game file and the normalized records of each patch, with a manifest and a zip per patch. No key is needed.

### Datasets

- Published `poe1` `3.29.3.3`: 5,041 base items.
- Published `poe2` `4.5.5.3`: 5,075 base items.
- Removed `poe2` `4.5.4.11`, which used the old version scheme.
- `ext` now keeps every field from the game files. Before, a fixed list was copied, which dropped fields such as `grants_buff` and `skills_granted_no_reservation`.

## 2026-09-04

### Added

- First dataset: Path of Exile 2 base items from patch `4.5.4.11`.
- `GET /v1/{game}/bases` and `GET /v1/versions`.
