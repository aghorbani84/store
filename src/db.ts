// D1 helpers. All queries are parameterised — never string-concatenated SQL.
import { shippingFor, subtotal } from "./cart.js";
import { canTransition, generateOrderId, type OrderStatus } from "./orders.js";
import type { ValidOrderPayload } from "./validate.js";

export interface Category {
  description: string;
  id: string;
  name: string;
}

export interface Product {
  badge: string;
  category: string;
  demo: boolean;
  image: string;
  name: string;
  old_price_toman: number | null;
  price_toman: number;
  short: string;
  sku: string;
  specs: Record<string, string>;
  stock: number;
}

export interface OrderItem {
  name: string;
  price_toman: number;
  qty: number;
  sku: string;
}

export interface Order {
  address: string;
  city: string;
  created_at: string;
  id: string;
  idempotency_key: string | null;
  items: OrderItem[];
  name: string;
  note: string;
  phone: string;
  shipping_fee_toman: number;
  shipping_method: string;
  status: OrderStatus;
  subtotal_toman: number;
  total_toman: number;
}

interface ProductRow {
  badge: string;
  category: string;
  demo: number;
  image: string;
  name: string;
  old_price_toman: number | null;
  price_toman: number;
  short: string;
  sku: string;
  specs_json: string;
  stock: number;
}

interface OrderRow {
  address: string;
  city: string;
  created_at: string;
  id: string;
  idempotency_key: string | null;
  name: string;
  note: string;
  phone: string;
  shipping_fee_toman: number;
  shipping_method: string;
  status: string;
  subtotal_toman: number;
  total_toman: number;
}

function rowToProduct(row: ProductRow): Product {
  let specs: Record<string, string> = {};
  try {
    const parsed: unknown = JSON.parse(row.specs_json);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      specs = parsed as Record<string, string>;
    }
  } catch {
    specs = {};
  }
  return {
    badge: row.badge,
    category: row.category,
    demo: row.demo === 1,
    image: row.image,
    name: row.name,
    old_price_toman: row.old_price_toman,
    price_toman: row.price_toman,
    short: row.short,
    sku: row.sku,
    specs,
    stock: row.stock,
  };
}

const PRODUCT_COLUMNS =
  "sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json";

export async function getCategories(db: D1Database): Promise<Category[]> {
  const { results } = await db
    .prepare("SELECT id, name, description FROM categories ORDER BY id")
    .all<Category>();
  return results ?? [];
}

export type ProductSort = "cheapest" | "default" | "expensive" | "name";

export async function getProducts(
  db: D1Database,
  opts: { category?: string | undefined; q?: string | undefined; sort?: ProductSort } = {},
): Promise<Product[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.category) {
    conditions.push("category = ?");
    params.push(opts.category);
  }
  if (opts.q) {
    conditions.push("(name LIKE ? OR short LIKE ? OR sku LIKE ? OR specs_json LIKE ?)");
    const like = `%${opts.q}%`;
    params.push(like, like, like, like);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  let orderBy = "ORDER BY sku";
  if (opts.sort === "cheapest") orderBy = "ORDER BY price_toman ASC";
  else if (opts.sort === "expensive") orderBy = "ORDER BY price_toman DESC";
  else if (opts.sort === "name") orderBy = "ORDER BY name ASC";
  const { results } = await db
    .prepare(`SELECT ${PRODUCT_COLUMNS} FROM products ${where} ${orderBy}`)
    .bind(...params)
    .all<ProductRow>();
  return (results ?? []).map(rowToProduct);
}

export async function getProductBySku(db: D1Database, sku: string): Promise<Product | null> {
  const row = await db
    .prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE sku = ?`)
    .bind(sku)
    .first<ProductRow>();
  return row === null ? null : rowToProduct(row);
}

async function getOrderWithItems(db: D1Database, orderId: string): Promise<Order | null> {
  const row = await db
    .prepare(
      "SELECT id, name, phone, city, address, shipping_method, shipping_fee_toman, " +
        "subtotal_toman, total_toman, status, note, idempotency_key, created_at " +
        "FROM orders WHERE id = ?",
    )
    .bind(orderId)
    .first<OrderRow>();
  if (row === null) return null;
  const { results } = await db
    .prepare("SELECT sku, name, price_toman, qty FROM order_items WHERE order_id = ? ORDER BY id")
    .bind(orderId)
    .all<OrderItem>();
  return {
    address: row.address,
    city: row.city,
    created_at: row.created_at,
    id: row.id,
    idempotency_key: row.idempotency_key,
    items: results ?? [],
    name: row.name,
    note: row.note,
    phone: row.phone,
    shipping_fee_toman: row.shipping_fee_toman,
    shipping_method: row.shipping_method,
    status: row.status as OrderStatus,
    subtotal_toman: row.subtotal_toman,
    total_toman: row.total_toman,
  };
}

export async function getOrderById(db: D1Database, orderId: string): Promise<Order | null> {
  return getOrderWithItems(db, orderId);
}

export async function findOrderByIdempotencyKey(
  db: D1Database,
  key: string,
): Promise<Order | null> {
  const row = await db
    .prepare("SELECT id FROM orders WHERE idempotency_key = ?")
    .bind(key)
    .first<{ id: string }>();
  if (row === null) return null;
  return getOrderWithItems(db, row.id);
}

export interface CreateOrderResult {
  created: boolean;
  order: Order;
}

/**
 * Create an order + its items in ONE D1 batch (atomic), decrementing stock.
 * Throws Error("OUT_OF_STOCK:<sku>") when a line exceeds stock, or
 * Error("PRODUCT_NOT_FOUND:<sku>") for an unknown SKU.
 * Caller must have validated the payload and checked idempotency first.
 */
export async function createOrder(
  db: D1Database,
  payload: ValidOrderPayload,
  idempotencyKey: string | null,
): Promise<CreateOrderResult> {
  const products = new Map<string, Product>();
  for (const item of payload.items) {
    const product = await getProductBySku(db, item.sku);
    if (product === null) throw new Error(`PRODUCT_NOT_FOUND:${item.sku}`);
    if (item.qty > product.stock) throw new Error(`OUT_OF_STOCK:${item.sku}`);
    products.set(item.sku, product);
  }

  const lines = payload.items.map((item) => ({
    price_toman: products.get(item.sku)?.price_toman ?? 0,
    qty: item.qty,
  }));
  const sub = subtotal(lines);
  const shipping = shippingFor(sub, payload.shipping_method);
  const total = sub + shipping;
  const orderId = generateOrderId();
  const createdAt = new Date().toISOString();

  const statements: D1PreparedStatement[] = [];
  statements.push(
    db
      .prepare(
        "INSERT INTO orders (id, name, phone, city, address, shipping_method, " +
          "shipping_fee_toman, subtotal_toman, total_toman, status, note, idempotency_key, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
      )
      .bind(
        orderId,
        payload.name,
        payload.phone,
        payload.city,
        payload.address,
        payload.shipping_method,
        shipping,
        sub,
        total,
        payload.note,
        idempotencyKey,
        createdAt,
      ),
  );
  for (const item of payload.items) {
    const product = products.get(item.sku);
    if (!product) continue;
    statements.push(
      db
        .prepare(
          "INSERT INTO order_items (order_id, sku, name, price_toman, qty) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(orderId, item.sku, product.name, product.price_toman, item.qty),
    );
    statements.push(
      db
        .prepare("UPDATE products SET stock = stock - ? WHERE sku = ? AND stock >= ?")
        .bind(item.qty, item.sku, item.qty),
    );
  }

  await db.batch(statements);
  const order = await getOrderWithItems(db, orderId);
  if (order === null) throw new Error("ORDER_CREATE_FAILED");
  return { created: true, order };
}

/**
 * Transition an order's status. Throws when the transition is not allowed.
 * Returns the updated order.
 */
export async function transitionOrderStatus(
  db: D1Database,
  orderId: string,
  to: OrderStatus,
): Promise<Order> {
  const order = await getOrderWithItems(db, orderId);
  if (order === null) throw new Error("ORDER_NOT_FOUND");
  if (!canTransition(order.status, to)) {
    throw new Error(`INVALID_TRANSITION:${order.status}->${to}`);
  }
  await db.prepare("UPDATE orders SET status = ? WHERE id = ?").bind(to, orderId).run();
  const updated = await getOrderWithItems(db, orderId);
  if (updated === null) throw new Error("ORDER_NOT_FOUND");
  return updated;
}

/**
 * Mark an order paid ONLY after verifying the paid amount equals the order total.
 * This is the gate a real payment gateway must pass through; the Zarinpal
 * endpoints are currently DEMO stubs and never call this.
 */
export async function markOrderPaid(
  db: D1Database,
  orderId: string,
  amountToman: number,
): Promise<Order> {
  const order = await getOrderWithItems(db, orderId);
  if (order === null) throw new Error("ORDER_NOT_FOUND");
  if (amountToman !== order.total_toman) {
    throw new Error(`AMOUNT_MISMATCH:expected=${order.total_toman},got=${amountToman}`);
  }
  if (order.status === "paid") return order;
  // Flow is pending -> awaiting_payment -> paid; advance through it.
  let current = order;
  if (current.status === "pending") {
    current = await transitionOrderStatus(db, orderId, "awaiting_payment");
  }
  return transitionOrderStatus(db, orderId, "paid");
}
