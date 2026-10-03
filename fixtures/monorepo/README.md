# monorepo

A pnpm workspace (`acme-monorepo`) with four packages, as found in many product teams: a shared utility
library, a domain core, an HTTP API and a React front end. Packages are consumed by **name**, but no package
has been built: every `package.json` points `main`/`types`/`exports` at `./dist/...`, and `dist/` does not
exist anywhere in the fixture.

```text
package.json            acme-monorepo (private, workspace root, no code)
pnpm-workspace.yaml     packages: ["packages/*"]
tsconfig.base.json      baseUrl ".", paths { "@acme/shared/*": ["packages/shared/src/*"] }
packages/
├── shared/   @acme/shared   strings, money, result helpers           exports "." -> ./dist/index.js only
├── core/     @acme/core     catalog + orders; depends on @acme/shared (workspace:*)
├── api/      @acme/api      node:http server; uses @acme/core, @acme/shared, and lodash (undeclared)
└── web/      @acme/web      React 19 TSX components; uses @acme/shared; declares react, react-dom
```

Every package has its own `package.json` and a `tsconfig.json` that extends `../../tsconfig.base.json`.
The `paths` value is not relative (`packages/shared/src/*`), so it is resolved against `baseUrl` (`.`, the
directory of `tsconfig.base.json`), as TypeScript 5.x requires. The workspace declares TypeScript `^5.7.2`;
TypeScript 6 still honours `baseUrl` but reports it as deprecated (TS5101) when compiling.

## Resolution cases

| Import (file)                                         | Resolves to                          | How                                                       |
| ----------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| `@acme/shared` (core, api, web)                       | `packages/shared/src/index.ts`       | workspace package; `exports["."]` -> `./dist/index.js` is missing, mapped back to `src/index.ts` |
| `@acme/core` (api)                                    | `packages/core/src/index.ts`         | workspace package, same `dist` -> `src` mapping           |
| `@acme/shared/strings` (`api/src/handlers/products.ts`) | `packages/shared/src/strings.ts`   | tsconfig `paths` inherited from `tsconfig.base.json`; `@acme/shared` does not export `./strings`, so without `paths` this deep import would not resolve |
| `../package.json` with `{ type: "json" }` (`api/src/server.ts`) | `packages/api/package.json`  | explicit `.json` specifier                               |
| `lodash` (api)                                        | external                             | declared in **no** `package.json` (phantom dependency)    |
| `react`, `react-dom/client` (web)                     | externals `react`, `react-dom`       | declared in `packages/web/package.json`                   |

## Expected conclusions

- 28 files; 28 imports between fixture files; externals `lodash`, `node:http`, `react`, `react-dom`; no
  unresolved imports; no cycles.
- Five package manifests: the root `acme-monorepo` (workspace root, private, owns no source file) and the
  workspace packages `@acme/api`, `@acme/core`, `@acme/shared`, `@acme/web`.
- Code-level package dependencies: `@acme/api -> @acme/core`, `@acme/api -> @acme/shared`,
  `@acme/core -> @acme/shared`, `@acme/web -> @acme/shared`. The package graph is acyclic.
- Manifest-level internal dependencies additionally include `@acme/web -> @acme/core`, which is declared
  (`workspace:*`) but never imported: a declared-but-unused dependency.
- `lodash` is imported by `@acme/api` but declared by no manifest (not even the root): an undeclared
  (phantom) external dependency. `react` and `react-dom` are declared by the package that imports them.
- Entry points: `@acme/shared` -> `packages/shared/src/index.ts`, `@acme/core` ->
  `packages/core/src/index.ts` (after mapping `dist` back to `src`); `@acme/api` and `@acme/web` declare none.
- Inferred modules never span packages (`IR.md`: modules are scoped to a package).
