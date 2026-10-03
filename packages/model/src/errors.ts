/**
 * Structured errors of `@katedrala/model`.
 */

/**
 * Stable codes of {@link ModelError}:
 * - `invalid-level`: a projection or aggregation level that does not exist (or that the operation does not
 *   support, e.g. aggregating dependencies at the `file` level).
 */
export type ModelErrorCode = "invalid-level";

/** Error thrown by `@katedrala/model` for invalid arguments. */
export class ModelError extends Error {
  /** Stable, machine-readable code of the problem. */
  readonly code: ModelErrorCode;

  /**
   * @param code - stable code of the problem.
   * @param message - human-readable explanation.
   */
  constructor(code: ModelErrorCode, message: string) {
    super(message);
    this.name = "ModelError";
    this.code = code;
  }
}
