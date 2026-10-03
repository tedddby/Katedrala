/**
 * The demonstration system: a small commerce backend used by the page's interactive drawings.
 * It is illustrative data, labelled as such wherever it appears. Every derived number shown on the page
 * (load, reach, gravity) is computed from this graph by `lib/demo/metrics.ts`, never typed in by hand.
 */

export type ModuleId =
  "gateway" | "auth" | "checkout" | "orders" | "billing" | "payments" | "users" | "platform";

export interface DemoModule {
  readonly id: ModuleId;
  readonly name: string;
}

export type DemoEdgeKind = "calls" | "instantiates" | "accesses-data" | "implements" | "imports";

export interface DemoNode {
  readonly id: string;
  readonly module: ModuleId;
  /** What the unit is, in the vocabulary Katedrala's roles use. */
  readonly role: string;
  /** Source file, as it would appear in a document. */
  readonly file: string;
}

export interface DemoEdge {
  /** The dependent: it rests on `target`. */
  readonly source: string;
  readonly target: string;
  readonly kind: DemoEdgeKind;
}

export const MODULES: readonly DemoModule[] = [
  { id: "gateway", name: "Gateway" },
  { id: "auth", name: "Auth" },
  { id: "checkout", name: "Checkout" },
  { id: "orders", name: "Orders" },
  { id: "billing", name: "Billing" },
  { id: "payments", name: "Payments" },
  { id: "users", name: "Users" },
  { id: "platform", name: "Platform" },
];

export const NODES: readonly DemoNode[] = [
  {
    id: "ApiGateway",
    module: "gateway",
    role: "route definition",
    file: "src/gateway/api-gateway.ts",
  },
  { id: "AuthService", module: "auth", role: "service", file: "src/auth/auth.service.ts" },
  { id: "SessionStore", module: "auth", role: "repository", file: "src/auth/session.store.ts" },
  {
    id: "CheckoutController",
    module: "checkout",
    role: "http controller",
    file: "src/checkout/checkout.controller.ts",
  },
  {
    id: "CheckoutService",
    module: "checkout",
    role: "service",
    file: "src/checkout/checkout.service.ts",
  },
  {
    id: "OrderController",
    module: "orders",
    role: "http controller",
    file: "src/orders/order.controller.ts",
  },
  { id: "OrderService", module: "orders", role: "service", file: "src/orders/order.service.ts" },
  {
    id: "OrderRepository",
    module: "orders",
    role: "repository",
    file: "src/orders/order.repository.ts",
  },
  {
    id: "InvoiceService",
    module: "billing",
    role: "service",
    file: "src/billing/invoice.service.ts",
  },
  {
    id: "PaymentService",
    module: "payments",
    role: "service",
    file: "src/payments/payment.service.ts",
  },
  {
    id: "PaymentRepository",
    module: "payments",
    role: "repository",
    file: "src/payments/payment.repository.ts",
  },
  {
    id: "StripeClient",
    module: "payments",
    role: "external client",
    file: "src/payments/stripe.client.ts",
  },
  { id: "UserService", module: "users", role: "service", file: "src/users/user.service.ts" },
  {
    id: "UserRepository",
    module: "users",
    role: "repository",
    file: "src/users/user.repository.ts",
  },
  { id: "EventBus", module: "platform", role: "utility", file: "src/platform/event-bus.ts" },
  {
    id: "Database",
    module: "platform",
    role: "configuration provider",
    file: "src/platform/database.ts",
  },
];

export const EDGES: readonly DemoEdge[] = [
  { source: "ApiGateway", target: "AuthService", kind: "calls" },
  { source: "ApiGateway", target: "CheckoutController", kind: "calls" },
  { source: "ApiGateway", target: "OrderController", kind: "calls" },
  { source: "CheckoutController", target: "CheckoutService", kind: "calls" },
  { source: "OrderController", target: "OrderService", kind: "calls" },
  { source: "CheckoutService", target: "OrderService", kind: "calls" },
  { source: "CheckoutService", target: "PaymentService", kind: "calls" },
  { source: "CheckoutService", target: "UserService", kind: "calls" },
  { source: "OrderService", target: "InvoiceService", kind: "calls" },
  { source: "OrderService", target: "PaymentService", kind: "calls" },
  { source: "OrderService", target: "OrderRepository", kind: "calls" },
  { source: "OrderService", target: "EventBus", kind: "calls" },
  { source: "InvoiceService", target: "PaymentService", kind: "calls" },
  { source: "InvoiceService", target: "UserService", kind: "calls" },
  { source: "PaymentService", target: "StripeClient", kind: "instantiates" },
  { source: "PaymentService", target: "PaymentRepository", kind: "calls" },
  { source: "AuthService", target: "SessionStore", kind: "calls" },
  { source: "AuthService", target: "UserRepository", kind: "calls" },
  { source: "UserService", target: "UserRepository", kind: "calls" },
  { source: "OrderRepository", target: "Database", kind: "accesses-data" },
  { source: "PaymentRepository", target: "Database", kind: "accesses-data" },
  { source: "UserRepository", target: "Database", kind: "accesses-data" },
  { source: "SessionStore", target: "Database", kind: "accesses-data" },
];

export function moduleName(id: ModuleId): string {
  return MODULES.find((module) => module.id === id)?.name ?? id;
}
