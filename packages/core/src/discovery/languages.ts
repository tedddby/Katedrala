/**
 * Built-in language identification by file extension, used for files no language adapter claims (for
 * language statistics), and the "text-like" test deciding which unclaimed files are read for line counts and
 * digests.
 */
import { baseName, extensionOf, type LanguageId } from "@katedrala/ir";

/**
 * Extensions (lower-case, with the dot) of the languages Katedrala recognizes without an adapter. TypeScript
 * and JavaScript are included so that language statistics stay meaningful when their adapter is disabled.
 */
export const BUILTIN_LANGUAGE_EXTENSIONS: Readonly<Record<LanguageId, readonly string[]>> = {
  typescript: [".ts", ".tsx", ".mts", ".cts"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  json: [".json", ".jsonc", ".json5"],
  yaml: [".yaml", ".yml"],
  markdown: [".md", ".markdown", ".mdx"],
  css: [".css"],
  scss: [".scss", ".sass"],
  less: [".less"],
  html: [".html", ".htm", ".xhtml"],
  svg: [".svg"],
  python: [".py", ".pyi", ".pyw"],
  java: [".java"],
  go: [".go"],
  rust: [".rs"],
  csharp: [".cs", ".csx"],
  kotlin: [".kt", ".kts"],
  swift: [".swift"],
  ruby: [".rb", ".rake", ".gemspec"],
  php: [".php"],
  c: [".c", ".h"],
  cpp: [".cpp", ".cc", ".cxx", ".c++", ".hpp", ".hh", ".hxx", ".h++", ".ipp", ".inl"],
  shell: [".sh", ".bash", ".zsh"],
  sql: [".sql"],
  graphql: [".graphql", ".gql"],
  protobuf: [".proto"],
  toml: [".toml"],
  xml: [".xml", ".xsd", ".xsl", ".xslt"],
  text: [".txt", ".text"],
};

const LANGUAGE_BY_EXTENSION = new Map<string, LanguageId>(
  Object.entries(BUILTIN_LANGUAGE_EXTENSIONS).flatMap(([language, extensions]) =>
    extensions.map((extension): [string, LanguageId] => [extension, language]),
  ),
);

/** The built-in language of a path by its extension (case-insensitive), or undefined. */
export function builtinLanguageOf(path: string): LanguageId | undefined {
  return LANGUAGE_BY_EXTENSION.get(extensionOf(path));
}

/** Extensions of text formats beyond the built-in languages. */
const EXTRA_TEXT_EXTENSIONS = [
  ".csv",
  ".tsv",
  ".jsonl",
  ".ndjson",
  ".ini",
  ".cfg",
  ".conf",
  ".properties",
  ".env",
  ".lock",
  ".log",
  ".rst",
  ".adoc",
  ".asciidoc",
  ".tex",
  ".diff",
  ".patch",
  ".vue",
  ".svelte",
  ".astro",
  ".graphqls",
  ".tf",
  ".hcl",
  ".gradle",
  ".csproj",
  ".fsproj",
  ".sln",
  ".props",
  ".targets",
];

const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  ...LANGUAGE_BY_EXTENSION.keys(),
  ...EXTRA_TEXT_EXTENSIONS,
]);

/** Well-known extensionless text files (compared case-insensitively). */
const TEXT_FILE_NAMES: ReadonlySet<string> = new Set(
  [
    "Dockerfile",
    "Containerfile",
    "Makefile",
    "GNUmakefile",
    "Procfile",
    "Gemfile",
    "Rakefile",
    "Jenkinsfile",
    "Vagrantfile",
    "Brewfile",
    "Podfile",
    "Pipfile",
    "CODEOWNERS",
  ].map((name) => name.toLowerCase()),
);

/** Project documents, with or without a suffix: `LICENSE`, `LICENSE-MIT`, `README.txt`, `CHANGELOG.old`. */
const DOCUMENT_NAME =
  /^(?:licen[cs]e|copying|notice|readme|changelog|authors|contributors)(?:[-_.].*)?$/i;

/**
 * Whether a path names a text format by its extension or name: built-in language extensions, other text
 * formats (`.csv`, `.ini`, `.lock`, ...), well-known extensionless files (`Dockerfile`, `Makefile`, ...),
 * project documents (`LICENSE`, `README`, ...) and dotfiles (`.gitignore`, `.npmrc`, `.env.local`, ...).
 * Content can still turn out to be binary; callers check that after reading.
 */
export function isTextLikePath(path: string): boolean {
  if (TEXT_EXTENSIONS.has(extensionOf(path))) return true;
  const name = baseName(path);
  return (
    name.startsWith(".") || TEXT_FILE_NAMES.has(name.toLowerCase()) || DOCUMENT_NAME.test(name)
  );
}
