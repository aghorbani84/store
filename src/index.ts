// Parseh store — Cloudflare Worker entry. No framework; plain router.
// Pages are minimal functional server-rendered shells (Builder B skins them).
// API contract is FROZEN — see README.md "API contract".
import { shippingFor, subtotal, total as cartTotal, formatToman } from "./cart.js";
import {
  createOrder,
  findOrderByIdempotencyKey,
  getOrderById,
  getProductBySku,
  getProducts,
  getCategories,
  type Product,
} from "./db.js";
import { isValidOrderId } from "./orders.js";
import {
  CONTACT_EMAIL,
  IG_URL,
  demoBanner,
  escapeHtml,
  infoPage,
  layout,
  productCard,
  productListHtml,
} from "./render.js";
import { validateOrderPayload } from "./validate.js";

export interface Env {
  ASSETS?: Fetcher;
  DB: D1Database;
}

// ---------------------------------------------------------------------------
// Security headers + rate limiting
// ---------------------------------------------------------------------------

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' https: data:; style-src 'self' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function withSecurity(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(res.body, { headers, status: res.status, statusText: res.statusText });
}

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return withSecurity(
    new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
      status,
    }),
  );
}

function html(body: string, status = 200): Response {
  return withSecurity(
    new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" }, status }),
  );
}

// Rate limiting: in-memory per-IP fixed window. Workers-free-tier appropriate:
// a single isolate's memory is the store, so limits are best-effort per isolate
// and reset on deploy/isolate recycle. Limits:
//   POST /api/orders            — 10 requests / 60 s per IP
//   POST /api/payments/*        — 20 requests / 60 s per IP
//   all other routes            — no limit (reads are cheap and cached by the CDN)
interface RateEntry {
  count: number;
  resetAt: number;
}
const rateLimits = new Map<string, RateEntry>();

function rateLimited(ip: string, key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const mapKey = `${key}:${ip}`;
  const entry = rateLimits.get(mapKey);
  if (entry === undefined || now >= entry.resetAt) {
    rateLimits.set(mapKey, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (entry.count >= limit) return true;
  entry.count += 1;
  return false;
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

// ---------------------------------------------------------------------------
// Payment stubs (DEMO) — Zarinpal structure only, no merchant ID exists.
// These NEVER claim a payment succeeded. Real gateway integration must:
//   1. create a payments row with status "started",
//   2. redirect to Zarinpal with the order total,
//   3. on callback, verify amount == order.total_toman via markOrderPaid()
//      (see src/db.ts) before marking the order paid.
// ---------------------------------------------------------------------------

const PAYMENT_DEMO = {
  demo: true,
  message: "درگاه پرداخت هنوز متصل نشده است — سفارش با دایرکت اینستاگرام ثبت می‌شود",
};

function paymentDemo(status = 200): Response {
  return json(PAYMENT_DEMO, status);
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

async function homePage(env: Env): Promise<Response> {
  const [products, categories] = await Promise.all([
    getProducts(env.DB, {}),
    getCategories(env.DB),
  ]);
  const featured = products.slice(0, 4);
  const cats = categories
    .map(
      (c) =>
        `<li><a href="/shop?category=${escapeHtml(c.id)}">${escapeHtml(c.name)}</a> — ${escapeHtml(c.description)}</li>`,
    )
    .join("\n");
  const body = `<section class="hero">
    <h1>پارسه — کامپیوتر و لوازم الکترونیک</h1>
    <p>فروشگاه بیرجند؛ قیمت مکتوب، پرداخت پس از تأیید.</p>
  </section>
  <section><h2>دسته‌بندی‌ها</h2><ul>${cats}</ul></section>
  <section><h2>محصولات منتخب</h2>${productListHtml(featured)}</section>
  <section><h2>چرا پارسه؟</h2>
    <p>قیمت مکتوب پیش از خرید؛ مشاوره پیش از سفارش؛ تحویل حضوری در بیرجند رایگان است.</p>
    <h3>مراحل سفارش</h3>
    <ol><li>محصول را به سبد اضافه کنید.</li><li>اطلاعات تماس را ثبت کنید.</li><li>متن آماده را در دایرکت اینستاگرام بفرستید.</li></ol>
  </section>`;
  return html(layout("خانه", body, "/"));
}

async function shopPage(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const sortParam = url.searchParams.get("sort") ?? "default";
  const sort = sortParam === "cheapest" || sortParam === "expensive" || sortParam === "name"
    ? sortParam
    : "default";
  const products = await getProducts(env.DB, {
    category: category === "" ? undefined : category,
    q: q === "" ? undefined : q,
    sort,
  });
  const categories = await getCategories(env.DB);
  const options = categories
    .map(
      (c) =>
        `<option value="${escapeHtml(c.id)}"${c.id === category ? " selected" : ""}>${escapeHtml(c.name)}</option>`,
    )
    .join("\n");
  const body = `<h1>فروشگاه</h1>
  <form method="get" action="/shop" class="filters">
    <label>جستجو <input type="search" name="q" value="${escapeHtml(q)}" placeholder="نام، کد یا مشخصات" /></label>
    <label>دسته <select name="category"><option value="">همه</option>${options}</select></label>
    <label>مرتب‌سازی <select name="sort">
      <option value="default"${sort === "default" ? " selected" : ""}>پیش‌فرض</option>
      <option value="cheapest"${sort === "cheapest" ? " selected" : ""}>ارزان‌ترین</option>
      <option value="expensive"${sort === "expensive" ? " selected" : ""}>گران‌ترین</option>
      <option value="name"${sort === "name" ? " selected" : ""}>نام (الفبا)</option>
    </select></label>
    <button type="submit">اعمال</button>
  </form>
  <p>${products.length.toLocaleString("fa-IR")} محصول</p>
  ${productListHtml(products)}`;
  return html(layout("فروشگاه", body, "/shop"));
}

async function productPage(env: Env, url: URL): Promise<Response> {
  const sku = url.searchParams.get("sku") ?? "";
  const product = sku === "" ? null : await getProductBySku(env.DB, sku);
  if (product === null) {
    return html(layout("محصول یافت نشد", "<h1>محصول یافت نشد</h1><p><a href=\"/shop\">بازگشت به فروشگاه</a></p>", "/shop"), 404);
  }
  const specs = Object.entries(product.specs)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join("\n");
  const related = (await getProducts(env.DB, { category: product.category }))
    .filter((p) => p.sku !== product.sku)
    .slice(0, 4);
  const body = `<article class="product-detail">
    <h1>${escapeHtml(product.name)}</h1>
    ${product.demo ? `<span class="badge">نمونه</span>` : ""}
    <p>${escapeHtml(product.short)}</p>
    <p class="price">${formatToman(product.price_toman)}</p>
    <p>${product.stock > 0 ? `موجودی: ${product.stock.toLocaleString("fa-IR")}` : "ناموجود"}</p>
    <label>تعداد <input id="qty" type="number" min="1" max="${product.stock}" value="1" /></label>
    <button type="button" data-add-to-cart="${escapeHtml(product.sku)}" ${product.stock <= 0 ? "disabled" : ""}>افزودن به سبد</button>
    <h2>مشخصات</h2>
    <table><tbody>${specs}</tbody></table>
  </article>
  <section><h2>محصولات مرتبط</h2>${productListHtml(related)}</section>`;
  return html(layout(product.name, body, "/shop"));
}

function cartPage(): Response {
  const body = `<h1>سبد خرید</h1>
  <div id="cart-root"><p>در حال بارگذاری سبد…</p></div>
  <p><a href="/shop">ادامهٔ خرید</a> · <a href="/checkout">ثبت سفارش</a></p>`;
  return html(layout("سبد خرید", body, "/cart"));
}

function checkoutPage(): Response {
  const body = `<h1>ثبت سفارش</h1>
  <div id="checkout-summary"></div>
  <form id="checkout-form">
    <label>نام و نام خانوادگی <input name="name" required maxlength="100" /></label>
    <label>موبایل <input name="phone" required inputmode="tel" placeholder="09xxxxxxxxx" /></label>
    <label>شهر <input name="city" required maxlength="60" value="بیرجند" /></label>
    <label>آدرس <textarea name="address" required maxlength="500"></textarea></label>
    <label>روش ارسال
      <select name="shipping_method">
        <option value="delivery">ارسال با پست/پیک (۱۵۰٬۰۰۰ تومان؛ رایگان بالای ۱۰٬۰۰۰٬۰۰۰ تومان)</option>
        <option value="pickup">تحویل حضوری در بیرجند (رایگان)</option>
      </select>
    </label>
    <label>توضیحات (اختیاری) <textarea name="note" maxlength="500"></textarea></label>
    <p id="checkout-error" class="error" hidden></p>
    <button type="submit">ثبت سفارش</button>
  </form>`;
  return html(layout("ثبت سفارش", body, "/cart"));
}

function confirmationPage(url: URL): Response {
  const orderId = url.searchParams.get("order") ?? "";
  const safeId = isValidOrderId(orderId) ? orderId : "";
  const body = `<h1>سفارش ثبت شد</h1>
  <div id="confirmation-root" data-order="${escapeHtml(safeId)}"><p>در حال بارگذاری…</p></div>
  <p>پرداخت آنلاین هنوز متصل نشده است؛ سفارش شما با دایرکت اینستاگرام نهایی می‌شود.</p>
  <p><a class="button" href="${IG_URL}">ارسال در دایرکت اینستاگرام</a></p>
  <p><button type="button" disabled>دیجی‌پی — به‌زودی</button></p>`;
  return html(layout("تأیید سفارش", body, "/cart"));
}

function aboutPage(): Response {
  return html(
    infoPage(
      "دربارهٔ پارسه",
      [
        "پارسه (Pārsa) فروشگاه کامپیوتر و لوازم الکترونیک در بیرجند است.",
        "هدف ما قیمت مکتوب پیش از خرید و مشاورهٔ صادقانه پیش از سفارش است.",
        "کاتالوگ فعلی نمونه است؛ لیست واقعی محصولات به‌زودی جایگزین می‌شود.",
      ],
      "/about",
    ),
  );
}

function contactPage(): Response {
  return html(
    infoPage(
      "تماس با ما",
      [
        `ایمیل: ${CONTACT_EMAIL}`,
        "اینستاگرام: @parseh (لینک دایرکت در صفحهٔ تأیید سفارش)",
        "فروشگاه در بیرجند است؛ تحویل حضوری رایگان انجام می‌شود.",
      ],
      "/contact",
    ),
  );
}

function faqPage(): Response {
  return html(
    infoPage(
      "سوالات متداول",
      [
        "سفارش چطور نهایی می‌شود؟ پس از ثبت سفارش، متن آماده را در دایرکت اینستاگرام پارسه بفرستید.",
        "پرداخت چطور انجام می‌شود؟ پرداخت آنلاین هنوز متصل نشده است؛ لینک دیجی‌پی به‌زودی فعال می‌شود.",
        "هزینهٔ ارسال چقدر است؟ ۱۵۰٬۰۰۰ تومان؛ سفارش‌های بالای ۱۰٬۰۰۰٬۰۰۰ تومان رایگان؛ تحویل حضوری در بیرجند رایگان.",
        "قیمت‌ها واقعی‌اند؟ نه — کاتالوگ فعلی نمونه است و قیمت‌ها واقعی نیستند.",
      ],
      "/faq",
    ),
  );
}

function shippingPage(): Response {
  return html(
    infoPage(
      "ارسال",
      [
        "هزینهٔ ارسال ۱۵۰٬۰۰۰ تومان است.",
        "سفارش‌های با جمع اقلام ۱۰٬۰۰۰٬۰۰۰ تومان و بیشتر، ارسال رایگان دارند.",
        "تحویل حضوری در بیرجند رایگان است.",
        "قانون ارسال نمونه است و با اعلام مالک تغییر می‌کند.",
      ],
      "/shipping",
    ),
  );
}

function returnsPage(): Response {
  return html(
    infoPage(
      "بازگشت کالا",
      [
        "شرایط بازگشت و گارانتی پیش‌نویس‌اند و با اعلام مالک نهایی می‌شوند.",
        "مطابق مادهٔ ۳۷ قانون تجارت الکترونیک، خریدار تا ۷ روز پس از تحویل حق انصراف دارد.",
        "کالای بازگشتی باید سالم و در بسته‌بندی اولیه باشد.",
      ],
      "/returns",
    ),
  );
}

function privacyPage(): Response {
  return html(
    infoPage(
      "حریم خصوصی",
      [
        "ما فقط اطلاعاتی را می‌گیریم که برای ثبت و تحویل سفارش لازم است: نام، موبایل، شهر و آدرس.",
        "هیچ اطلاعات کارتی در هیچ‌جا ذخیره نمی‌شود.",
        "اطلاعات شما با هیچ شخص ثالثی به اشتراک گذاشته نمی‌شود.",
      ],
      "/privacy",
    ),
  );
}

function termsPage(): Response {
  return html(
    infoPage(
      "شرایط استفاده",
      [
        "قیمت‌های نمایش‌داده‌شده در کاتالوگ فعلی نمونه‌اند و واقعی نیستند.",
        "ثبت سفارش به‌معنای رزرو نهایی نیست؛ سفارش پس از تأیید در دایرکت اینستاگرام نهایی می‌شود.",
        "موجودی محصولات محدود است و به ترتیب ثبت سفارش تخصیص داده می‌شود.",
      ],
      "/terms",
    ),
  );
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function publicProduct(p: Product): Record<string, unknown> {
  return {
    badge: p.badge,
    category: p.category,
    demo: p.demo,
    image: p.image,
    name: p.name,
    old_price_toman: p.old_price_toman,
    price_toman: p.price_toman,
    short: p.short,
    sku: p.sku,
    specs: p.specs,
    stock: p.stock,
  };
}

async function apiProducts(env: Env, url: URL): Promise<Response> {
  const q = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const sortParam = url.searchParams.get("sort") ?? "default";
  const sort =
    sortParam === "cheapest" || sortParam === "expensive" || sortParam === "name"
      ? sortParam
      : "default";
  const products = await getProducts(env.DB, { category, q, sort });
  return json({ products: products.map(publicProduct) });
}

async function apiProductBySku(env: Env, sku: string): Promise<Response> {
  const product = await getProductBySku(env.DB, sku);
  if (product === null) return json({ error: "product not found" }, 404);
  return json({ product: publicProduct(product) });
}

async function readJsonBody(request: Request, maxBytes = 65536): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new Error("BODY_TOO_LARGE");
  if (text.trim() === "") return null;
  return JSON.parse(text) as unknown;
}

async function apiCreateOrder(env: Env, request: Request): Promise<Response> {
  const ip = clientIp(request);
  if (rateLimited(ip, "orders", 10, 60_000)) {
    return json({ error: "too many requests — try again in a minute" }, 429);
  }
  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const { errors, valid } = validateOrderPayload(body);
  if (valid === null) return json({ errors }, 400);

  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey !== null && (idempotencyKey.length === 0 || idempotencyKey.length > 128)) {
    return json({ error: "Idempotency-Key must be 1–128 characters" }, 400);
  }
  if (idempotencyKey !== null) {
    const existing = await findOrderByIdempotencyKey(env.DB, idempotencyKey);
    if (existing !== null) {
      return json({ order: existing, replayed: true }, 200, {
        "X-Idempotent-Replay": "true",
      });
    }
  }

  try {
    const { order } = await createOrder(env.DB, valid, idempotencyKey);
    return json({ order, replayed: false }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (message.startsWith("OUT_OF_STOCK:")) {
      return json({ error: `insufficient stock for ${message.slice("OUT_OF_STOCK:".length)}` }, 409);
    }
    if (message.startsWith("PRODUCT_NOT_FOUND:")) {
      return json({ error: `unknown sku ${message.slice("PRODUCT_NOT_FOUND:".length)}` }, 400);
    }
    if (message.includes("UNIQUE constraint failed")) {
      // Race: same Idempotency-Key created concurrently — return the existing order.
      if (idempotencyKey !== null) {
        const existing = await findOrderByIdempotencyKey(env.DB, idempotencyKey);
        if (existing !== null) {
          return json({ order: existing, replayed: true }, 200, {
            "X-Idempotent-Replay": "true",
          });
        }
      }
      return json({ error: "duplicate order" }, 409);
    }
    console.error("createOrder failed", message);
    return json({ error: "failed to create order" }, 500);
  }
}

async function apiGetOrder(env: Env, orderId: string): Promise<Response> {
  if (!isValidOrderId(orderId)) return json({ error: "invalid order id" }, 400);
  const order = await getOrderById(env.DB, orderId);
  if (order === null) return json({ error: "order not found" }, 404);
  return json({ order });
}

function apiHealth(): Response {
  return json({ demo: true, ok: true, service: "parseh-store", time: new Date().toISOString() });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Static assets (CSS/JS) — served by the assets binding when present.
      if ((path.startsWith("/css/") || path.startsWith("/js/")) && env.ASSETS) {
        const asset = await env.ASSETS.fetch(request);
        if (asset.status !== 404) return withSecurity(asset);
      }

      if (request.method === "GET") {
        if (path === "/") return homePage(env);
        if (path === "/shop") return shopPage(env, url);
        if (path === "/product") return productPage(env, url);
        if (path === "/cart") return cartPage();
        if (path === "/checkout") return checkoutPage();
        if (path === "/confirmation") return confirmationPage(url);
        if (path === "/about") return aboutPage();
        if (path === "/contact") return contactPage();
        if (path === "/faq") return faqPage();
        if (path === "/shipping") return shippingPage();
        if (path === "/returns") return returnsPage();
        if (path === "/privacy") return privacyPage();
        if (path === "/terms") return termsPage();
        if (path === "/api/health") return apiHealth();
        if (path === "/api/products") return apiProducts(env, url);
        if (path.startsWith("/api/products/")) {
          const sku = decodeURIComponent(path.slice("/api/products/".length));
          return apiProductBySku(env, sku);
        }
        if (path.startsWith("/api/orders/")) {
          const id = decodeURIComponent(path.slice("/api/orders/".length));
          return apiGetOrder(env, id);
        }
        if (path === "/api/payments/callback") return paymentDemo();
        return html(layout("یافت نشد", "<h1>صفحه یافت نشد</h1><p><a href=\"/\">بازگشت به خانه</a></p>"), 404);
      }

      if (request.method === "POST") {
        if (path === "/api/orders") return apiCreateOrder(env, request);
        if (path === "/api/payments/request") {
          if (rateLimited(clientIp(request), "payments", 20, 60_000)) {
            return json({ error: "too many requests" }, 429);
          }
          return paymentDemo();
        }
        if (path === "/api/payments/verify") {
          if (rateLimited(clientIp(request), "payments", 20, 60_000)) {
            return json({ error: "too many requests" }, 429);
          }
          return paymentDemo();
        }
        return json({ error: "not found" }, 404);
      }

      return json({ error: "method not allowed" }, 405);
    } catch (error) {
      console.error("unhandled error", error instanceof Error ? error.message : error);
      if (path.startsWith("/api/")) return json({ error: "internal error" }, 500);
      return html(layout("خطا", "<h1>خطای سرور</h1><p>لطفاً دوباره تلاش کنید.</p>"), 500);
    }
  },
};

// Re-exported for tests that import the built worker shape indirectly.
export { formatToman, cartTotal, shippingFor, subtotal };
export { demoBanner };
