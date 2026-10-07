import swagger from "@fastify/swagger";
import type { FastifyInstance } from "fastify";
import { SCHEMA_VERSION } from "@exiledata/schema";

export const TAG = {
  data: "Game data",
  datasets: "Datasets",
  service: "Service"
} as const;

/**
 * Shared JSON schemas for public responses. Fastify serializes responses through them, so a
 * field missing here is dropped from the response; free-form objects (`ext`, `derived`) must
 * keep `additionalProperties: true`.
 */
const SCHEMAS = [
  {
    $id: "Error",
    type: "object",
    description: "Body of every error response.",
    required: ["error", "message"],
    properties: {
      error: {
        type: "string",
        description: "Stable code to branch on, e.g. `invalid_api_key`."
      },
      message: { type: "string", description: "Explanation for people. Its wording can change." }
    },
    examples: [{ error: "invalid_api_key", message: "The API key is invalid or revoked." }]
  },
  {
    $id: "EntityVersion",
    type: "object",
    description: "Which schema and game patch a record belongs to.",
    required: ["schemaVersion", "game"],
    properties: {
      schemaVersion: { type: "string", description: "ExileData schema version, e.g. `0.2.0`." },
      game: { type: "string", enum: ["poe1", "poe2"], description: "Game the record belongs to." },
      gameVersion: { type: "string", description: "Game patch, e.g. `0.5.5.4`." }
    }
  },
  {
    $id: "SourceProvenance",
    type: "object",
    description: "Where a record came from.",
    required: ["name", "retrievedAt"],
    properties: {
      name: { type: "string", description: "Source id, e.g. `poe2-ggpk-extract`." },
      version: { type: "string", description: "Version of the source, here the game patch." },
      retrievedAt: {
        type: "string",
        format: "date-time",
        description: "When the source was read."
      },
      locator: {
        type: "string",
        description: "Where in the source the record was found, e.g. `base_items.json#<id>`."
      }
    }
  },
  {
    $id: "BaseItem",
    type: "object",
    description: "The template for an item type, such as Crimson Amulet, before any modifiers.",
    required: ["id", "name", "version", "source"],
    properties: {
      id: {
        type: "string",
        description: "The game's metadata path. Stable across patches while the item exists."
      },
      name: { type: "string", description: "Display name." },
      itemClass: { type: "string", description: "The game's item class, e.g. `Amulet`." },
      version: { $ref: "EntityVersion#" },
      source: { type: "array", items: { $ref: "SourceProvenance#" } },
      ext: {
        type: "object",
        additionalProperties: true,
        description:
          "Every other field from the game files, under its original name. It is not a stable contract."
      },
      derived: {
        type: "object",
        additionalProperties: true,
        description: "Values ExileData computes. Empty today."
      }
    }
  },
  {
    $id: "DatasetMetadata",
    type: "object",
    description: "Describes one published dataset: one game patch.",
    required: ["game", "gameVersion", "generatedAt", "schemaVersion", "sources"],
    properties: {
      game: { type: "string", enum: ["poe1", "poe2"] },
      gameVersion: { type: "string", description: "Game patch, e.g. `0.5.5.4`." },
      generatedAt: {
        type: "string",
        format: "date-time",
        description: "When this build of the dataset was made. Changes if the patch is rebuilt."
      },
      schemaVersion: { type: "string", description: "Schema version the records follow." },
      sources: {
        type: "array",
        items: {
          type: "object",
          required: ["name", "retrievedAt"],
          properties: {
            name: { type: "string" },
            version: { type: "string" },
            retrievedAt: { type: "string", format: "date-time" }
          }
        }
      }
    }
  },
  {
    $id: "ListMeta",
    type: "object",
    required: ["game", "gameVersion"],
    properties: {
      game: { type: "string", enum: ["poe1", "poe2"] },
      gameVersion: {
        type: "string",
        description: "The patch that answered. Pass it as `?version=` to pin to it."
      },
      total: { type: "integer", description: "Matching records before `limit` and `offset`." }
    }
  }
];

/** Response entries for errors, keyed by status code. */
export function errors(descriptions: Record<number, string>) {
  return Object.fromEntries(
    Object.entries(descriptions).map(([status, description]) => [
      status,
      { description, $ref: "Error#" }
    ])
  );
}

export const KEY_ERRORS = {
  401: "The API key is missing, invalid or revoked.",
  429: "The key's per-minute limit is used up. Wait `retry-after` seconds."
};

export function registerOpenApi(app: FastifyInstance): void {
  app.register(swagger, {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: "ExileData API",
        version: SCHEMA_VERSION,
        description:
          "Path of Exile 1 and 2 game data, one dataset per game patch. Every `/v1` route " +
          "needs an API key."
      },
      servers: [{ url: "https://api.exiledata.dev" }],
      tags: [
        { name: TAG.data, description: "Records from a game patch." },
        { name: TAG.datasets, description: "Which games and patches are published." },
        { name: TAG.service, description: "Health checks. No key needed." }
      ],
      components: {
        securitySchemes: {
          apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
          bearer: { type: "http", scheme: "bearer" }
        }
      },
      security: [{ apiKey: [] }, { bearer: [] }]
    },
    hideUntagged: true,
    refResolver: {
      buildLocalReference: (json, _baseUri, _fragment, i) =>
        typeof json.$id === "string" ? json.$id : `def-${i}`
    }
  });

  for (const schema of SCHEMAS) app.addSchema(schema);
}
