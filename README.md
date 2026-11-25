# Parseh Store

**A Persian-first (RTL) computer and electronics storefront running on Cloudflare Workers and D1.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Cloudflare D1](https://img.shields.io/badge/database-Cloudflare%20D1-F38020?logo=cloudflare&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A520-339933?logo=nodedotjs&logoColor=white)
[![GitHub stars](https://img.shields.io/github/stars/aghorbani84/store?style=flat)](https://github.com/aghorbani84/store/stargazers)

## Overview

Parseh Store (پارسه) is the server-backed version of the [Parseh shop](https://github.com/aghorbani84/parseh-shop):
a framework-free Cloudflare Worker that serves a Persian RTL storefront and a small JSON API, with orders
stored in Cloudflare D1.

> **Demo catalog.** All 8 seeded products are marked `demo` and their prices are samples, not real
> prices. Payment endpoints are **stubs**: they never report a payment as successful, and no card data is
> handled anywhere.

## Features

- **Storefront pages** (server-rendered RTL HTML): home, shop with search/category/sort, product, cart,
  checkout, confirmation, and info pages (about, contact, FAQ, shipping, returns, privacy, terms).
- **Product API**: list with `category`, `q`, and `sort` (`default`, `cheapest`, `expensive`, `name`), or fetch one by SKU.
- **Orders API** with server-side validation (Iranian mobile numbers, Persian digits normalised), stock checks,
  `Idempotency-Key` support, and order IDs in the form `PRS-YYMMDD-XXXX`.
- **Shipping rule**: flat 150,000 Toman, free above a 10,000,000 Toman subtotal, free pickup.
- **Order status machine**: `pending` → `awaiting_payment` → `paid` | `cancelled`.
- **Security basics**: parameterised SQL, escaped HTML, CSP and other security headers, same-origin API,
  and best-effort per-IP rate limiting on order and payment endpoints.

## API

| Method & path | Description |
| --- | --- |
| `GET /api/health` | Health check |
| `GET /api/products?category=&q=&sort=` | List products |
| `GET /api/products/:sku` | One product, or 404 |
| `POST /api/orders` | Create an order (validated, idempotent, rate-limited) |
| `GET /api/orders/:id` | One order with its items, or 404 |
| `POST /api/payments/request` · `GET /api/payments/callback` · `POST /api/payments/verify` | Demo stubs |

## Tech stack

| Area | Choice |
| --- | --- |
| Runtime | Cloudflare Workers (plain router, no framework) |
| Database | Cloudflare D1, SQL migrations in `migrations/` |
| Static assets | Workers Static Assets (`public/`) |
| Language | TypeScript (strict) |
| Tests | Node's built-in test runner (`node:test`) |
| Tooling | Wrangler |
| CI/CD | GitHub Actions: typecheck, test, dry-run build; deploy on `main` |

The only dependencies are dev tools: `typescript`, `wrangler`, and `@cloudflare/workers-types`.

## Getting started

Requires Node.js 20 or newer. Local development needs no Cloudflare account.

```bash
git clone https://github.com/aghorbani84/store.git
cd store
npm ci
npx wrangler d1 migrations apply store-db --local   # first run only
npm run dev                                         # http://127.0.0.1:8787
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the Worker locally with a local D1 database |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Compile and run the `node:test` suites |
| `npm run build` | Compile and run `wrangler deploy --dry-run` |

### Deploying

`wrangler.jsonc` ships with the placeholder `PLACEHOLDER_STORE_DB_ID`; no real database ID is committed.
The deploy workflow replaces it from a secret, applies D1 migrations remotely, and deploys. It needs these
GitHub Actions secrets and fails loudly if any is missing:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `D1_DATABASE_ID`

Create the database once with `npx wrangler d1 create store-db`. Never commit real IDs, tokens, or `.dev.vars`.

## Project structure

```
src/
  index.ts      router, API handlers, security headers, rate limiting
  db.ts         D1 helpers
  validate.ts   request validation
  cart.ts       cart and shipping math
  orders.ts     order IDs and status machine
  render.ts     RTL HTML rendering and escaping
public/         storefront CSS, client JS, product images (SVG)
migrations/     0001_init.sql: schema, categories, demo products
tests/          cart, orders, and validation tests
.github/workflows/  deploy.yml, import-archive.yml
```

## Author

Built by [Abolfazl Ghorbani](https://github.com/aghorbani84).
