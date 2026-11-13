/** Admin API wire types. Timestamps are ISO strings. */
export interface AdminKey {
  id: string;
  clientId: string;
  clientName: string;
  /** First characters of the key, safe to display. The full key is shown once, at creation. */
  prefix: string;
  rateLimitPerMinute: number;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  requests24h: number;
  requests7d: number;
}

export interface AdminKeysResponse {
  keys: AdminKey[];
}

/** Issues a key for `client`, creating the client if no client has that name yet. */
export interface AdminCreateKeyRequest {
  client: string;
  rateLimitPerMinute?: number;
}

export interface AdminCreateKeyResponse {
  key: AdminKey;
  /** The full API key. Only its hash is stored, so this is the only time it is returned. */
  secret: string;
}

export interface AdminUpdateKeyRequest {
  rateLimitPerMinute: number;
}

export interface AdminKeyResponse {
  key: AdminKey;
}

export interface AdminUsageBucket {
  /** Start of the hour, ISO. */
  hour: string;
  keyId: string;
  requests: number;
  errors: number;
}

export interface AdminUsageResponse {
  from: string;
  to: string;
  buckets: AdminUsageBucket[];
}
