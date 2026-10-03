import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: ".test-worker/index.js",
    compatibilityDate: "2026-08-23",
    d1Databases: ["DB"],
    bindings: { DEMO_MODE: "true", ALLOWED_ORIGIN: "http://localhost:8787" },
  }),
);
const session = crypto.randomUUID();
let checks = 0;
const payload = {
  items: [
    { productId: "swipe-tee", variant: "L", quantity: 2 },
    { productId: "swipe-mug", variant: "ONE", quantity: 1 },
  ],
  delivery: {
    name: "Demo Customer",
    mobile: "+960\u00a0900 4455",
    address: "Example house, example street",
    island: "Addu",
    notes: "",
  },
};
async function call(path, body, options = {}) {
  return runtime.dispatchFetch(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "content-type": "application/json",
      "x-demo-session": session,
      ...options.headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...options,
  });
}
function check(actual, expected) {
  assert.deepEqual(actual, expected);
  checks++;
}
try {
  const db = await runtime.getD1Database("DB");
  const schema = await readFile("schema.sql", "utf8");
  for (const statement of schema.split(";").filter((v) => v.trim()))
    await db.prepare(statement).run();
  check((await call("/")).status, 404);
  check((await call("/api/health")).status, 200);
  for (const origin of [
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://[::1]:8787",
  ]) {
    const response = await call("/api/health", undefined, {
      headers: { origin },
    });
    check(response.status, 200);
    check(response.headers.get("access-control-allow-origin"), origin);
    check(
      (
        await call("/api/orders", undefined, {
          method: "OPTIONS",
          headers: { origin },
        })
      ).status,
      204,
    );
  }
  check(
    (
      await call("/api/health", undefined, {
        headers: { origin: "http://127.0.0.1:8789" },
      })
    ).status,
    403,
  );
  check(
    (
      await runtime.dispatchFetch("https://deployed.example/api/health", {
        headers: { origin: "http://127.0.0.1:8787" },
      })
    ).status,
    403,
  );
  check((await call("/api/orders", null)).status, 400);
  check(
    (
      await call("/api/orders", {
        ...payload,
        delivery: { ...payload.delivery, address: "H. A" },
      })
    ).status,
    201,
  );
  check(
    (
      await call("/api/orders", {
        ...payload,
        delivery: { ...payload.delivery, address: "   " },
      })
    ).status,
    400,
  );
  check((await call("/api/orders", { ...payload, items: [null] })).status, 400);
  check(
    (
      await call("/api/orders", {
        ...payload,
        delivery: { ...payload.delivery, name: 123 },
      })
    ).status,
    400,
  );
  check(
    (
      await call("/api/orders", {
        ...payload,
        items: [{ productId: "swipe-tee", variant: "L", quantity: "2" }],
      })
    ).status,
    400,
  );
  check(
    (
      await call("/api/orders", {
        ...payload,
        items: [payload.items[0], payload.items[0]],
      })
    ).status,
    400,
  );
  check((await call("/api/orders", { ...payload, amount: 1 })).status, 400);
  check(
    (
      await call("/api/orders", payload, {
        headers: { "content-type": "text/plain", "x-demo-session": session },
      })
    ).status,
    415,
  );
  check(
    (
      await call("/api/orders", undefined, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-demo-session": session,
        },
        body: "x".repeat(17000),
      })
    ).status,
    413,
  );
  check(
    (
      await call("/api/orders", payload, {
        headers: {
          "content-type": "application/json",
          "x-demo-session": session,
          origin: "https://evil.example",
        },
      })
    ).status,
    403,
  );
  const response = await call("/api/orders", payload);
  check(response.status, 201);
  const first = await response.json();
  check(first.amountLaari, 73500);
  check(first.itemCount, 3);
  check(
    (
      await db
        .prepare("SELECT customer_mobile FROM orders WHERE order_id = ?")
        .bind(first.orderId)
        .first()
    ).customer_mobile,
    "+9609004455",
  );
  const others = await call("/api/orders", undefined, {
    headers: { "x-demo-session": crypto.randomUUID() },
  });
  check(await others.json(), []);
  const proof = { receiptId: "rcpt_mock_test", authToken: "mock.receipt.test" };
  check(
    (
      await call(`/api/orders/${first.orderId}/fulfill`, proof, {
        headers: {
          "content-type": "application/json",
          "x-demo-session": crypto.randomUUID(),
        },
      })
    ).status,
    404,
  );
  check(
    (await call(`/api/orders/${first.orderId}/fulfill`, proof)).status,
    200,
  );
  check(
    (await call(`/api/orders/${first.orderId}/fulfill`, proof)).status,
    200,
  );
  const second = await (await call("/api/orders", payload)).json();
  check(
    (await call(`/api/orders/${second.orderId}/fulfill`, proof)).status,
    409,
  );
  check(
    (
      await runtime.dispatchFetch("https://demo.example/api/orders", {
        headers: { "x-demo-session": session },
      })
    ).status,
    501,
  );
  check((await call("/api/webhooks/swipe", {})).status, 501);
  console.log(`${checks} API security and order-flow checks passed.`);
} finally {
  await runtime.dispose();
}
