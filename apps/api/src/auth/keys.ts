import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "exd_";
const DISPLAY_PREFIX_LENGTH = 12;
const MAX_KEY_LENGTH = 200;

/** A new API key: a fixed prefix plus 192 random bits. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(24).toString("base64url");
}

/** An HMAC, so a leaked key table cannot be checked against guesses without the secret. */
export function hashApiKey(secret: string, key: string): string {
  return createHmac("sha256", secret).update(key).digest("hex");
}

/** The part of a key that is safe to show in listings. */
export function displayPrefix(key: string): string {
  return key.slice(0, DISPLAY_PREFIX_LENGTH);
}

/** Cheap shape check, so obvious garbage never costs a hash and a database lookup. */
export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(API_KEY_PREFIX) && value.length <= MAX_KEY_LENGTH;
}

/** Constant-time comparison of two secrets of any length. */
export function secretsMatch(expected: string, presented: string): boolean {
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(presented).digest();
  return timingSafeEqual(a, b);
}
