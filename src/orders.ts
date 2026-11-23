// Pure order helpers — no D1, no I/O. Unit-tested in tests/orders.test.mjs.

export type OrderStatus = "pending" | "awaiting_payment" | "paid" | "cancelled";

/** Allowed status transitions. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["cancelled", "paid"],
  cancelled: [],
  paid: [],
  pending: ["awaiting_payment", "cancelled"],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Order id format: PRS-YYMMDD-XXXX (random 4 digits).
 * `now` and `random4` are injectable for tests.
 */
export function generateOrderId(
  now: Date = new Date(),
  random4: () => string = () => String(Math.floor(1000 + Math.random() * 9000)),
): string {
  const yy = String(now.getFullYear() % 100).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `PRS-${yy}${mm}${dd}-${random4()}`;
}

export function isValidOrderId(value: unknown): value is string {
  return typeof value === "string" && /^PRS-\d{6}-\d{4}$/.test(value);
}
