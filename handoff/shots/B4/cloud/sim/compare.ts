import { layout, edgeCrossings, DEFAULT_ORDER } from "./opt.ts";
const old = layout({ ApiGateway: { dx: -30 } });
const N = { ApiGateway: 32, UserService: -20, Database: 56, CheckoutService: -8, SessionStore: 20, EventBus: 16, OrderController: 36, InvoiceService: -32, CheckoutController: -36, OrderRepository: 12, UserRepository: -36, OrderService: -4 };
const O = { "ApiGateway>OrderController": -32, "ApiGateway>AuthService": 88, "InvoiceService>UserService": 32, "AuthService>UserRepository": -32, "SessionStore>Database": 32 };
const R = { ...DEFAULT_ORDER, checkout: ["CheckoutService", "CheckoutController"], auth: ["SessionStore", "AuthService"], payments: ["PaymentRepository", "PaymentService", "StripeClient"] };
const neu = layout(Object.fromEntries(Object.entries(N).map(([k, v]) => [k, { dx: v }])), O, R);
console.log("old", JSON.stringify(edgeCrossings(old)));
console.log("new", JSON.stringify(edgeCrossings(neu)));
