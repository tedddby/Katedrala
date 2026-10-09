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
    role: "HTTP controller",
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
    role: "HTTP controller",
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
    role: "data model",
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

// Rules: the architecture the page declares for the demonstration system, and one change checked against it.

export interface DemoRule {
  readonly id: string;
  readonly severity: "error" | "warning";
  /** The constrained files: a group (`from`) or a module (`module`). */
  readonly from?: string;
  readonly module?: string;
  /** Groups or modules the constrained files must not depend on. */
  readonly cannotDependOn: readonly string[];
}

export interface RuleConfig {
  readonly groups: Readonly<Record<string, readonly string[]>>;
  readonly modules: Readonly<Record<string, readonly string[]>>;
  readonly rules: readonly DemoRule[];
}

/** The rules section of katedrala.config.yaml for the demonstration system, in the syntax of Katedrala's rule fixtures. */
export const RULE_CONFIG: RuleConfig = {
  groups: {
    controllers: ["src/**/*.controller.ts"],
    repositories: ["src/**/*.repository.ts"],
  },
  modules: {
    payments: ["src/payments/**"],
    analytics: ["src/analytics/**"],
  },
  rules: [
    {
      id: "controllers-no-database",
      severity: "error",
      from: "controllers",
      cannotDependOn: ["repositories"],
    },
    {
      id: "payments-isolation",
      severity: "error",
      module: "payments",
      cannotDependOn: ["analytics"],
    },
  ],
};

/**
 * A hypothetical change, not part of the system: a direct import from a controller to a repository. The Rules
 * section and the validate transcript check the system with this one dependency added.
 */
export const RULE_CHANGE: DemoEdge = {
  source: "OrderController",
  target: "OrderRepository",
  kind: "imports",
};

export interface RuleViolation {
  readonly rule: DemoRule;
  readonly source: string;
  readonly target: string;
  /** The dependent's file, where the dependency is declared. */
  readonly file: string;
}

/** A configuration glob as a pattern: `**` spans directories, `*` stays within one path segment. */
function globPattern(glob: string): RegExp {
  const source = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) =>
      part === "**/"
        ? "(?:.*/)?"
        : part === "**"
          ? ".*"
          : part === "*"
            ? "[^/]*"
            : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return new RegExp(`^${source}$`);
}

/** Every dependency in `edges` that a rule forbids, matched on the members' files as Katedrala matches globs. */
export function checkRules(
  edges: readonly DemoEdge[],
  config: RuleConfig = RULE_CONFIG,
): RuleViolation[] {
  const fileOf = new Map(NODES.map((node) => [node.id, node.file]));
  const patterns = (name: string) =>
    [...(config.groups[name] ?? []), ...(config.modules[name] ?? [])].map(globPattern);
  const matches = (selection: readonly RegExp[], member: string) => {
    const file = fileOf.get(member);
    return file !== undefined && selection.some((pattern) => pattern.test(file));
  };
  const violations: RuleViolation[] = [];
  for (const rule of config.rules) {
    const constrained = patterns(rule.from ?? rule.module ?? "");
    const forbidden = rule.cannotDependOn.flatMap(patterns);
    for (const edge of edges) {
      if (matches(constrained, edge.source) && matches(forbidden, edge.target)) {
        violations.push({
          rule,
          source: edge.source,
          target: edge.target,
          file: fileOf.get(edge.source)!,
        });
      }
    }
  }
  return violations;
}
