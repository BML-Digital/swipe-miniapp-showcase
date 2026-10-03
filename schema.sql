CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  item_count INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  amount_laari INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  merchant_payment_ref TEXT NOT NULL,
  merchant_short_code TEXT NOT NULL,
  receipt_id TEXT,
  customer_name TEXT NOT NULL,
  customer_mobile TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  delivery_island TEXT NOT NULL,
  delivery_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demo_order_access (
  order_id TEXT PRIMARY KEY REFERENCES orders(order_id),
  session_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS demo_order_access_session ON demo_order_access(session_id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_receipt_unique ON orders(receipt_id) WHERE receipt_id IS NOT NULL;
