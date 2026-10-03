import assert from "node:assert";
import { after, before, test } from "node:test";
import app from "../src/app.js";

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
});

test("POST /v1/orders rejects requests without an API key", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/orders",
    payload: { customerId: "c-1", shippingCountry: "DE", lines: [] },
  });
  assert.strictEqual(response.statusCode, 401);
});

test("the legacy POST /orders endpoint is protected as well", async () => {
  const response = await app.inject({ method: "POST", url: "/orders", payload: {} });
  assert.strictEqual(response.statusCode, 401);
});

test("unknown API versions are not routed", async () => {
  const response = await app.inject({ method: "GET", url: "/v2/orders" });
  assert.strictEqual(response.statusCode, 404);
});
