/**
 * The language-neutral output of a language adapter for one file.
 *
 * A {@link FileExtraction} is a pure function of (file path, normalized file content, dialect, adapter
 * version, adapter options). It never depends on other files, which makes it cacheable and lets the engine
 * re-analyze only changed files across runs and commits. Everything that needs project knowledge (module
 * resolution, following imports to declarations, package-level name lookup) happens later, in the engine's
 * linker, optionally assisted by the adapter's project ({@link AdapterProject.link}).
 *
 * Names inside one extraction refer to each other through *local names*: the part of a symbol identifier after
 * `#` (qualified name plus disambiguator, see {@link SymbolNamer}).
 *
 * Size bounds (adapters must truncate to them): at most 8 arguments per reference, 16 elements per array,
 * 32 properties per object, nesting depth 4 for argument summaries, 200 characters per string.
 */
import type {
  ArchitecturalRole,
  EdgeMechanism,
  FileRole,
  ImportKind,
  Position,
  Range,
  SymbolCategory,
  SymbolKind,
  SymbolModifier,
  Visibility,
} from "@katedrala/ir";

export interface FileExtraction {
  /**
   * How the file's top-level names are scoped: `esm` / `commonjs` modules, `script` (top-level declarations
   * are global), `package` (shared with the file's language-level package, e.g. Go, Java), `namespace`
   * (C#-style), or `unknown`. Plugins may use `x-` values.
   */
  moduleFormat: "esm" | "commonjs" | "script" | "package" | "namespace" | "unknown" | `x-${string}`;
  /** Package or namespace names the file declares (e.g. Java `package com.acme`), in source order. */
  namespaces?: string[];
  /** Local names of symbols declared in the global scope (script top-level, `declare global`). */
  globals?: string[];
  /** File-level build conditions recorded verbatim (e.g. Go build tags); never evaluated. */
  conditions?: string[];
  /** Syntax errors; when non-empty the rest of the extraction is best-effort. */
  syntaxErrors: ExtractionDiagnostic[];
  /** Declared symbols in source order (parents before their members). */
  symbols: ExtractedSymbol[];
  /** Module imports in source order (including re-exports and type-only imports). */
  imports: ExtractedImport[];
  /** Exported names in source order. */
  exports: ExtractedExport[];
  /** References from code in this file to other declarations, in source order. */
  references: ExtractedReference[];
  /** Language-level observations useful to framework detectors, in source order. */
  facts: ExtractedFact[];
}

export interface ExtractionDiagnostic {
  message: string;
  line: number;
  column: number;
}

/** A reference to a type, with its type arguments (e.g. `Repository<User>`). */
export interface TypeRef {
  ref: BindingRef;
  /** Type arguments, when written and when they name declarations. */
  arguments?: TypeRef[];
}

export interface ExtractedSymbol {
  /**
   * Unique name of the symbol within its file (qualified name plus disambiguator), assigned with
   * {@link SymbolNamer}. Becomes the part of the symbol identifier after `#`.
   */
  localName: string;
  /** Simple name, unescaped (`default` for anonymous default exports). */
  name: string;
  /** Escaped qualified name (see `qualifiedNameOf` in `@katedrala/ir`). */
  qualifiedName: string;
  kind: SymbolKind;
  /** Required for `x-` kinds; otherwise derived from the kind. */
  category?: SymbolCategory;
  /** Local name of the lexically enclosing symbol. */
  parent?: string;
  /** The implementation declaration when one exists, else the first declaration. */
  range: Range;
  /** Every merged declaration in source order, when there is more than one. */
  declarations?: Array<{ range: Range; signature?: string }>;
  /**
   * Visibility outside the language-level module unit, for languages without explicit export lists (e.g. Go
   * capitalization). For ECMAScript the linker derives it from `exports`.
   */
  exported?: boolean;
  visibility?: Visibility;
  /** Abstract in Martin's sense: an interface/trait declaring behaviour, or an abstract class. */
  abstract?: boolean;
  modifiers?: SymbolModifier[];
  decorators?: ExtractedDecorator[];
  /** Single-line signature, at most 200 characters. */
  signature?: string;
  /** Declared type of a property, field, accessor, variable or constant, when it names a declaration. */
  declaredType?: TypeRef;
  /** Declared return type of a function, method or accessor, when it names a declaration. */
  returnType?: TypeRef;
  /** How a variable or constant is initialized, when it is a call or construction. */
  initializer?: {
    kind: "call" | "new";
    callee: ReferenceTarget;
    arguments?: ArgumentSummary[];
  };
  /** Summary of a constant's literal, object or array initializer (e.g. route path constants). */
  value?: ArgumentSummary;
  /**
   * For members declared outside their type (Go methods, Rust `impl` blocks, extension methods, module
   * augmentation): the owning type, and for trait/interface implementations the implemented abstraction.
   */
  receiver?: {
    type: TypeRef;
    relation: "member" | "extension";
    via?: BindingRef;
  };
  /** A partial declaration of a type split across files (e.g. C# `partial class`). */
  partial?: boolean;
  /** The symbol's role when it differs from its file's (e.g. a test module inside a production file). */
  role?: FileRole;
  /** Build conditions on the declaration, recorded verbatim (e.g. `#[cfg(test)]`). */
  conditions?: string[];
  /** Architectural roles the adapter can state with certainty from syntax alone (rare). */
  roles?: ArchitecturalRole[];
}

export interface ExtractedDecorator {
  /** Decorator name as written, without `@` (e.g. `Controller`, `nest.Get`). */
  name: string;
  /** What the decorator expression refers to. */
  target?: BindingRef;
  /** Whether the decorator is invoked (`@Foo()`) rather than referenced (`@Foo`). */
  invoked: boolean;
  arguments: ArgumentSummary[];
  namedArguments?: NamedArgument[];
  /** Source text of each argument (normalized line endings), truncated to 200 characters. */
  text: string[];
  /** For parameter decorators: the parameter's index (the decorator is reported on the function symbol). */
  parameterIndex?: number;
  line: number;
  column: number;
}

export interface ExtractedImport {
  /** Specifier as written; for non-literal specifiers the source text, with `literal: false`. */
  specifier: string;
  literal: boolean;
  kind: ImportKind;
  /** The syntax used (e.g. `import-declaration`, `require-call`, `import-equals`, `triple-slash-reference`). */
  mechanism: EdgeMechanism;
  /** True when the whole import is used only in type positions. */
  typeOnly: boolean;
  line: number;
  column: number;
  /** Local name of the innermost enclosing symbol, for imports inside declarations. */
  from?: string;
  /** The import brings every exported name into scope (`from x import *`, Java `.*`). */
  wildcard?: boolean;
  /** The import applies to the whole project (C# `global using`). */
  global?: boolean;
  /** Failure to resolve is handled at runtime (e.g. Python optional imports). */
  optional?: boolean;
  /** Local bindings introduced by the import. */
  bindings: ImportBinding[];
}

export interface ImportBinding {
  /** Name of the binding in this file; absent when the imported module defines it (e.g. Go). */
  local?: string;
  /**
   * Exported name in the imported module: a name, `default`, `*` for the module namespace, or `=` for the
   * module's export assignment (`import x = require()`, CommonJS `require` of `module.exports =`).
   */
  imported: string;
  typeOnly: boolean;
}

export interface ExtractedExport {
  /**
   * Exported name; `default`; `=` for an export assignment (`export =`, `module.exports =`); or `*` for
   * `export * from` (all names except `default`).
   */
  name: string;
  /**
   * What is exported, for local exports: usually one binding; several when one name denotes declarations of
   * different kinds (e.g. `export { User }` for `const User` and `type User`).
   */
  targets?: BindingRef[];
  /** For re-exports: the module specifier exported from. */
  from?: string;
  /** For re-exports: the name in the source module, `*` for `export * as ns from`. */
  imported?: string;
  typeOnly: boolean;
  line: number;
  column: number;
}

/**
 * A reference to a binding visible in the file, followed by a (possibly empty) member path.
 * - `import`: a binding introduced by an import (`local` is its local name).
 * - `symbol`: a symbol declared in this file (`localName`).
 * - `module`: a module referenced inline by specifier (`import("./x").Foo` types, `require("./x").bar`).
 * - `name`: an identifier not bound in this file (a global, or a same-package declaration in languages with
 *   package scope); the linker resolves it through project scopes.
 * - `local`: a function-scoped variable of unknown type, identified by its declaration position.
 * - `parameter`: a parameter of unknown type of the function `owner` (local name; absent for anonymous
 *   functions at file scope).
 */
export type BindingRef =
  | { type: "import"; local: string; members: string[] }
  | { type: "symbol"; localName: string; members: string[] }
  | { type: "module"; specifier: string; members: string[] }
  | { type: "name"; name: string; members: string[] }
  | { type: "local"; name: string; declaredAt: Position; members: string[] }
  | { type: "parameter"; owner?: string; index: number; name: string; members: string[] };

/**
 * What a reference points to. Besides bindings, adapters report members of values whose type is known
 * locally:
 * - `declared-type`: the value has a declared type (`of` is the type reference).
 * - `constructor-type`: the value was created with `new` / a constructor of `of`.
 * - `call-result`: the value is the result of calling `of` (resolved through declared return types).
 * `receiver` identifies the variable the member is accessed on, when there is one.
 */
export type ReferenceTarget =
  | BindingRef
  | {
      type: "instance";
      via: "declared-type" | "constructor-type" | "call-result";
      of: ReferenceTarget;
      typeArguments?: TypeRef[];
      receiver?: BindingRef;
      members: string[];
    };

/**
 * Syntactic form of a reference. The linker chooses the edge kind from the reference kind and the kind of the
 * resolved target (e.g. a `call` of a class is an instantiation).
 * - `call`, `new`, `tagged-template`, `macro`: invocations. `construct`: a composite/struct literal.
 * - `extends`, `implements`, `embed`, `derive`: heritage, embedding and derived implementations.
 * - `type`: a type position. `decorator`: a decorator application. `jsx`: a JSX element name.
 * - `value`: any other read of a binding.
 */
export type ReferenceKind =
  | "call"
  | "new"
  | "construct"
  | "tagged-template"
  | "macro"
  | "extends"
  | "implements"
  | "embed"
  | "derive"
  | "type"
  | "decorator"
  | "jsx"
  | "value";

export interface ExtractedReference {
  /** Local name of the innermost enclosing symbol; absent for file-scope code. */
  from?: string;
  kind: ReferenceKind;
  target: ReferenceTarget;
  /**
   * True when the reference occurs only in a type position, with no use as a value (TS type annotations,
   * Python `TYPE_CHECKING` blocks, Java/C#/Go/Rust type annotations).
   */
  typeOnly: boolean;
  line: number;
  column: number;
  /** For invocations and decorators: summaries of the positional arguments. */
  arguments?: ArgumentSummary[];
  /** For invocations and decorators: named arguments (Python keywords, C# named arguments). */
  namedArguments?: NamedArgument[];
}

export interface NamedArgument {
  name: string;
  value: ArgumentSummary;
}

/** A bounded, serializable summary of an argument or initializer expression, for framework detection. */
export type ArgumentSummary =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "null" }
  | { type: "reference"; target: ReferenceTarget }
  | { type: "function"; range: Range; returns?: ArgumentSummary }
  | { type: "object"; properties: Array<{ key: string; value: ArgumentSummary }> }
  | { type: "array"; length: number; elements: ArgumentSummary[] }
  | { type: "call"; callee: ReferenceTarget; arguments: ArgumentSummary[] }
  | { type: "template"; text: string; substitutions: ArgumentSummary[] }
  | { type: "spread"; argument: ArgumentSummary }
  | { type: "other" };

/**
 * A language-level observation that is not a reference to a declaration. Known types (attribute values are
 * strings, truncated to 200 characters):
 * - `environment-read`: `{ name }` — e.g. `process.env.DATABASE_URL`.
 * - `http-request`: `{ client, url?, host?, method? }` — e.g. `fetch("https://api.example.com/x")`.
 * - `entry-point`: `{ kind }` — e.g. a `main` function or a `__main__` guard.
 * Plugins use `x-` types.
 */
export interface ExtractedFact {
  type: "environment-read" | "http-request" | "entry-point" | `x-${string}`;
  /** Local name of the innermost enclosing symbol; absent for file-scope code. */
  from?: string;
  line: number;
  column: number;
  attributes: Record<string, string>;
}
