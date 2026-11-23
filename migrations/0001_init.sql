-- Parseh store — initial schema + seed.
-- Values copied EXACTLY from ~/workspace/parseh/shop/products.json
-- (8 DEMO products, 5 categories). All products demo = 1.
-- Prices/stock/specs are Nov 2026 market-range SAMPLES, not real — nothing invented.
-- Keep this migration small: D1 daily rows_written is a real constraint.

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL REFERENCES categories(id),
  price_toman INTEGER NOT NULL CHECK (price_toman >= 0),
  old_price_toman INTEGER CHECK (old_price_toman IS NULL OR old_price_toman >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  demo INTEGER NOT NULL DEFAULT 1 CHECK (demo IN (0, 1)),
  specs_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  address TEXT NOT NULL,
  shipping_method TEXT NOT NULL CHECK (shipping_method IN ('delivery', 'pickup')),
  shipping_fee_toman INTEGER NOT NULL DEFAULT 0 CHECK (shipping_fee_toman >= 0),
  subtotal_toman INTEGER NOT NULL CHECK (subtotal_toman >= 0),
  total_toman INTEGER NOT NULL CHECK (total_toman >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'awaiting_payment', 'paid', 'cancelled')),
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  price_toman INTEGER NOT NULL CHECK (price_toman >= 0),
  qty INTEGER NOT NULL CHECK (qty >= 1)
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES orders(id),
  amount_toman INTEGER NOT NULL CHECK (amount_toman >= 0),
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'verified', 'failed', 'demo')),
  authority TEXT,
  ref_id TEXT,
  demo INTEGER NOT NULL DEFAULT 1 CHECK (demo IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);

-- Seed: categories
INSERT OR IGNORE INTO categories (id, name, description) VALUES ('laptop', 'لپ‌تاپ', 'لپ‌تاپ گیمینگ و کاری');
INSERT OR IGNORE INTO categories (id, name, description) VALUES ('gpu', 'کارت گرافیک', 'کارت گرافیک دسکتاپ');
INSERT OR IGNORE INTO categories (id, name, description) VALUES ('monitor', 'مانیتور', 'مانیتور گیمینگ و کاری');
INSERT OR IGNORE INTO categories (id, name, description) VALUES ('storage', 'حافظه و ذخیره‌سازی', 'SSD و رم');
INSERT OR IGNORE INTO categories (id, name, description) VALUES ('accessories', 'لوازم جانبی', 'کیبورد، موس و لوازم');

-- Seed: products (demo = 1, values copied exactly from products.json)
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-LTP-01', 'لپ‌تاپ گیمینگ ایسوس TUF Gaming F16', 'پردازندهٔ Core i7 نسل ۱۳، رم ۱۶ گیگابایت، SSD ۵۱۲ گیگابایت، نمایشگر ۱۶ اینچ 165Hz', 'laptop', 189000000, NULL, 4, 'assets/img/products/laptop-1.svg', 'نمونه', 1, '{"حافظه":"SSD ۵۱۲ گیگابایت NVMe","رم":"۱۶ گیگابایت DDR5","نمایشگر":"۱۶ اینچ، 165Hz","پردازنده":"Intel Core i7 نسل ۱۳","کارت گرافیک":"RTX 4050"}');
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-LTP-02', 'لپ‌تاپ ایسوس ROG Strix G16', 'پردازندهٔ Core i9، رم ۳۲ گیگابایت، SSD ۱ ترابایت، نمایشگر ۱۶ اینچ 240Hz', 'laptop', 549000000, NULL, 2, 'assets/img/products/laptop-2.svg', 'نمونه', 1, '{"حافظه":"SSD ۱ ترابایت NVMe","رم":"۳۲ گیگابایت DDR5","نمایشگر":"۱۶ اینچ، 240Hz","پردازنده":"Intel Core i9 نسل ۱۴","کارت گرافیک":"RTX 5060"}');
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-GPU-01', 'کارت گرافیک RTX 3060 12GB', '۱۲ گیگابایت حافظهٔ GDDR6، مناسب بازی 1080p و 1440p', 'gpu', 112000000, NULL, 6, 'assets/img/products/gpu-1.svg', 'نمونه', 1, '{"توان مصرفی":"۱۷۰ وات","حافظه":"۱۲ گیگابایت GDDR6","خروجی":"HDMI 2.1، DisplayPort 1.4a","رابط":"PCIe 4.0"}');
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-GPU-02', 'کارت گرافیک RX 9070 GRE', '۱۶ گیگابایت حافظهٔ GDDR6، مناسب بازی 1440p و 4K', 'gpu', 235000000, NULL, 3, 'assets/img/products/gpu-2.svg', 'نمونه', 1, '{"توان مصرفی":"۲۲۰ وات","حافظه":"۱۶ گیگابایت GDDR6","خروجی":"HDMI 2.1، DisplayPort 2.1","رابط":"PCIe 5.0"}');
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-MON-01', 'مانیتور گیمینگ ۲۷ اینچ 165Hz', 'پنل IPS، رزولوشن QHD، زمان پاسخ ۱ میلی‌ثانیه', 'monitor', 18500000, NULL, 8, 'assets/img/products/monitor-1.svg', 'نمونه', 1, '{"اندازه":"۲۷ اینچ","رزولوشن":"2560×1440","زمان پاسخ":"۱ میلی‌ثانیه","نرخ نوسازی":"165Hz","پنل":"IPS"}');
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-STR-01', 'SSD NVMe ۱ ترابایت', 'رابط M.2 NVMe Gen4، سرعت خواندن تا ۷٬۰۰۰ مگابایت بر ثانیه', 'storage', 4800000, NULL, 15, 'assets/img/products/ssd-1.svg', 'نمونه', 1, '{"رابط":"M.2 NVMe Gen4","سرعت خواندن":"تا ۷٬۰۰۰ مگابایت بر ثانیه","سرعت نوشتن":"تا ۵٬۰۰۰ مگابایت بر ثانیه","ظرفیت":"۱ ترابایت"}');
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-STR-02', 'رم ۱۶ گیگابایت DDR5', 'یک ماژول ۱۶ گیگابایت، فرکانس 5600MHz', 'storage', 3900000, NULL, 12, 'assets/img/products/ram-1.svg', 'نمونه', 1, '{"تعداد ماژول":"۱ عدد","ظرفیت":"۱۶ گیگابایت","فرکانس":"5600MHz","نوع":"DDR5"}');
INSERT OR IGNORE INTO products (sku, name, short, category, price_toman, old_price_toman, stock, image, badge, demo, specs_json) VALUES ('PRS-ACC-01', 'کیبورد مکانیکی و موس گیمینگ', 'کیبورد مکانیکی با نور RGB و موس ۱۲۰۰۰ DPI', 'accessories', 2700000, NULL, 10, 'assets/img/products/kb-1.svg', 'نمونه', 1, '{"اتصال":"سیمی USB","سازگار":"ویندوز و مک","موس":"۱۲۰۰۰ DPI، ۷ دکمه","کیبورد":"مکانیکی، نور RGB"}');
