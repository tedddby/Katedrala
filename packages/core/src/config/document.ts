/**
 * Parsing configuration text (YAML or JSON) into a plain value while keeping enough position information to
 * attach line numbers to validation issues.
 */
import { LineCounter, isAlias, isMap, isScalar, isSeq, parseDocument, type Document } from "yaml";
import { parseJsonWithPositions, type JsonNode } from "./json.js";

/** Formats of configuration files. */
export type ConfigurationFormat = "yaml" | "json";

/** A path inside a configuration value: object keys and array indices. */
export type ValuePath = readonly (string | number)[];

/** A parsed configuration document. */
export interface ConfigurationDocument {
  /** The plain value (`undefined` for an empty YAML document). */
  value: unknown;
  /**
   * The 1-based line of the value at `path` (of its key, when `key` is true and the value is an object
   * member). When the path does not exist, the line of its nearest existing ancestor; undefined when the
   * document is empty.
   */
  locate(path: ValuePath, key?: boolean): number | undefined;
}

/** A syntax error in a configuration document. */
export interface SyntaxProblem {
  message: string;
  line?: number;
}

/** Outcome of {@link parseConfigurationDocument}. */
export type ConfigurationDocumentResult =
  { ok: true; document: ConfigurationDocument } | { ok: false; problems: SyntaxProblem[] };

/** Parse configuration text in the given format; syntax errors are returned, never thrown. */
export function parseConfigurationDocument(
  text: string,
  format: ConfigurationFormat,
): ConfigurationDocumentResult {
  return format === "json" ? parseJson(text) : parseYaml(text);
}

function parseJson(text: string): ConfigurationDocumentResult {
  const result = parseJsonWithPositions(text);
  if (!result.ok) {
    return {
      ok: false,
      problems: [
        {
          message: `JSON syntax error: ${result.message} (column ${result.column})`,
          line: result.line,
        },
      ],
    };
  }
  const root = result.root;
  return {
    ok: true,
    document: { value: result.value, locate: (path, key) => locateJson(root, path, key ?? false) },
  };
}

function locateJson(root: JsonNode, path: ValuePath, key: boolean): number {
  let node = root;
  let line = root.line;
  for (const [index, segment] of path.entries()) {
    const child =
      node.members?.get(String(segment)) ??
      (typeof segment === "number" ? node.elements?.[segment] : undefined);
    if (child === undefined) return line;
    if (index === path.length - 1 && key && child.keyLine !== undefined) return child.keyLine;
    node = child;
    line = child.line;
  }
  return line;
}

function parseYaml(text: string): ConfigurationDocumentResult {
  const lineCounter = new LineCounter();
  const document = parseDocument(text, { lineCounter, prettyErrors: false, uniqueKeys: true });
  const lineAt = (offset: number): number => lineCounter.linePos(offset).line;
  if (document.errors.length > 0) {
    return {
      ok: false,
      problems: document.errors.map((error) => ({
        message: `YAML syntax error: ${error.message.split("\n")[0] ?? error.message}`,
        line: lineAt(error.pos[0]),
      })),
    };
  }
  let value: unknown;
  try {
    value = document.toJS();
  } catch (error) {
    // E.g. "Excessive alias count indicates a resource exhaustion attack".
    const message = error instanceof Error ? error.message : "cannot convert the document";
    return { ok: false, problems: [{ message: `YAML error: ${message}` }] };
  }
  return {
    ok: true,
    document: { value, locate: (path, key) => locateYaml(document, lineAt, path, key ?? false) },
  };
}

function lineOfNode(node: unknown, lineAt: (offset: number) => number): number | undefined {
  if (node === null || typeof node !== "object" || !("range" in node)) return undefined;
  const range = (node as { range?: readonly number[] | null }).range;
  const start = range?.[0];
  return start === undefined ? undefined : lineAt(start);
}

function locateYaml(
  document: Document.Parsed,
  lineAt: (offset: number) => number,
  path: ValuePath,
  key: boolean,
): number | undefined {
  let node: unknown = document.contents;
  let line = lineOfNode(node, lineAt);
  for (const [index, segment] of path.entries()) {
    if (isAlias(node)) node = node.resolve(document);
    if (isMap(node)) {
      // The last pair wins, as in the converted value.
      const pair = node.items.findLast(
        (item) => isScalar(item.key) && String(item.key.value) === String(segment),
      );
      if (pair === undefined) return line;
      const keyLine = lineOfNode(pair.key, lineAt) ?? line;
      if (index === path.length - 1 && key) return keyLine;
      node = pair.value;
      line = lineOfNode(node, lineAt) ?? keyLine;
    } else if (isSeq(node)) {
      const item: unknown = node.items[Number(segment)];
      if (item === undefined) return line;
      node = item;
      line = lineOfNode(item, lineAt) ?? line;
    } else {
      return line;
    }
  }
  return line;
}
