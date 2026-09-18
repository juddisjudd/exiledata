-- API key enforcement: display prefixes, last-use tracking, and hourly usage rollups.

ALTER TABLE api_clients ADD CONSTRAINT api_clients_name_key UNIQUE (name);

-- api_keys is empty when this runs: 0001 created it but nothing issued keys before 0002.
ALTER TABLE api_keys ADD COLUMN key_prefix TEXT NOT NULL;
ALTER TABLE api_keys ADD COLUMN last_used_at TIMESTAMPTZ;
ALTER TABLE api_keys
    ADD CONSTRAINT api_keys_rate_limit_positive CHECK (rate_limit_per_minute > 0);

-- One row per request grows without bound; one row per key per hour is enough for a dashboard.
DROP TABLE api_key_usage;

CREATE TABLE api_key_usage_hourly (
    api_key_id UUID NOT NULL REFERENCES api_keys (id) ON DELETE CASCADE,
    hour TIMESTAMPTZ NOT NULL,
    requests INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (api_key_id, hour)
);

-- Datasets are listed straight from dataset storage and keyed by game patch; this table was
-- never written and its dataset_version column no longer exists as a concept.
DROP TABLE dataset_versions;
