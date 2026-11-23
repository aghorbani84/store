import assert from "node:assert/strict";
import test from "node:test";
import {
  SHIPPING_FLAT_FEE_TOMAN,
  SHIPPING_FREE_ABOVE_TOMAN,
  capQty,
  shippingFor,
  subtotal,
  total,
} from "../dist/cart.js";

test("shipping constants match products.json meta.shipping", () => {
  assert.equal(SHIPPING_FLAT_FEE_TOMAN, 150_000);
  assert.equal(SHIPPING_FREE_ABOVE_TOMAN, 10_000_000);
});

test("subtotal sums price x qty (matches static-shop proof)", () => {
  // 2x189,000,000 + 1x4,800,000 = 382,800,000 (static shop HANDOVER proof)
  assert.equal(
    subtotal([
      { price_toman: 189_000_000, qty: 2 },
      { price_toman: 4_800_000, qty: 1 },
    ]),
    382_800_000,
  );
  assert.equal(subtotal([]), 0);
  assert.throws(() => subtotal([{ price_toman: -1, qty: 1 }]), /price_toman/);
  assert.throws(() => subtotal([{ price_toman: 100, qty: 1.5 }]), /qty/);
});

test("shippingFor: flat fee below threshold, free above, pickup always free", () => {
  assert.equal(shippingFor(7_500_000, "delivery"), 150_000);
  assert.equal(shippingFor(9_999_999, "delivery"), 150_000);
  assert.equal(shippingFor(10_000_000, "delivery"), 0);
  assert.equal(shippingFor(382_800_000, "delivery"), 0);
  assert.equal(shippingFor(7_500_000, "pickup"), 0);
  assert.equal(shippingFor(0, "delivery"), 0);
});

test("total = subtotal + shipping", () => {
  assert.equal(total(7_500_000, "delivery"), 7_650_000);
  assert.equal(total(382_800_000, "delivery"), 382_800_000);
  assert.equal(total(7_500_000, "pickup"), 7_500_000);
  assert.equal(total(0, "delivery"), 0);
});

test("capQty caps by stock, 0 when out of stock", () => {
  assert.equal(capQty(2, 4), 2);
  assert.equal(capQty(5, 4), 4);
  assert.equal(capQty(1, 0), 0);
  assert.equal(capQty(-1, 4), 0);
  assert.equal(capQty(1.5, 4), 0);
});
