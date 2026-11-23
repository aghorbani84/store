import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidIranianMobile,
  normalizeMobile,
  validateCartItems,
  validateOrderPayload,
} from "../dist/validate.js";

test("isValidIranianMobile accepts 09xxxxxxxxx only", () => {
  assert.equal(isValidIranianMobile("09123456789"), true);
  assert.equal(isValidIranianMobile("0912345678"), false); // 10 digits
  assert.equal(isValidIranianMobile("091234567890"), false); // 12 digits
  assert.equal(isValidIranianMobile("08123456789"), false); // wrong prefix
  assert.equal(isValidIranianMobile("+989123456789"), false);
  assert.equal(isValidIranianMobile("0912345678a"), false);
  assert.equal(isValidIranianMobile(""), false);
  assert.equal(isValidIranianMobile(null), false);
  assert.equal(isValidIranianMobile(9123456789), false);
});

test("normalizeMobile converts Persian/Arabic digits and strips separators", () => {
  assert.equal(normalizeMobile("۰۹۱۲۳۴۵۶۷۸۹"), "09123456789");
  assert.equal(normalizeMobile("0912-345-6789"), "09123456789");
  assert.equal(normalizeMobile(" 09123456789 "), "09123456789");
});

test("validateOrderPayload accepts a valid payload (Persian mobile normalised)", () => {
  const { errors, valid } = validateOrderPayload({
    address: "خیابان مدرس، پلاک ۱۲",
    city: "بیرجند",
    items: [{ qty: 2, sku: "PRS-STR-01" }],
    name: "ابوالفضل",
    note: "",
    phone: "۰۹۱۲۳۴۵۶۷۸۹",
    shipping_method: "delivery",
  });
  assert.deepEqual(errors, []);
  assert.equal(valid?.phone, "09123456789");
  assert.equal(valid?.shipping_method, "delivery");
});

test("validateOrderPayload rejects bad phone, missing fields, bad method", () => {
  const { errors, valid } = validateOrderPayload({
    address: "",
    city: "بیرجند",
    items: [{ qty: 1, sku: "PRS-STR-01" }],
    name: " ",
    phone: "12345",
    shipping_method: "express",
  });
  assert.equal(valid, null);
  assert.ok(errors.length >= 4, `expected >=4 errors, got ${errors.length}: ${errors.join("; ")}`);
});

test("validateOrderPayload rejects non-object body", () => {
  assert.equal(validateOrderPayload(null).valid, null);
  assert.equal(validateOrderPayload("x").valid, null);
  assert.equal(validateOrderPayload([]).valid, null);
});

test("validateCartItems rejects empty, duplicate, bad qty, bad sku", () => {
  assert.ok(validateCartItems([]).errors.length > 0);
  assert.ok(validateCartItems(null).errors.length > 0);
  assert.ok(validateCartItems([{ qty: 1, sku: "PRS-STR-01" }, { qty: 1, sku: "PRS-STR-01" }]).errors.length > 0);
  assert.ok(validateCartItems([{ qty: 0, sku: "PRS-STR-01" }]).errors.length > 0);
  assert.ok(validateCartItems([{ qty: 100, sku: "PRS-STR-01" }]).errors.length > 0);
  assert.ok(validateCartItems([{ qty: 1.5, sku: "PRS-STR-01" }]).errors.length > 0);
  assert.ok(validateCartItems([{ qty: 1, sku: "bad sku!" }]).errors.length > 0);
  assert.deepEqual(validateCartItems([{ qty: 3, sku: "PRS-STR-01" }]).valid, [
    { qty: 3, sku: "PRS-STR-01" },
  ]);
});
