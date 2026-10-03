export type Product = {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  priceLaari: number;
  image: string;
  hasSizes: boolean;
};
export type CartItem = { productId: string; variant: string; quantity: number };
export type Delivery = {
  name: string;
  mobile: string;
  address: string;
  island: string;
  notes: string;
};
export type Order = {
  orderId: string;
  productName: string;
  itemCount: number;
  items: Array<
    CartItem & {
      productName: string;
      unitPriceLaari: number;
      lineTotalLaari: number;
    }
  >;
  amountLaari: number;
  amount: number;
  currency: string;
  idempotencyKey: string;
  merchantPaymentRef: string;
  merchantShortCode: string;
  receiptId?: string;
  deliveryIsland: string;
  status: string;
  createdAt: string;
};
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
let demoSession = (() => {
  try {
    const saved = sessionStorage.getItem("swipe-demo-session");
    if (saved) return saved;
  } catch {}
  return crypto.randomUUID();
})();
export function resetDemoSession() {
  demoSession = crypto.randomUUID();
  try {
    sessionStorage.setItem("swipe-demo-session", demoSession);
  } catch {}
}
try {
  sessionStorage.setItem("swipe-demo-session", demoSession);
} catch {}
async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    signal: AbortSignal.timeout(15000),
    credentials: "omit",
    headers: {
      "content-type": "application/json",
      "x-demo-session": demoSession,
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };
  if (!response.ok)
    throw new Error(body.message || `Request failed (${response.status})`);
  return body;
}
export const api = {
  products: () => request<Product[]>("/api/products"),
  orders: () => request<Order[]>("/api/orders"),
  createOrder: (items: CartItem[], delivery: Delivery) =>
    request<Order>("/api/orders", {
      method: "POST",
      body: JSON.stringify({ items, delivery }),
    }),
  fulfill: (id: string, receiptId: string, authToken: string) =>
    request<Order>(`/api/orders/${encodeURIComponent(id)}/fulfill`, {
      method: "POST",
      body: JSON.stringify({ receiptId, authToken }),
    }),
};
