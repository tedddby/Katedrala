/**
 * Errors thrown by the linker. Problems in the analyzed code (unresolved imports, syntax errors) are never
 * thrown: they become diagnostics. Only invalid input — a programming error of the caller — is thrown.
 */

/** Stable codes of {@link LinkerError}. */
export type LinkerErrorCode = "invalid-path" | "duplicate-file";

/** Error thrown for invalid linker input (for example two files with the same path). */
export class LinkerError extends Error {
  /** Stable machine-readable code. */
  readonly code: LinkerErrorCode;

  /**
   * @param code - stable machine-readable code.
   * @param message - human-readable explanation.
   */
  constructor(code: LinkerErrorCode, message: string) {
    super(message);
    this.name = "LinkerError";
    this.code = code;
  }
}
