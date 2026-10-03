import { orderSchema, proofSchema, readJson, RequestError } from "./validation";
interface Env {
  DB: D1Database;
  DEMO_MODE?: string;
  ALLOWED_ORIGIN?: string;
}

const products = [
  {
    id: "swipe-tee",
    name: "Swipe everyday tee",
    shortDescription: "Heavyweight cotton. Easy fit.",
    description:
      "A relaxed black heavyweight tee with the official Swipe wordmark in pale lavender.",
    priceLaari: 28500,
    image: "./assets/swipe-tee.webp",
    hasSizes: true,
  },
  {
    id: "swipe-cap",
    name: "Swipe violet cap",
    shortDescription: "Cotton twill. One size.",
    description:
      "A structured six-panel cap in Swipe violet with dimensional lavender embroidery.",
    priceLaari: 22000,
    image: "./assets/swipe-cap.webp",
    hasSizes: false,
  },
  {
    id: "swipe-mug",
    name: "Swipe studio mug",
    shortDescription: "Matte stoneware. 350 ml.",
    description:
      "A substantial matte-black stoneware mug finished with Swipe’s dimensional app mark.",
    priceLaari: 16500,
    image: "./assets/swipe-mug.webp",
    hasSizes: false,
  },
];

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
const error = (message: string, status = 400) => json({ message }, status);
const id = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

function secure(response: Response): Response {
  const result = new Response(response.body, response);
  result.headers.set("x-content-type-options", "nosniff");
  result.headers.set("referrer-policy", "no-referrer");
  result.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );
  result.headers.set(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'",
  );
  result.headers.set(
    "strict-transport-security",
    "max-age=31536000; includeSubDomains",
  );
  result.headers.set("cross-origin-resource-policy", "same-origin");
  return result;
}

function originAllowed(origin: string, request: Request, env: Env): boolean {
  const target = new URL(request.url);
  if (origin === target.origin || origin === env.ALLOWED_ORIGIN) return true;
  // Exact local frontend aliases only; never relax deployed Worker origins.
  return (
    env.DEMO_MODE === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
    [
      "http://localhost:8787",
      "http://127.0.0.1:8787",
      "http://[::1]:8787",
    ].includes(origin)
  );
}

function withCors(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("origin");
  if (!origin || !originAllowed(origin, request, env)) return response;
  const result = new Response(response.body, response);
  result.headers.set("access-control-allow-origin", origin);
  result.headers.set("vary", "Origin");
  return result;
}

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "GET" && url.pathname === "/api/health")
    return json({ status: "ok", runtime: "cloudflare-worker" });
  if (request.method === "GET" && url.pathname === "/api/products")
    return json(products);
  const protectedPath =
    url.pathname === "/api/orders" ||
    /^\/api\/orders\/[^/]+\/fulfill$/.test(url.pathname);
  if (
    protectedPath &&
    (env.DEMO_MODE !== "true" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  )
    return error(
      "Production authentication and Swipe proof verification must be configured before enabling orders.",
      501,
    );
  const session = request.headers.get("x-demo-session") || "";
  if (protectedPath && !/^[0-9a-f-]{36}$/i.test(session))
    return error("Demo session is required.", 401);
  if (request.method === "GET" && url.pathname === "/api/orders") {
    const result = await env.DB.prepare(
      "SELECT orders.* FROM orders JOIN demo_order_access USING (order_id) WHERE session_id = ? ORDER BY created_at DESC LIMIT 50",
    )
      .bind(session)
      .all();
    return json(result.results.map(toOrder));
  }
  if (request.method === "POST" && url.pathname === "/api/orders") {
    const parsed = orderSchema.safeParse(await readJson(request));
    if (!parsed.success) return error("Invalid cart or delivery details.");
    const { items, delivery } = parsed.data;
    const lineItems = [];
    const seen = new Set<string>();
    for (const requested of items) {
      const product = products.find((item) => item.id === requested.productId)!;
      const variant = requested.variant;
      if (product.hasSizes ? variant === "ONE" : variant !== "ONE")
        return error("Choose a valid variant.");
      const key = product.id + ":" + variant;
      if (seen.has(key)) return error("Duplicate cart lines are not allowed.");
      seen.add(key);
      lineItems.push({
        productId: product.id,
        productName: product.name,
        variant,
        quantity: requested.quantity,
        unitPriceLaari: product.priceLaari,
        lineTotalLaari: product.priceLaari * requested.quantity,
      });
    }
    const normalizedMobile = delivery.mobile;
    const amountLaari = lineItems.reduce(
      (total, item) => total + item.lineTotalLaari,
      0,
    );
    const itemCount = lineItems.reduce(
      (total, item) => total + item.quantity,
      0,
    );
    const productName =
      itemCount === 1
        ? lineItems[0].productName
        : `Merch order · ${itemCount} items`;
    const order = {
      orderId: id("ord"),
      productName,
      itemCount,
      items: lineItems,
      amountLaari,
      amount: amountLaari / 100,
      currency: "MVR",
      idempotencyKey: crypto.randomUUID(),
      merchantPaymentRef: id("pay_demo"),
      merchantShortCode: `DEMO${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      status: "created",
      createdAt: new Date().toISOString(),
      customerName: delivery.name.trim(),
      customerMobile: normalizedMobile,
      deliveryAddress: delivery.address.trim(),
      deliveryIsland: delivery.island.trim(),
      deliveryNotes: delivery.notes?.trim() || "",
    };
    const insertOrder = env.DB.prepare(
      "INSERT INTO orders (order_id, product_name, item_count, items_json, amount_laari, amount, currency, idempotency_key, merchant_payment_ref, merchant_short_code, customer_name, customer_mobile, delivery_address, delivery_island, delivery_notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      order.orderId,
      order.productName,
      order.itemCount,
      JSON.stringify(order.items),
      order.amountLaari,
      order.amount,
      order.currency,
      order.idempotencyKey,
      order.merchantPaymentRef,
      order.merchantShortCode,
      order.customerName,
      order.customerMobile,
      order.deliveryAddress,
      order.deliveryIsland,
      order.deliveryNotes,
      order.status,
      order.createdAt,
    );
    const insertAccess = env.DB.prepare(
      "INSERT INTO demo_order_access (order_id, session_id) VALUES (?, ?)",
    ).bind(order.orderId, session);
    await env.DB.batch([insertOrder, insertAccess]);
    return json(
      toOrder(
        (await env.DB.prepare("SELECT * FROM orders WHERE order_id = ?")
          .bind(order.orderId)
          .first()) || {},
      ),
      201,
    );
  }
  const fulfill = url.pathname.match(/^\/api\/orders\/([^/]+)\/fulfill$/);
  if (request.method === "POST" && fulfill) {
    const parsed = proofSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return error("Development receipt proof was rejected.", 403);
    const body = parsed.data;
    const row = await env.DB.prepare(
      "SELECT orders.* FROM orders JOIN demo_order_access USING (order_id) WHERE order_id = ? AND session_id = ?",
    )
      .bind(fulfill[1], session)
      .first();
    if (!row) return error("Order not found.", 404);
    if (row.status === "fulfilled")
      return row.receipt_id === body.receiptId
        ? json(toOrder(row))
        : error("Order was already fulfilled.", 409);
    const used = await env.DB.prepare(
      "SELECT order_id FROM orders WHERE receipt_id = ?",
    )
      .bind(body.receiptId)
      .first();
    if (used) return error("Receipt was already used.", 409);
    const updated = await env.DB.prepare(
      "UPDATE orders SET receipt_id = ?, status = 'fulfilled' WHERE order_id = ? AND status = 'created' AND receipt_id IS NULL",
    )
      .bind(body.receiptId, fulfill[1])
      .run();
    if (!updated.meta.changes)
      return error("Order is missing or was already fulfilled.", 409);
    const completed = await env.DB.prepare(
      "SELECT * FROM orders WHERE order_id = ?",
    )
      .bind(fulfill[1])
      .first();
    return completed
      ? json(toOrder(completed))
      : error("Order not found.", 404);
  }
  if (request.method === "POST" && url.pathname === "/api/profile/session")
    return env.DEMO_MODE === "true"
      ? error("Mock profile tokens are never accepted by the backend.", 403)
      : error("Production profile-token verification is not configured.", 501);
  if (request.method === "POST" && url.pathname === "/api/webhooks/swipe")
    return error("Webhook verification is not configured.", 501);
  return error("Not found.", 404);
}

function toOrder(row: Record<string, unknown>) {
  return {
    orderId: row.order_id,
    productName: row.product_name,
    itemCount: row.item_count,
    items: JSON.parse(String(row.items_json || "[]")),
    amountLaari: row.amount_laari,
    amount: row.amount,
    currency: row.currency,
    idempotencyKey: row.idempotency_key,
    merchantPaymentRef: row.merchant_payment_ref,
    merchantShortCode: row.merchant_short_code,
    receiptId: row.receipt_id || undefined,
    deliveryIsland: row.delivery_island,
    status: row.status,
    createdAt: row.created_at,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("origin");
      if (origin && !originAllowed(origin, request, env))
        return secure(error("Origin is not allowed.", 403));
      if (url.pathname.startsWith("/api/") && request.method === "OPTIONS") {
        const origin = request.headers.get("origin");
        if (!origin || !originAllowed(origin, request, env))
          return secure(error("Origin is not allowed.", 403));
        return secure(
          withCors(
            new Response(null, {
              status: 204,
              headers: {
                "access-control-allow-methods": "GET, POST, OPTIONS",
                "access-control-allow-headers": "content-type, x-demo-session",
                "access-control-max-age": "600",
              },
            }),
            request,
            env,
          ),
        );
      }
      if (url.pathname.startsWith("/api/"))
        return secure(withCors(await api(request, env, url), request, env));
      return secure(error("This Worker exposes API routes only.", 404));
    } catch (cause) {
      if (cause instanceof RequestError)
        return secure(
          withCors(error(cause.message, cause.status), request, env),
        );
      console.error("API request failed.");
      return secure(
        withCors(
          error("Unable to complete this request. Please retry.", 500),
          request,
          env,
        ),
      );
    }
  },
} satisfies ExportedHandler<Env>;
