export interface Parser<TRaw, TParsed> {
  parse(raw: TRaw): Promise<TParsed> | TParsed;
}

export interface Normalizer<TParsed, TEntity> {
  normalize(parsed: TParsed): Promise<TEntity[]> | TEntity[];
}

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
