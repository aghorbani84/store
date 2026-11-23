# Store — Persian-first e-commerce on Cloudflare

Parseh (پارسه) — a Persian-first computer & electronics shop from Birjand — rebuilt on
Cloudflare Workers + D1. Persian RTL storefront, Vazirmatn, black `#141414` + gold `#c9a227`.

> **Demo catalog:** all 8 products in the seed are DEMO (`demo: true`). Prices are Nov 2026
> market-range samples, not real prices. Every page carries the banner
> «کاتالوگ نمونه: قیمت‌ها واقعی نیستند؛ لیست واقعی به‌زودی.»
> until the owner supplies real data. Never use these prices, stock levels, or discounts
> as reference. Payment is a DEMO stub — orders are completed via Instagram DM
> (`@parseh`, https://ig.me/m/parseh) until a real gateway is connected.

## Source archive

The initial project source should be uploaded from the provided `store-cloudflare.zip` archive. Extract it before uploading so the repository root contains `package.json`, `wrangler.jsonc`, `src/`, `public/`, `migrations/`, `tests/`, and `.github/workflows/deploy.yml`.

## Stack

- **Runtime:** Cloudflare Workers (no framework; plain router in `src/index.ts`)
- **Database:** Cloudflare D1 (`store-db`), migrations in `migrations/`
- **Assets:** Workers Static Assets (`public/` — CSS/JS only; no binaries)
- **Language:** TypeScript (strict), Node 20+ for tests
- **Dependencies (minimal):** `typescript`, `wrangler`, `@cloudflare/workers-types` (all dev).
  No other dependencies. Tests use Node's built-in runner (`node:test` + `node:assert`).

## Local dev

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm test            # tsc + node --test tests/
npm run build       # tsc + wrangler deploy --dry-run
npm run dev         # wrangler dev --local (local D1; apply migrations first: npx wrangler d1 migrations apply store-db --local)
```

`wrangler dev --local` starts the Worker on http://127.0.0.1:8787 with a **local** D1
database — no Cloudflare account or credentials needed. **First run only:** apply the
migration to the local database (verified 2026-11-23 — `wrangler dev` does NOT
auto-apply migrations; without this step every D1 query fails with
`no such table: products`):

```bash
npx wrangler d1 migrations apply store-db --local
```

## D1 database id placeholder

`wrangler.jsonc` ships with `database_id: "PLACEHOLDER_STORE_DB_ID"` on purpose — no real
D1 id is committed to the repo. Before any wrangler command that needs the database
(remote migrations or deploy):

```bash
# locally
sed -i "s/PLACEHOLDER_STORE_DB_ID/<real D1 id>/g" wrangler.jsonc
# in CI, deploy.yml does this automatically from the D1_DATABASE_ID secret
```

Create the database once (needs a Cloudflare login):

```bash
npx wrangler d1 create store-db
```

then use its id above. Never commit a real id, token, or `.dev.vars`.

## Deployment prerequisites

- Cloudflare D1 database named `store-db`

- GitHub Actions secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `D1_DATABASE_ID`

Do not commit credentials, `.dev.vars`, or real secret values.

On push to `main`, `.github/workflows/deploy.yml` typechecks, tests, builds, then
`sed`-replaces the placeholder D1 id from `D1_DATABASE_ID`, applies migrations
(`wrangler d1 migrations apply store-db --remote`) and deploys. If any of the three
secrets is unset, the deploy job **fails loudly** naming the missing secret(s) —
it never silently skips or fakes success. Pull requests run the checks only.

## CI/CD

The workflow is designed to run unit tests and, on pushes to `main`, apply D1 migrations and deploy the Worker. It has not yet been verified in GitHub Actions.

## API contract (frozen — Builder B builds the storefront on this)

Base: same origin (no CORS; no `Access-Control-Allow-Origin: *`).

| Method & path | Description |
|---|---|
| `GET /api/health` | `{ ok: true, demo: true, service: "parseh-store", time }` |
| `GET /api/products?category=&q=&sort=` | List products. `sort`: `default` \| `cheapest` \| `expensive` \| `name`. Returns `{ products: [...] }`. |
| `GET /api/products/:sku` | One product, `{ product }`, or 404 `{ error }`. |
| `POST /api/orders` | Create order. See below. |
| `GET /api/orders/:id` | One order with items, `{ order }`, or 404. |
| `POST /api/payments/request` | **DEMO stub** — `{ demo: true, message: "درگاه پرداخت هنوز متصل نشده است…" }`. |
| `GET /api/payments/callback` | **DEMO stub** — same shape. |
| `POST /api/payments/verify` | **DEMO stub** — same shape. Never claims a payment succeeded. |

Product object: `{ sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs }`
(`specs` is an object; `old_price_toman` is `null` when absent.)

### `POST /api/orders`

Headers: `Content-Type: application/json`; optional `Idempotency-Key` (1–128 chars) —
same key returns the existing order (`{ order, replayed: true }`, 200) and never
creates a duplicate. Rate limit: 10 requests / 60 s per IP (429 beyond that).

Request body:

```json
{
  "name": "نام و نام خانوادگی",
  "phone": "09123456789",
  "city": "بیرجند",
  "address": "…",
  "shipping_method": "delivery",
  "note": "",
  "items": [{ "sku": "PRS-STR-01", "qty": 2 }]
}
```

- `phone` must be an Iranian mobile `09xxxxxxxxx` (Persian digits are normalised).
- `shipping_method`: `delivery` | `pickup`.
- `items`: 1–50 lines, unique SKUs, integer `qty` 1–99; stock is checked server-side.
- Success: `201 { order, replayed: false }`. Validation errors: `400 { errors: [...] }`.
  Unknown SKU: `400`. Insufficient stock: `409`.

Order object: `{ id, name, phone, city, address, shipping_method, shipping_fee_toman,
subtotal_toman, total_toman, status, note, idempotency_key, created_at, items: [{ sku, name, price_toman, qty }] }`.
Order id format: `PRS-YYMMDD-XXXX`.

Shipping rule: flat 150,000 Toman; free above 10,000,000 Toman subtotal; free Birjand
pickup. Order status flow: `pending` → `awaiting_payment` → `paid` | `cancelled`.
Payment verification must check `amount == order.total_toman` before marking paid
(`markOrderPaid` in `src/db.ts` enforces this).

### Pages (server-rendered shells; Builder B skins them)

`/` · `/shop` (query: `q`, `category`, `sort`) · `/product?sku=…` · `/cart` ·
`/checkout` · `/confirmation?order=…` · `/about` · `/contact` · `/faq` · `/shipping` ·
`/returns` · `/privacy` · `/terms`. All pages carry the demo banner.

## Project layout

```
package.json  wrangler.jsonc  tsconfig.json
src/          index.ts (router+API)  db.ts (D1 helpers)  validate.ts (pure validation)
              cart.ts (pure cart math)  orders.ts (order id + status machine)
              render.ts (RTL HTML helpers)
migrations/   0001_init.sql (schema + 5 categories + 8 demo products)
tests/        validation.test.mjs  cart.test.mjs  orders.test.mjs (incl. sqlite migration smoke test)
public/       css/style.css (storefront stylesheet)  js/app.js (client app: cart, checkout, confirmation)
.github/workflows/  deploy.yml  import-archive.yml (verbatim, unused)
```

## Security notes

- All D1 queries are parameterised; never string-concatenated SQL.
- All HTML output is escaped (`escapeHtml` in `src/render.ts`).
- JSON `Content-Type` on API responses; same-origin only (no wildcard CORS).
- Security headers on every response: CSP, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- Basic in-memory per-IP rate limiting on `POST /api/orders` and payment endpoints
  (see `src/index.ts` — best-effort per isolate, resets on deploy).
- No card data anywhere. No secrets in the repo.

## Important

Keep this repository private until you intentionally choose to open-source the code.
