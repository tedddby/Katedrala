/**
 * The clusterings of §3.16 on the design prototype's graphs (`prototypeModel`, plan 6.1), written by hand for
 * the P9 replays of plan 6.4: §3.13's worked example and every §3.16 confidence of layered-architecture,
 * ambiguous-boundaries, clean-architecture, tangled-architecture and dependency-violations.
 *
 * Memberships are §3.16's (layered-architecture and ambiguous-boundaries list them file by file; the others
 * follow from its text: feature or layer directories, stems, the root module). The P3 classes are those of
 * the plan's rules on the prototype graphs: §3.13 names layered-architecture's (`main.ts` and
 * `shared/{database,errors,http,logger}.ts`), and the others reproduce §3.16's confidences exactly, which
 * depend on them through the evidence graph. Relocations are §3.9's three moves with their in and out
 * weights on the prototype graph.
 *
 * Not part of the package build (`tsconfig.build.json` excludes `*test-support.ts`).
 */
import type { HandClusteringSpec } from "./hand-built.test-support.js";

/** The declared modules of dependency-violations' configuration (`src/payments/**`, `src/analytics/**`). */
export const DEPENDENCY_VIOLATIONS_DECLARED = Object.freeze({
  analytics: "src/analytics/",
  payments: "src/payments/",
});

/** Hand-built clusterings of the five design fixtures (one scope each: the root package). */
export const DESIGN_CLUSTERINGS: Readonly<Record<string, HandClusteringSpec>> = {
  "layered-architecture": {
    units: [
      {
        anchor: { directory: "src" },
        kind: "root",
        name: "shop-backend",
        members: ["src/main.ts"],
      },
      {
        anchor: { directory: "src", stem: "order" },
        kind: "stem",
        name: "orders",
        group: "src",
        members: [
          "src/controllers/order.controller.ts",
          "src/models/order-line.ts",
          "src/models/order.ts",
          "src/repositories/order.repository.ts",
          "src/services/order.service.ts",
        ],
      },
      {
        anchor: { directory: "src", stem: "payment" },
        kind: "stem",
        name: "payments",
        group: "src",
        members: [
          "src/controllers/payment.controller.ts",
          "src/models/payment.ts",
          "src/repositories/payment.repository.ts",
          "src/services/payment-gateway.ts",
          "src/services/payment.service.ts",
        ],
      },
      {
        anchor: { directory: "src", stem: "user" },
        kind: "stem",
        name: "users",
        group: "src",
        members: [
          "src/controllers/user.controller.ts",
          "src/models/user.ts",
          "src/repositories/user.repository.ts",
          "src/services/user.service.ts",
        ],
      },
      {
        anchor: { directory: "src/shared" },
        kind: "shared",
        name: "shared",
        members: [
          "src/shared/config.ts",
          "src/shared/database.ts",
          "src/shared/errors.ts",
          "src/shared/http.ts",
          "src/shared/logger.ts",
        ],
      },
    ],
    orchestrators: { "src/main.ts": [1, 3] },
    utilities: {
      "src/shared/database.ts": 3,
      "src/shared/errors.ts": 3,
      "src/shared/http.ts": 3,
      "src/shared/logger.ts": 2,
    },
    facades: [],
    groups: [
      {
        directory: "src",
        style: "layer",
        layerChildren: ["src/controllers", "src/models", "src/repositories", "src/services"],
        featureChildren: [],
        sharedChildren: ["src/shared"],
        layerFiles: 14,
        recurrentStems: ["order", "payment", "user"],
        coveredFiles: 14,
        stemsApplied: true,
      },
    ],
    sourceRoot: "src",
  },
  "ambiguous-boundaries": {
    units: [
      {
        anchor: { directory: "src" },
        kind: "root",
        name: "coffee-shop",
        members: ["src/server.ts"],
      },
      {
        anchor: { directory: "src/cart" },
        kind: "feature",
        name: "cart",
        members: [
          "src/cart/cart-rules.ts",
          "src/cart/cart-service.ts",
          "src/cart/cart-store.ts",
          "src/cart/cart-view.ts",
          "src/cart/cart.ts",
        ],
        prior: [
          "src/cart/cart-rules.ts",
          "src/cart/cart-service.ts",
          "src/cart/cart-store.ts",
          "src/cart/cart-view.ts",
          "src/cart/cart.ts",
          "src/cart/shipping-estimator.ts",
        ],
      },
      {
        anchor: { directory: "src/catalog" },
        kind: "feature",
        name: "catalog",
        members: [
          "src/catalog/category-tree.ts",
          "src/catalog/inventory.ts",
          "src/catalog/product-repository.ts",
          "src/catalog/product-view.ts",
          "src/catalog/product.ts",
          "src/catalog/search.ts",
          "src/checkout/stock-availability.ts",
        ],
        prior: [
          "src/catalog/category-tree.ts",
          "src/catalog/inventory.ts",
          "src/catalog/price-calculator.ts",
          "src/catalog/product-repository.ts",
          "src/catalog/product-view.ts",
          "src/catalog/product.ts",
          "src/catalog/search.ts",
        ],
      },
      {
        anchor: { directory: "src/checkout" },
        kind: "feature",
        name: "checkout",
        members: [
          "src/cart/shipping-estimator.ts",
          "src/catalog/price-calculator.ts",
          "src/checkout/address.ts",
          "src/checkout/checkout-service.ts",
          "src/checkout/delivery.ts",
          "src/checkout/discounts.ts",
          "src/checkout/invoice.ts",
          "src/checkout/order-summary.ts",
          "src/checkout/payment.ts",
          "src/checkout/shipping-rates.ts",
          "src/checkout/tax-rules.ts",
        ],
        prior: [
          "src/checkout/address.ts",
          "src/checkout/checkout-service.ts",
          "src/checkout/delivery.ts",
          "src/checkout/discounts.ts",
          "src/checkout/invoice.ts",
          "src/checkout/order-summary.ts",
          "src/checkout/payment.ts",
          "src/checkout/shipping-rates.ts",
          "src/checkout/stock-availability.ts",
          "src/checkout/tax-rules.ts",
        ],
      },
      {
        anchor: { directory: "src/common" },
        kind: "shared",
        name: "common",
        members: [
          "src/common/format.ts",
          "src/common/session.ts",
          "src/common/slug.ts",
          "src/common/validation.ts",
        ],
      },
    ],
    orchestrators: { "src/server.ts": [1, 3] },
    utilities: { "src/common/format.ts": 3 },
    facades: [],
    groups: [
      {
        directory: "src",
        style: "feature",
        layerChildren: [],
        featureChildren: ["src/cart", "src/catalog", "src/checkout"],
        sharedChildren: ["src/common"],
        layerFiles: 0,
        recurrentStems: [],
        coveredFiles: 0,
        stemsApplied: false,
      },
    ],
    relocations: [
      {
        path: "src/cart/shipping-estimator.ts",
        from: "src/cart",
        to: "src/checkout",
        dependents: { "src/checkout": { weight: 2, files: 2 } },
        dependencies: { "src/checkout": 2 },
      },
      {
        path: "src/catalog/price-calculator.ts",
        from: "src/catalog",
        to: "src/checkout",
        dependents: {
          "src/catalog": { weight: 1, files: 1 },
          "src/checkout": { weight: 3, files: 3 },
        },
        dependencies: { "src/checkout": 2 },
      },
      {
        path: "src/checkout/stock-availability.ts",
        from: "src/checkout",
        to: "src/catalog",
        dependents: { "src/catalog": { weight: 2, files: 2 } },
        dependencies: { "src/catalog": 1.5 },
      },
    ],
    sourceRoot: "src",
  },
  "clean-architecture": {
    units: [
      {
        anchor: { directory: "src" },
        kind: "root",
        name: "library-lending",
        members: ["src/main.ts"],
      },
      {
        anchor: { directory: "src/application" },
        kind: "layer",
        name: "application",
        members: [
          "src/application/borrow-book.ts",
          "src/application/dto.ts",
          "src/application/return-book.ts",
          "src/application/send-overdue-reminders.ts",
        ],
      },
      {
        anchor: { directory: "src/domain" },
        kind: "layer",
        name: "domain",
        members: [
          "src/domain/index.ts",
          "src/domain/model/book.ts",
          "src/domain/model/errors.ts",
          "src/domain/model/loan.ts",
          "src/domain/model/member.ts",
          "src/domain/ports/book-repository.ts",
          "src/domain/ports/clock.ts",
          "src/domain/ports/loan-repository.ts",
          "src/domain/ports/member-repository.ts",
          "src/domain/ports/notifier.ts",
        ],
      },
      {
        anchor: { directory: "src/infrastructure" },
        kind: "layer",
        name: "infrastructure",
        members: [
          "src/infrastructure/notifications/smtp-notifier.ts",
          "src/infrastructure/persistence/pool.ts",
          "src/infrastructure/persistence/sql-book-repository.ts",
          "src/infrastructure/persistence/sql-loan-repository.ts",
          "src/infrastructure/persistence/sql-member-repository.ts",
          "src/infrastructure/system-clock.ts",
        ],
      },
      {
        anchor: { directory: "src/presentation" },
        kind: "layer",
        name: "presentation",
        members: [
          "src/presentation/http/error-mapper.ts",
          "src/presentation/http/http-types.ts",
          "src/presentation/http/loan-routes.ts",
          "src/presentation/http/server.ts",
        ],
      },
    ],
    orchestrators: { "src/main.ts": [1, 3] },
    utilities: {},
    facades: ["src/domain/index.ts"],
    groups: [
      {
        directory: "src",
        style: "layer",
        layerChildren: ["src/application", "src/domain", "src/infrastructure", "src/presentation"],
        featureChildren: [],
        sharedChildren: [],
        layerFiles: 24,
        recurrentStems: [],
        coveredFiles: 0,
        stemsApplied: false,
      },
    ],
    sourceRoot: "src",
  },
  "tangled-architecture": {
    units: [
      {
        anchor: { directory: "src" },
        kind: "root",
        name: "corner-shop",
        members: ["src/main.ts"],
      },
      {
        anchor: { directory: "src/cart" },
        kind: "feature",
        name: "cart",
        members: [
          "src/cart/abandonment.ts",
          "src/cart/cart-repository.ts",
          "src/cart/cart-service.ts",
          "src/cart/cart-stats.ts",
          "src/cart/cart.ts",
        ],
      },
      {
        anchor: { directory: "src/catalog" },
        kind: "feature",
        name: "catalog",
        members: [
          "src/catalog/index.ts",
          "src/catalog/pricing.ts",
          "src/catalog/product-service.ts",
          "src/catalog/product.ts",
          "src/catalog/recommendations.ts",
        ],
      },
      {
        anchor: { directory: "src/checkout" },
        kind: "feature",
        name: "checkout",
        members: [
          "src/checkout/checkout-service.ts",
          "src/checkout/order-history.ts",
          "src/checkout/order.ts",
          "src/checkout/payment.ts",
          "src/checkout/receipts.ts",
        ],
      },
      {
        anchor: { directory: "src/customers" },
        kind: "feature",
        name: "customers",
        members: [
          "src/customers/addresses.ts",
          "src/customers/customer-service.ts",
          "src/customers/customer.ts",
          "src/customers/loyalty.ts",
          "src/customers/segments.ts",
        ],
      },
      {
        anchor: { directory: "src/inventory" },
        kind: "feature",
        name: "inventory",
        members: [
          "src/inventory/reservations.ts",
          "src/inventory/stock-level.ts",
          "src/inventory/stock-service.ts",
          "src/inventory/subscribers.ts",
          "src/inventory/warehouses.ts",
        ],
      },
      {
        anchor: { directory: "src/lib" },
        kind: "shared",
        name: "lib",
        members: ["src/lib/db.ts", "src/lib/events.ts", "src/lib/money.ts"],
      },
    ],
    orchestrators: { "src/main.ts": [1, 4] },
    utilities: {
      "src/catalog/product-service.ts": 3,
      "src/checkout/order-history.ts": 3,
      "src/customers/loyalty.ts": 3,
      "src/lib/db.ts": 5,
      "src/lib/events.ts": 2,
      "src/lib/money.ts": 3,
    },
    facades: ["src/catalog/index.ts"],
    groups: [
      {
        directory: "src",
        style: "feature",
        layerChildren: [],
        featureChildren: [
          "src/cart",
          "src/catalog",
          "src/checkout",
          "src/customers",
          "src/inventory",
        ],
        sharedChildren: ["src/lib"],
        layerFiles: 0,
        recurrentStems: [],
        coveredFiles: 0,
        stemsApplied: false,
      },
    ],
    sourceRoot: "src",
  },
  "dependency-violations": {
    units: [
      {
        anchor: { directory: "src" },
        kind: "root",
        name: "order-backend",
        members: ["src/config.ts", "src/main.ts"],
      },
      {
        anchor: { directory: "src", stem: "customer" },
        kind: "stem",
        name: "customers",
        group: "src",
        members: [
          "src/controllers/customer.controller.ts",
          "src/domain/customer.ts",
          "src/repositories/customer.repository.ts",
          "src/services/customer.service.ts",
        ],
      },
      {
        anchor: { directory: "src", stem: "order" },
        kind: "stem",
        name: "orders",
        group: "src",
        members: [
          "src/controllers/order.controller.ts",
          "src/domain/order.ts",
          "src/repositories/order.repository.ts",
          "src/services/order.service.ts",
        ],
      },
      {
        anchor: { directory: "src", stem: "refund" },
        kind: "stem",
        name: "refund",
        group: "src",
        members: ["src/controllers/refund.controller.ts", "src/services/refund.service.ts"],
      },
      {
        anchor: { directory: "src/repositories" },
        kind: "layer",
        name: "repositories",
        members: ["src/repositories/database.ts"],
      },
    ],
    orchestrators: { "src/main.ts": [1, 3] },
    utilities: {},
    facades: [],
    groups: [
      {
        directory: "src",
        style: "layer",
        layerChildren: ["src/controllers", "src/domain", "src/repositories", "src/services"],
        featureChildren: [],
        sharedChildren: [],
        layerFiles: 11,
        recurrentStems: ["customer", "order", "refund"],
        coveredFiles: 10,
        stemsApplied: true,
      },
    ],
    sourceRoot: "src",
  },
};
