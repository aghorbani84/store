// HTML rendering helpers — premium Persian RTL storefront (Builder B).
// All user/product data is escaped before interpolation. Never interpolate
// unescaped data into HTML here.
// NOTE: src/index.ts is FROZEN — page bodies live there; this module owns the
// document shell (header/search/cart badge/footer/trust strip), product cards,
// and info-page rendering. Home sections: «منتخب» = first 4 products by SKU
// order (server slice in index.ts); «تازه‌ها» is rendered client-side by
// public/js/app.js as the last 4 products by SKU order, reversed — no sales
// data is invented anywhere.
import { formatToman } from "./cart.js";
import type { Product } from "./db.js";

export const DEMO_BANNER_TEXT =
  "کاتالوگ نمونه: قیمت‌ها واقعی نیستند؛ لیست واقعی به‌زودی.";

export const LOGO_URL = "https://aghorbani84.github.io/parseh-shop/assets/img/logo.png";
export const IG_URL = "https://ig.me/m/parseh";
export const CONTACT_EMAIL = "mr0x369+parseh@proton.me";

/** Escape text for safe HTML interpolation. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Category id (from the D1 seed) → Persian display name. */
const CATEGORY_NAMES: Record<string, string> = {
  accessories: "لوازم جانبی",
  gpu: "کارت گرافیک",
  laptop: "لپ‌تاپ",
  monitor: "مانیتور",
  storage: "حافظه و ذخیره‌سازی",
};

export function categoryName(id: string): string {
  return CATEGORY_NAMES[id] ?? id;
}

/**
 * Map the DB image path (`assets/img/products/<name>.svg`) to the public
 * asset URL (`/img/products/<name>.svg`). SVGs live in public/img/products/.
 */
export function productImageUrl(p: Product): string {
  const file = p.image.split("/").pop() ?? "";
  if (file === "") return "/img/products/laptop-1.svg";
  return `/img/products/${file}`;
}

export function demoBanner(): string {
  return `<div class="demo-banner" role="note">${escapeHtml(DEMO_BANNER_TEXT)}</div>`;
}

function nav(active: string): string {
  const links: Array<[string, string]> = [
    ["/", "خانه"],
    ["/shop", "فروشگاه"],
    ["/about", "دربارهٔ ما"],
    ["/faq", "سوالات متداول"],
    ["/contact", "تماس"],
  ];
  const items = links
    .map(
      ([href, label]) =>
        `<a href="${href}"${href === active ? ' aria-current="page" class="active"' : ""}>${label}</a>`,
    )
    .join("\n      ");
  return `<header class="site-header">
  <div class="container header-inner">
    <a class="brand" href="/">
      <img id="site-logo" src="${LOGO_URL}" alt="لوگوی پارسه" width="44" height="44" loading="eager" />
      <span class="brand-name">پارسه<small>کامپیوتر و لوازم الکترونیک — بیرجند</small></span>
    </a>
    <form class="header-search" role="search" method="get" action="/shop">
      <label class="visually-hidden" for="header-q">جستجو در فروشگاه</label>
      <input id="header-q" type="search" name="q" placeholder="جستجو: نام، کد یا مشخصات…" autocomplete="off" />
      <button type="submit" aria-label="جستجو">جستجو</button>
    </form>
    <nav class="main-nav" aria-label="ناوبری اصلی">${items}</nav>
    <a class="cart-link" href="/cart" aria-label="سبد خرید">
      <span aria-hidden="true">سبد خرید</span>
      <span class="cart-count" id="cart-count" hidden>۰</span>
    </a>
  </div>
</header>`;
}

function trustStrip(): string {
  return `<section class="trust-strip" aria-label="اطمینان خرید">
  <div class="container trust-grid">
    <div class="trust-item"><strong>قیمت مکتوب</strong><span>قیمت پیش از خرید مشخص است</span></div>
    <div class="trust-item"><strong>پرداخت با دیجی‌پی (به‌زودی)</strong><span>درگاه پرداخت هنوز متصل نشده است</span></div>
    <div class="trust-item"><strong>تحویل حضوری بیرجند</strong><span>رایگان، بدون هزینهٔ ارسال</span></div>
    <div class="trust-item"><strong>۷ روز مهلت بازگشت</strong><span>طبق مادهٔ ۳۷ قانون تجارت الکترونیک</span></div>
  </div>
</section>`;
}

function footer(): string {
  return `<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <h3>پارسه</h3>
      <p>فروشگاه کامپیوتر و لوازم الکترونیک در بیرجند. قیمت مکتوب پیش از خرید، مشاورهٔ صادقانه پیش از سفارش.</p>
      <p class="muted small">کاتالوگ فعلی نمونه است؛ لیست واقعی محصولات به‌زودی جایگزین می‌شود.</p>
    </div>
    <div>
      <h3>دسترسی سریع</h3>
      <ul>
        <li><a href="/">خانه</a></li>
        <li><a href="/shop">فروشگاه</a></li>
        <li><a href="/cart">سبد خرید</a></li>
        <li><a href="/checkout">ثبت سفارش</a></li>
      </ul>
    </div>
    <div>
      <h3>راهنما</h3>
      <ul>
        <li><a href="/about">دربارهٔ پارسه</a></li>
        <li><a href="/faq">سوالات متداول</a></li>
        <li><a href="/shipping">ارسال</a></li>
        <li><a href="/returns">بازگشت کالا</a></li>
        <li><a href="/privacy">حریم خصوصی</a></li>
        <li><a href="/terms">شرایط استفاده</a></li>
      </ul>
    </div>
    <div>
      <h3>تماس</h3>
      <ul>
        <li><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></li>
        <li><a href="${IG_URL}" rel="noopener">اینستاگرام پارسه (@parseh)</a></li>
        <li>بیرجند — تحویل حضوری رایگان</li>
      </ul>
    </div>
  </div>
  <div class="container footer-bottom">
    <span>پارسه — بیرجند</span>
    <span>سفارش‌ها با دایرکت اینستاگرام نهایی می‌شوند؛ پرداخت آنلاین به‌زودی.</span>
  </div>
</footer>`;
}

/** Full HTML document shell. `lang="fa" dir="rtl"`, Vazirmatn via Google Fonts CDN. */
export function layout(title: string, body: string, active = "/"): string {
  const cta =
    active === "/"
      ? `<section class="cta-strip"><div class="container">
          <h2>آمادهٔ خرید هستید؟</h2>
          <p>کاتالوگ نمونه را ببینید و محصول را به سبد اضافه کنید؛ سفارش با دایرکت اینستاگرام نهایی می‌شود.</p>
          <p><a class="btn" href="/shop">مشاهدهٔ فروشگاه</a></p>
        </div></section>`
      : "";
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="description" content="پارسه — فروشگاه کامپیوتر و لوازم الکترونیک در بیرجند. قیمت مکتوب، تحویل حضوری رایگان." />
<title>${escapeHtml(title)} — پارسه</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/css/style.css" />
</head>
<body>
<a class="skip-link" href="#main">پرش به محتوای اصلی</a>
${demoBanner()}
${nav(active)}
<main id="main">${body}</main>
${cta}
${trustStrip()}
${footer()}
<script src="/js/app.js"></script>
</body>
</html>`;
}

export function productCard(p: Product): string {
  const badge = p.demo
    ? `<span class="badge-demo">${escapeHtml(p.badge === "" ? "نمونه" : p.badge)}</span>`
    : "";
  const stock =
    p.stock > 0
      ? `<span class="stock">موجودی: ${p.stock.toLocaleString("fa-IR")} عدد</span>`
      : `<span class="stock out">ناموجود</span>`;
  return `<article class="card">
    <a class="card-img" href="/product?sku=${escapeHtml(p.sku)}" aria-label="${escapeHtml(p.name)}">
      <img src="${productImageUrl(p)}" alt="${escapeHtml(p.name)}" width="800" height="500" loading="lazy" />
      ${badge}
    </a>
    <div class="card-body">
      <p class="card-cat">${escapeHtml(categoryName(p.category))}</p>
      <h3><a href="/product?sku=${escapeHtml(p.sku)}">${escapeHtml(p.name)}</a></h3>
      <p class="card-short">${escapeHtml(p.short)}</p>
      <div class="card-foot">
        <p class="price">${formatToman(p.price_toman)}</p>
        ${stock}
      </div>
      <button type="button" class="btn btn-sm btn-block" data-add-to-cart="${escapeHtml(p.sku)}" ${p.stock <= 0 ? "disabled" : ""}>افزودن به سبد</button>
    </div>
  </article>`;
}

export function productListHtml(products: Product[]): string {
  if (products.length === 0) {
    return `<div class="empty" role="status">
      <p>محصولی یافت نشد.</p>
      <p><a class="btn btn-ghost" href="/shop">مشاهدهٔ همهٔ محصولات</a></p>
    </div>`;
  }
  return `<div class="grid">\n${products.map(productCard).join("\n")}\n</div>`;
}

/** Linkify the contact e-mail inside an already-escaped paragraph. */
function linkifyEmail(escaped: string): string {
  const email = escapeHtml(CONTACT_EMAIL);
  return escaped.split(email).join(`<a href="mailto:${email}">${email}</a>`);
}

export function infoPage(title: string, paragraphs: string[], active: string): string {
  let inner: string;
  if (title === "سوالات متداول") {
    // Each paragraph is "سؤال؟ پاسخ." — split at the first ؟ into Q/A cards.
    inner = paragraphs
      .map((p) => {
        const idx = p.indexOf("؟");
        if (idx < 0) return `<div class="faq-item"><p>${linkifyEmail(escapeHtml(p))}</p></div>`;
        const q = p.slice(0, idx + 1);
        const a = p.slice(idx + 1).trim();
        return `<div class="faq-item"><h3>${escapeHtml(q)}</h3><p>${linkifyEmail(escapeHtml(a))}</p></div>`;
      })
      .join("\n");
  } else {
    inner = paragraphs
      .map((p) => `<p>${linkifyEmail(escapeHtml(p))}</p>`)
      .join("\n");
  }
  const body = `<article class="prose">
  <h1>${escapeHtml(title)}</h1>
  ${inner}
  <p class="info-cta"><a class="btn" href="/shop">مشاهدهٔ فروشگاه</a> <a class="btn btn-ghost" href="/contact">تماس با ما</a></p>
</article>`;
  return layout(title, body, active);
}
