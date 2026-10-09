import { NODES } from "./system.ts";
import { measurementOf, termEvidenceOf } from "./metrics.ts";
for (const n of NODES) {
  const m = measurementOf(n.id);
  const e = (k: any) => termEvidenceOf(n.id, k);
  console.log(n.id.padEnd(20), "g", m.gravity.toFixed(2), "btw", m.betweenness.toFixed(1),
    "| reach", e("reach").members.length, e("reach").edges.length,
    "| fan-in", e("fan-in").members.length, "| spread", e("spread").members.length,
    "| brokerage", e("brokerage").members.length, e("brokerage").edges.length);
}
for (const id of ["PaymentService", "OrderService", "CheckoutController"]) {
  console.log(id, "brokerage:", termEvidenceOf(id, "brokerage").members.join(","), "|", termEvidenceOf(id, "brokerage").edges.join(" "));
}
