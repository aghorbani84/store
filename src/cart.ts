// Pure cart math — no D1, no I/O. Unit-tested in tests/cart.test.mjs.
// Shipping rule (from products.json meta.shipping, demo until the owner says otherwise):
// flat 150,000 Toman; free above 10,000,000 Toman subtotal; free Birjand pickup.

export const SHIPPING_FLAT_FEE_TOMAN = 150_000;
export const SHIPPING_FREE_ABOVE_TOMAN = 10_000_000;

export interface PricedLine {
  price_toman: number;
  qty: number;
}

/** Sum of price × qty. Throws on negative / non-integer input. */
export function subtotal(lines: PricedLine[]): number {
  let sum = 0;
  for (const line of lines) {
    if (!Number.isInteger(line.price_toman) || line.price_toman < 0) {
      throw new Error("price_toman must be a non-negative integer");
    }
    if (!Number.isInteger(line.qty) || line.qty < 0) {
      throw new Error("qty must be a non-negative integer");
    }
    sum += line.price_toman * line.qty;
  }
  return sum;
}

/** Shipping fee for a subtotal and method. Empty cart ships free (nothing to ship). */
export function shippingFor(subtotalToman: number, method: "delivery" | "pickup"): number {
  if (method === "pickup") return 0;
  if (subtotalToman <= 0) return 0;
  if (subtotalToman >= SHIPPING_FREE_ABOVE_TOMAN) return 0;
  return SHIPPING_FLAT_FEE_TOMAN;
}

export function total(subtotalToman: number, method: "delivery" | "pickup"): number {
  return subtotalToman + shippingFor(subtotalToman, method);
}

/** Cap a requested quantity by available stock; 0 when out of stock. */
export function capQty(requestedQty: number, stock: number): number {
  if (!Number.isInteger(requestedQty) || requestedQty < 0) return 0;
  if (!Number.isInteger(stock) || stock <= 0) return 0;
  return Math.min(requestedQty, stock);
}

/** Format a Toman amount with Persian digits, e.g. 189000000 -> "۱۸۹٬۰۰۰٬۰۰۰ تومان". */
export function formatToman(amount: number): string {
  return `${amount.toLocaleString("fa-IR")} تومان`;
}
