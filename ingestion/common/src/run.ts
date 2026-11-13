import type { IngestionError, IngestionRunResult, IngestionStage } from "./stage.js";

/** Collects failures into `errors` instead of throwing, so one run reports every problem. */
export async function runStage<TRaw, TParsed, TEntity>(
  stage: IngestionStage<TRaw, TParsed, TEntity>
): Promise<IngestionRunResult<TEntity>> {
  const errors: IngestionError[] = [];
  const warnings: string[] = [];
  const retrievedAt = new Date().toISOString();
  const result = (entities: TEntity[], version?: string): IngestionRunResult<TEntity> => ({
    entities,
    errors,
    warnings,
    metadata: {
      generatedAt: retrievedAt,
      sources: [{ name: stage.source.name, version, retrievedAt }]
    }
  });

  let raw: TRaw;
  try {
    raw = await stage.source.fetch();
  } catch (cause) {
    errors.push({ stage: "fetch", message: messageOf(cause), cause });
    return result([]);
  }

  const sourceVersion = stage.source.getVersion?.(raw);

  let parsed: TParsed;
  try {
    parsed = await stage.parser.parse(raw);
  } catch (cause) {
    errors.push({ stage: "parse", message: messageOf(cause), cause });
    return result([], sourceVersion);
  }

  warnings.push(...(stage.warn?.(parsed) ?? []));

  let entities: TEntity[];
  try {
    entities = await stage.normalizer.normalize(parsed);
  } catch (cause) {
    errors.push({ stage: "normalize", message: messageOf(cause), cause });
    return result([], sourceVersion);
  }

  try {
    const validation = await stage.validator.validate(entities);
    for (const error of validation.errors) {
      errors.push({
        stage: "validate",
        message: error.path ? `${error.path}: ${error.message}` : error.message
      });
    }
  } catch (cause) {
    errors.push({ stage: "validate", message: messageOf(cause), cause });
  }

  return result(entities, sourceVersion);
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
