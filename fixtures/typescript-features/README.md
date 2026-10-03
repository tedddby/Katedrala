# typescript-features

`@acme/shop-core` is a small order, billing and customer library with two React views and a CLI. It is
written to exercise TypeScript language features that the adapter and the linker must handle correctly.
The domain is ordinary on purpose. The point is the variety of declaration, import and export forms.

## Architecture

```text
src/index.ts                public barrel: export * from orders, export * as billing, export { default as Shop, ... }
src/cli.ts                  bin entry; imports only the public barrel ("./index.js")
src/shop.ts                 default-exported class Shop + createShop; /// <reference path>, side-effect import,
                            import x = require("./legacy"), dynamic import("./lazy")
src/orders/index.ts  <──┐   barrel: export * from order, order-repository, order-service, ../customers/index
src/customers/index.ts ─┘   barrel: export * from customer, ../orders/index        (export * cycle)
src/orders/order.ts         enum, const enum, merged interface Order, type alias, functions
src/orders/order-repository.ts   class OrderRepository extends abstract generic Repository; method overloads, accessor
src/orders/order-service.ts      @Injectable class with @Required property, @Inject parameter property, @Log methods;
                                 constructor(private readonly repo: OrderRepository) calling this.repo.save(...)
src/shared/repository.ts    abstract class Repository<T extends Entity<K>, K = string>
src/billing/invoice.ts      class Invoice + namespace Invoice (class/namespace merging), accessors, @/ imports
src/billing/tax.ts          namespace Tax with nested namespaces Tax.EU and Tax.US
src/legacy.ts               function legacyFormat + namespace legacyFormat, export = legacyFormat
src/lazy.ts                 dynamically imported; uses a baseUrl import ("src/utils/collections")
src/config.ts               import data from "./data.json"
src/globals.d.ts            ambient declarations (declare const/var/namespace), referenced by triple-slash
src/polyfills.ts            script without imports or exports, imported for its side effects
src/utils/money.ts          overloaded formatMoney, Money and Currency types
src/utils/collections.ts    generic groupBy and sumBy
src/ui/OrderList.tsx        PascalCase components OrderList and OrderRow
src/ui/App.tsx              renders <OrderList>; imports "@/customers" (directory index via path alias)
src/broken.ts               two valid imports, then a syntax error on line 10 (missing ")")
```

`tsconfig.json` uses `module: preserve`, `moduleResolution: bundler`, `baseUrl: "."`,
`paths: { "@/*": ["src/*"] }`, `jsx: react-jsx` and `experimentalDecorators`.

## What it tests

- Import kinds: `static`, `type` (`import type` and an all-inline `import { type Money }`), `re-export`
  (`export *`, `export * as ns`, `export { default as Shop, ... } from`), `side-effect`, `import-equals`,
  `dynamic` and `triple-slash`. There is one entry per import statement, so `src/orders/order.ts` has
  both a `type` and a `static` import of `src/utils/money.ts`.
- Resolution: `.js` specifiers that resolve to `.ts`, extensionless specifiers resolved to `.ts` and
  `.tsx`, `@/` path aliases (including the directory index `@/customers`), a `baseUrl` specifier
  (`src/utils/collections`), `./data.json`, `./legacy` for import-equals, and `./lazy` for the dynamic
  import.
- Barrels: effective exports through chained `export *` with a cycle between `src/orders/index.ts` and
  `src/customers/index.ts`. The cycle must terminate, and both barrels export the same 14 names.
  `export * as billing` contributes the single name `billing`. `expectations.exports` lists effective
  exported names (types included, `export *` expanded transitively, `default` not re-exported by
  `export *`), as TypeScript's checker reports them.
- Symbols (IR naming rules): merged interfaces, overloads and method overloads are one symbol each
  (`mergedSymbols`). A class or function merged with a namespace yields two symbols, `X` and
  `X~namespace` (`symbolIds`). Nested namespaces give qualified names such as `Tax.EU.vatFor`.
  Constructors are named `<Class>.constructor`, and parameter properties are `property` symbols.
  Ambient `declare const` is a `constant` and `declare var` is a `variable`. Named default exports keep
  their name (`Shop`). Symbol kind `module` is not represented (the fixture has no `declare module "x"`).
- Decorators (legacy): class `@Injectable("orders")`, property `@Required()`, method `@Log(...)` and
  parameter `@Inject("clock")`. Decorator names and argument source text are recorded. The parameter
  decorator is not asserted, because the IR does not yet say which symbol carries it.
- Call binding (`calls`, `instantiates`, `uses`):
  - `OrderService.place -> OrderRepository.save` through `this.repo`, typed by a parameter property.
  - An inherited member (`OrderService.cancel -> Repository.getOrThrow`).
  - Overloads (`formatMoney`, `OrderRepository.findBy`).
  - A namespace function merged into a class (`Invoice.fromOrder`).
  - Nested namespace members.
  - An import-equals binding (`Shop.describe -> legacyFormat`).
  - Re-export chains (`cli.ts#main -> shop.ts#createShop`).
  - `export * as billing` member access (`billing.Tax.rateFor`).
  - A baseUrl import, and a call through the `@/customers` barrel and its export * cycle.
  - JSX component references.
- Error tolerance: `src/broken.ts` is analyzed partially. Its two imports and `statusLabel` are still
  extracted, and the first syntax error is on line 10.

## Expected conclusions

- 45 resolved import statements. Externals: `react` and `node:crypto`. Nothing unresolved.
- Exactly one file-level cycle: `src/customers/index.ts <-> src/orders/index.ts` (re-exports only).
- Entry points from package.json: `src/index.ts` (`main`, `exports`, `types` mapped from `dist`) and
  `src/cli.ts` (`bin`).
- `src/globals.d.ts` and `src/polyfills.ts` are scripts (no imports or exports).
- `src/broken.ts` has status `partial`. Every other file parses without errors.

## `expected.json` expectations

| Key             | Meaning                                                                                                  |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `exports`       | Effective exported names of the barrels and of two files with named and default exports (see above). Sorted. |
| `symbolsSample` | Symbols that must exist: `{ file, qualifiedName, kind }` (not exhaustive). Every symbol kind except `module` appears. |
| `mergedSymbols` | Declarations that must merge into exactly one symbol. `declarations` is the number of declarations merged. |
| `symbolIds`     | Symbol identifiers (without `sym:`) and their kinds, for qualified names shared by two symbols of different kinds. |
| `decorators`    | Decorators per symbol, in source order, as IR `DecoratorEntry` values (name without `@`, argument source text). |
| `calls`         | Representative `calls` edges `[caller, callee]` (not exhaustive). Each one is confirmed by TypeScript's checker. |
| `instantiates`  | Representative `new` edges (not exhaustive).                                                             |
| `uses`          | Representative `uses` edges from JSX component references (not exhaustive).                              |
| `runtimeCycles` | File-level cycles without `type` imports (recurring key). Here the re-export cycle survives at runtime.   |
| `partialFiles`  | Files with syntax errors (analysis status `partial`) and the line of their first error.                  |
| `scriptFiles`   | Files without imports or exports (module format `script`).                                               |
| `entryPoints`   | Files declared as entry points by package.json (`main`, `types`, `exports`, `bin`, mapped from `dist`).  |
