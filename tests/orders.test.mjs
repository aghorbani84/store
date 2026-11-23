import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canTransition, generateOrderId, isValidOrderId } from "../dist/orders.js";

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, "..");
const migrationPath = join(repoRoot, "migrations", "0001_init.sql");

test("generateOrderId matches PRS-YYMMDD-XXXX", () => {
  const id = generateOrderId(new Date("2026-11-23T12:00:00Z"), () => "1288");
  assert.equal(id, "PRS-261123-1288");
  assert.equal(isValidOrderId(generateOrderId()), true);
  assert.equal(isValidOrderId("PRS-261123-128"), false);
  assert.equal(isValidOrderId("XYZ-261123-1288"), false);
  assert.equal(isValidOrderId(""), false);
});

test("order status transitions: pending -> awaiting_payment -> paid | cancelled", () => {
  assert.equal(canTransition("pending", "awaiting_payment"), true);
  assert.equal(canTransition("pending", "cancelled"), true);
  assert.equal(canTransition("pending", "paid"), false); // must pass awaiting_payment
  assert.equal(canTransition("awaiting_payment", "paid"), true);
  assert.equal(canTransition("awaiting_payment", "cancelled"), true);
  assert.equal(canTransition("awaiting_payment", "pending"), false);
  assert.equal(canTransition("paid", "cancelled"), false);
  assert.equal(canTransition("cancelled", "paid"), false);
});

// Migration smoke test: apply 0001_init.sql to a throwaway local sqlite3 DB
// (same SQLite engine family as D1) and verify the seed exactly.
test("migration 0001_init.sql applies to local sqlite3 and seeds 5 categories + 8 products", () => {
  const dbPath = join(repoRoot, ".migration-test.db");
  try {
    if (existsSync(dbPath)) unlinkSync(dbPath);
    const sql = readFileSync(migrationPath, "utf8");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS products"), "migration must create products");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS orders"), "migration must create orders");
    assert.ok(sql.includes("CREATE TABLE IF NOT EXISTS payments"), "migration must create payments");
    execFileSync("sqlite3", [dbPath], { input: sql });
    const count = execFileSync("sqlite3", [dbPath, "SELECT (SELECT count(*) FROM categories), (SELECT count(*) FROM products), (SELECT count(*) FROM products WHERE demo=1);"], { encoding: "utf8" }).trim();
    assert.equal(count, "5|8|8", `expected 5|8|8, got ${count}`);
    const prices = execFileSync(
      "sqlite3",
      [dbPath, "SELECT sku || '=' || price_toman || '=' || stock FROM products ORDER BY sku;"],
      { encoding: "utf8" },
    ).trim().split("\n");
    assert.deepEqual(prices, [
      "PRS-ACC-01=2700000=10",
      "PRS-GPU-01=112000000=6",
      "PRS-GPU-02=235000000=3",
      "PRS-LTP-01=189000000=4",
      "PRS-LTP-02=549000000=2",
      "PRS-MON-01=18500000=8",
      "PRS-STR-01=4800000=15",
      "PRS-STR-02=3900000=12",
    ]);
    const badSpecs = execFileSync("sqlite3", [dbPath, "SELECT count(*) FROM products WHERE json_valid(specs_json) = 0;"], { encoding: "utf8" }).trim();
    assert.equal(badSpecs, "0", "all specs_json must be valid JSON");
    const tables = execFileSync("sqlite3", [dbPath, ".tables"], { encoding: "utf8" });
    for (const t of ["categories", "products", "orders", "order_items", "payments"]) {
      assert.ok(tables.includes(t), `missing table ${t}`);
    }
  } finally {
    if (existsSync(dbPath)) unlinkSync(dbPath);
  }
});
