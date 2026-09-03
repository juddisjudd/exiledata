-- Application/service state only. Game data (items, mods, gems, etc.) is never stored here —
-- see the root README's "Database" section for why.

CREATE TABLE api_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES api_clients (id) ON DELETE CASCADE,
    key_hash TEXT NOT NULL UNIQUE,
    rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dataset_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game TEXT NOT NULL,
    game_version TEXT NOT NULL,
    dataset_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL,
    UNIQUE (game, dataset_version)
);

CREATE TABLE api_key_usage (
    id BIGSERIAL PRIMARY KEY,
    api_key_id UUID NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    path TEXT NOT NULL,
    status_code INTEGER NOT NULL
);
