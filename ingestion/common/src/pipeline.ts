/**
 * Parses raw upstream data (e.g. RePoE JSON, PoEDB HTML) into a source-shaped intermediate
 * representation. Does not normalize into the canonical schema — that's `Normalizer`'s job.
 */
export interface Parser<TRaw, TParsed> {
  parse(raw: TRaw): Promise<TParsed> | TParsed;
}

/**
 * Converts a parsed, source-shaped representation into one or more canonical ExileData entities.
 * This is where `source`, `ext`, and `derived` fields (see @exiledata/schema) get populated.
 */
export interface Normalizer<TParsed, TEntity> {
  normalize(parsed: TParsed): Promise<TEntity[]> | TEntity[];
}

/**
 * Validates normalized entities before they're included in a generated dataset.
 * Implementations may use JSON Schema, Zod, or similar — left as an implementation detail.
 */
export interface Validator<TEntity> {
  validate(entities: TEntity[]): Promise<ValidationResult> | ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  message: string;
  /** Path/pointer to the offending field, if applicable. */
  path?: string;
}
