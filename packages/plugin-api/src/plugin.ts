/**
 * The plugin container and logging contract.
 */
import type { LanguageAdapter } from "./adapter.js";
import type {
  AnomalyDetector,
  GraphExporter,
  MetricProvider,
  RuleEvaluator,
} from "./extensions.js";
import type { FrameworkDetector } from "./framework.js";

/** A bundle of extensions. Every extension field is optional. */
export interface KatedralaPlugin {
  /** Package-style name, e.g. `@acme/katedrala-plugin-kotlin`. */
  readonly name: string;
  readonly version: string;
  /** The plugin contract version the plugin was written against (`PLUGIN_API_VERSION`). */
  readonly apiVersion: number;
  readonly languageAdapters?: readonly LanguageAdapter[];
  readonly frameworkDetectors?: readonly FrameworkDetector[];
  readonly exporters?: readonly GraphExporter[];
  readonly metrics?: readonly MetricProvider[];
  readonly anomalyDetectors?: readonly AnomalyDetector[];
  readonly ruleEvaluators?: readonly RuleEvaluator[];
}

/** Identity helper that gives plugin authors type checking and editor completion. */
export function definePlugin(plugin: KatedralaPlugin): KatedralaPlugin {
  return plugin;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Structured logger. Implementations decide formatting and destinations (stderr by default). */
export interface Logger {
  debug(message: string, data?: Readonly<Record<string, unknown>>): void;
  info(message: string, data?: Readonly<Record<string, unknown>>): void;
  warn(message: string, data?: Readonly<Record<string, unknown>>): void;
  error(message: string, data?: Readonly<Record<string, unknown>>): void;
}

/** A logger that discards everything (the default for programmatic use). */
export const silentLogger: Logger = Object.freeze({
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
});
