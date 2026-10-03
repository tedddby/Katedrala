# ambiguous-boundaries

A coffee web shop organized by feature directories: `src/catalog`, `src/cart` and `src/checkout`. There is
also a `src/common` directory and an Express entry point, `src/server.ts`. The directory layout looks clean
but tells the wrong story for three files. `src/common` is a grab-bag: only one of its four files is shared
by more than one feature.

## Architecture

```text
src/server.ts                 routes -> catalog, cart, checkout (composition root, not part of a feature)
src/catalog/                  product, product-repository, inventory, category-tree, search, product-view,
                              price-calculator  <- misplaced: a checkout concern
src/cart/                     cart, cart-rules, cart-store, cart-service, cart-view,
                              shipping-estimator <- misplaced: a checkout concern
src/checkout/                 address, shipping-rates, tax-rules, discounts, payment, delivery,
                              order-summary, invoice, checkout-service,
                              stock-availability <- misplaced: a catalog concern
src/common/                   format (shared by all three), slug (catalog only), session (cart only),
                              validation (checkout only)
```

The misleading placements:

| File                                 | Directory  | Used by                                   | Depends on                          |
| ------------------------------------ | ---------- | ----------------------------------------- | ----------------------------------- |
| `src/catalog/price-calculator.ts`    | `catalog`  | 3 checkout files, 1 catalog file          | checkout `tax-rules`, `discounts`   |
| `src/cart/shipping-estimator.ts`     | `cart`     | checkout `delivery`, `order-summary`      | checkout `address`, `shipping-rates`|
| `src/checkout/stock-availability.ts` | `checkout` | catalog `search`, `product-view`          | catalog `inventory`, `product`      |

`price-calculator.ts` is "almost exclusively" used by checkout: `catalog/product-view.ts` uses
`grossPriceCents` to show prices including VAT, and that is its only use inside catalog.

## What it tests

- Inferred modules versus physical directories (ADR-006). Module inference should place each misplaced file
  with the feature it works with, and the difference from the directory layout should be reported.
- Robustness: every other feature file has a strict majority of its dependencies and of its dependents in
  its own directory. The fixture's design was checked under four views (directory or logical feature
  membership, with or without type-only imports), and the result is the same in each. Users of misplaced
  files are therefore not themselves reported as misplaced.
- Grab-bag detection: `src/common` contains files whose users are confined to one feature. A cohesion
  analysis should report that `format.ts` is the only genuinely shared file.
- Composition-root handling: `src/server.ts` imports all three features. It is not a feature member and is
  not counted as a user when deciding where a file belongs.

## Expected conclusions

- Exactly three feature files are misplaced: the three in the table above. `usedMostlyBy` and
  `dependsMostlyOn` both name the other feature. "Mostly" means a strict majority of the distinct dependent
  (or dependency) files located in feature directories. `src/server.ts` and `src/common` files are not
  counted as feature evidence, and the result is the same with or without type-only imports.
- All 20 other files in `src/catalog`, `src/cart` and `src/checkout` are well placed (`wellPlaced`).
- `src/common`: `format.ts` is used by cart, catalog and checkout. `slug.ts` is used only by catalog,
  `session.ts` only by cart and `validation.ts` only by checkout (`grabBag.usedBy`). Whether the
  single-feature common files are also reported as misplaced is not asserted. `misplaced` is exhaustive only
  for the three feature directories.
- Inferred modules follow the features, not the directories: `logicalModules` lists the three
  feature modules with the misplaced files relocated. `src/server.ts` and `src/common/*` are unconstrained.
- The file graph is acyclic, but the directories `src/cart`, `src/catalog` and `src/checkout` form a
  directory-level cycle (`directoryCycles`). This cycle exists only because of the misplacements. Regroup the
  files by feature, with the three misplaced files moved to the feature they serve, and the feature-level
  dependencies become `cart -> catalog` and `catalog -> checkout` with no cycle
  (`featureDependenciesAfterRelocation`, `featureCyclesAfterRelocation`). The remaining cross-feature
  dependencies are `cart/cart-service.ts -> catalog/product-repository.ts` (cart looks up products) and
  `catalog/product-view.ts -> catalog/price-calculator.ts` (catalog shows gross prices). Checkout takes
  its own `CheckoutCart` input type, so it does not depend on the cart feature.

## `expected.json` expectations

A file's feature is the first directory under `src/` that contains it (`catalog`, `cart` or `checkout`).
`src/common` is a shared directory, not a feature, and `src/server.ts` belongs to no feature.

| Key                                  | Meaning                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `features`                           | The feature directories.                                                                         |
| `misplaced`                          | Exactly the feature-directory files whose placement disagrees with their dependencies: `locatedIn` is the directory's feature; `usedMostlyBy` and `dependsMostlyOn` are the strict-majority feature among distinct dependent and dependency files located in feature directories (directory view, all import kinds; the result is the same without type-only imports). |
| `misplacementEvidence`               | Per misplaced file, the per-feature counts of distinct dependents and dependencies behind that verdict. |
| `wellPlaced`                         | All other feature-directory files. None of them may be reported as misplaced.                    |
| `grabBag`                            | For each file in `src/common`, the features of the files that import it.                         |
| `logicalModules`                     | Expected inferred modules (recurring key, see `fixtures/README.md`), named after their feature.  |
| `directoryDependencies`              | Edges of the directory graph (recurring key).                                                     |
| `directoryCycles`                    | SCCs of the directory graph (recurring key).                                                      |
| `featureDependenciesAfterRelocation` | `[from, to]` feature pairs with an import between feature-directory files, after moving the misplaced files to their logical feature (`src/common` and `src/server.ts` excluded). |
| `featureCyclesAfterRelocation`       | Cycles in that feature graph (none).                                                              |
