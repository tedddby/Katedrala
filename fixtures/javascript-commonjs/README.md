# javascript-commonjs

A small server-rendered to-do application written in plain JavaScript (no TypeScript), in a CommonJS
package (`"type": "commonjs"`). It uses Express and renders HTML with JSX compiled by Babel against a tiny
runtime of its own (`h`/`Fragment` from `src/lib/html.cjs`, configured in `babel.config.json`).

## Architecture

```text
src/server.js              entry (package.json "main"): builds the Express app, loads plugins, registers routes
src/config.js              require("fs"), require("node:path"), require("./defaults.json")
src/defaults.json          default configuration (required with an explicit .json extension)
src/routes/index.js        required as a directory: require("./routes"); module.exports = registerRoutes
src/routes/health.js       exports.liveness = ...; exports.readiness = ... (required as "./health.js")
src/services/todo-service.js   exports.listTodos / exports.createTodo / module.exports.completeTodo
src/store/memory-store.js  class MemoryStore; module.exports = MemoryStore
src/lib/validation.js      module.exports = { validateTitle, MAX_TITLE_LENGTH }
src/lib/html.cjs           .cjs JSX runtime: module.exports = { h, Fragment, renderToString, escapeHtml }
src/lib/dates.mjs          .mjs ES module: import html from "./html.cjs"; export function ...; export default
src/views/layout.jsx       JSX in a .jsx file
src/views/todo-page.js     JSX in a .js file; require("./layout") resolves to layout.jsx by extension probing
src/plugins/loader.js      require(pluginPath): a non-literal, statically unresolvable specifier
src/plugins/audit-log.js   plugin loaded only through that dynamic require
```

## What it tests

- CommonJS extraction: `require` imports (kind `require`), including destructuring
  (`const { listTodos, createTodo, completeTodo } = require(...)`), directory requires resolved to
  `index.js`, explicit `.js`, `.cjs` and `.json` specifiers, and extensionless specifiers resolved by probing
  (`./layout` -> `layout.jsx`).
- CommonJS exports. The naming convention used by `expectations.exports`:
  - `module.exports = { a, b }` exports `a` and `b`.
  - `module.exports = <anything else>` exports `default`.
  - `exports.x = ...` and `module.exports.x = ...` export `x`.
  - ES modules use normal ESM names, and `export default` is `default`.
- Mixed module systems: `dates.mjs` is ESM (static `import` of a `.cjs` file) and is loaded from CommonJS
  with a dynamic `import()` (kind `dynamic`).
- A non-literal `require(pluginPath)` at `src/plugins/loader.js:13`. It must not resolve, its specifier is
  the source text `pluginPath`, and its resolution status is `dynamic`. As a result,
  `src/plugins/audit-log.js` has no static importer.
- Built-ins with and without the `node:` prefix (`require("fs")`, `require("path")`, `require("crypto")`,
  `require("node:path")`) map to `node:fs`, `node:path` and `node:crypto`. `express` is the only external
  package.
- JSX in `.jsx` and `.js` files, with component usage (`<Layout>`, `<TodoItem>`) bound through
  `require` bindings and local declarations.

## Expected conclusions

- 14 resolved import statements, 1 non-literal require (listed in `unresolved`), no cycles.
- Externals: `express`, `node:crypto`, `node:fs`, `node:path`.
- Export names per file, as in `expectations.exports`.
- Module formats: `src/lib/dates.mjs` is `esm`. Every other `.js`, `.jsx` and `.cjs` file is `commonjs`.
- Representative symbol edges (`calls`, `instantiates`, `uses` in `expected.json`), for example
  `src/server.js#createServer -> src/routes/index.js#registerRoutes` through
  `const registerRoutes = require("./routes")` and `module.exports = registerRoutes`, and
  `src/views/todo-page.js#renderTodoPage -> src/views/layout.jsx#Layout` through JSX.
- Entry point: `src/server.js` (package.json `main`).

## `expected.json` expectations

| Key                         | Meaning                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `exports`                   | Exported names per code file, using the CommonJS naming convention above. Sorted.                    |
| `moduleFormats`             | Module system per code file: `esm` or `commonjs`.                                                    |
| `jsxFiles`                  | Files that contain JSX syntax.                                                                       |
| `nonLiteralSpecifiers`      | Imports whose specifier is not a string literal: `{ file, specifier (source text), kind, line }`. Resolution status `dynamic`. |
| `codeFilesWithoutImporters` | Code files that no import resolves to (the entry point, and the dynamically loaded plugin).          |
| `entryPoints`               | Files declared as entry points by package.json.                                                      |
| `calls`                     | Representative call edges `[caller, callee]` between symbols (not exhaustive).                      |
| `instantiates`              | Representative `new` edges (not exhaustive).                                                         |
| `uses`                      | Representative `uses` edges from JSX component references (not exhaustive).                          |
