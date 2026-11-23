// Parseh store — premium client behaviour (Builder B).
// SECURITY: this file never injects markup strings.
// All data — including the user's own localStorage cart — is rendered with
// textContent and DOM APIs only, so a tampered cart cannot inject markup.
// Public contract (frozen): localStorage key `parseh-cart-v1` and
// window.ParsehCart { readCart, addToCart, renderCartPage, initCheckout,
// initConfirmation, toast }.
(function () {
  "use strict";

  var CART_KEY = "parseh-cart-v1";
  var SHIPPING_FLAT = 150000;
  var SHIPPING_FREE_ABOVE = 10000000;
  var IG_URL = "https://ig.me/m/parseh";

  var CATEGORY_NAMES = {
    accessories: "لوازم جانبی",
    gpu: "کارت گرافیک",
    laptop: "لپ‌تاپ",
    monitor: "مانیتور",
    storage: "حافظه و ذخیره‌سازی"
  };

  // -- small DOM helpers (no markup-string injection anywhere) ----------------

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function fa(n) {
    return Number(n).toLocaleString("fa-IR");
  }

  function formatToman(n) {
    return fa(n) + " تومان";
  }

  function productImageUrl(p) {
    var file = String(p.image || "").split("/").pop() || "";
    return file === "" ? "/img/products/laptop-1.svg" : "/img/products/" + file;
  }

  function categoryName(id) {
    return CATEGORY_NAMES[id] || id;
  }

  // -- cart storage ----------------------------------------------------------

  function readCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (line) {
        return line && typeof line.sku === "string" &&
          Number.isInteger(line.qty) && line.qty >= 1 && line.qty <= 99;
      });
    } catch (e) {
      return [];
    }
  }

  function writeCart(items) {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch (e) {
      // Storage full/blocked: cart just won't persist; UI still works.
    }
    updateCartBadge();
  }

  function cartCount() {
    var total = 0;
    readCart().forEach(function (line) { total += line.qty; });
    return total;
  }

  function updateCartBadge() {
    var badge = document.getElementById("cart-count");
    if (!badge) return;
    var count = cartCount();
    badge.textContent = fa(count);
    badge.hidden = count === 0;
  }

  function toast(message) {
    var node = el("div", "toast", message);
    node.setAttribute("role", "status");
    document.body.appendChild(node);
    setTimeout(function () { node.remove(); }, 3000);
  }

  // -- add to cart -----------------------------------------------------------

  function addToCart(sku, qty) {
    if (typeof sku !== "string" || sku === "") return;
    var wanted = Number.isInteger(qty) && qty >= 1 ? Math.min(99, qty) : 1;
    var items = readCart();
    var found = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].sku === sku) found = items[i];
    }
    if (found) {
      found.qty = Math.min(99, found.qty + wanted);
    } else {
      items.push({ qty: wanted, sku: sku });
    }
    writeCart(items);
    toast("به سبد اضافه شد");
  }

  function cartTotals(items, productsBySku, method) {
    var sub = 0;
    items.forEach(function (line) {
      var p = productsBySku[line.sku];
      if (p) sub += p.price_toman * line.qty;
    });
    var shipping = 0;
    if (method !== "pickup" && sub > 0 && sub < SHIPPING_FREE_ABOVE) shipping = SHIPPING_FLAT;
    return { shipping: shipping, subtotal: sub, total: sub + shipping };
  }

  function fetchProducts() {
    return fetch("/api/products").then(function (r) {
      if (!r.ok) throw new Error("products fetch failed");
      return r.json();
    });
  }

  function productsBySku(products) {
    var map = {};
    products.forEach(function (p) { map[p.sku] = p; });
    return map;
  }

  // -- shared product card (client-rendered, e.g. home «تازه‌ها») -----------

  function buildProductCard(p) {
    var card = el("article", "card");
    var imgLink = el("a", "card-img");
    imgLink.href = "/product?sku=" + encodeURIComponent(p.sku);
    imgLink.setAttribute("aria-label", p.name);
    var img = document.createElement("img");
    img.src = productImageUrl(p);
    img.alt = p.name;
    img.width = 800;
    img.height = 500;
    img.loading = "lazy";
    imgLink.appendChild(img);
    if (p.demo) {
      var badge = el("span", "badge-demo", p.badge === "" ? "نمونه" : p.badge);
      imgLink.appendChild(badge);
    }
    card.appendChild(imgLink);

    var body = el("div", "card-body");
    body.appendChild(el("p", "card-cat", categoryName(p.category)));
    var h3 = el("h3");
    var nameLink = el("a", null, p.name);
    nameLink.href = "/product?sku=" + encodeURIComponent(p.sku);
    h3.appendChild(nameLink);
    body.appendChild(h3);
    body.appendChild(el("p", "card-short", p.short || ""));
    var foot = el("div", "card-foot");
    foot.appendChild(el("p", "price", formatToman(p.price_toman)));
    foot.appendChild(el("span", p.stock > 0 ? "stock" : "stock out",
      p.stock > 0 ? "موجودی: " + fa(p.stock) + " عدد" : "ناموجود"));
    body.appendChild(foot);
    var btn = el("button", "btn btn-sm btn-block", "افزودن به سبد");
    btn.type = "button";
    btn.setAttribute("data-add-to-cart", p.sku);
    if (p.stock <= 0) btn.disabled = true;
    body.appendChild(btn);
    card.appendChild(body);
    return card;
  }

  // -- home: «تازه‌ها» (last 4 products by SKU order, reversed) --------------
  // Honest labelling: driven only by SKU order — no sales data exists.

  function initHomeFresh() {
    if (window.location.pathname !== "/") return;
    var sections = document.querySelectorAll("main > section");
    var anchor = null;
    for (var i = 0; i < sections.length; i++) {
      var h2 = sections[i].querySelector("h2");
      if (h2 && h2.textContent.indexOf("محصولات منتخب") >= 0) anchor = sections[i];
    }
    if (!anchor) return;
    fetchProducts().then(function (data) {
      var products = (data.products || []).slice().sort(function (a, b) {
        return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
      });
      var fresh = products.slice(-4).reverse();
      if (fresh.length === 0) return;
      var section = el("section");
      var head = el("div", "section-head");
      head.appendChild(el("h2", null, "تازه‌ها"));
      var note = el("a", null, "مشاهدهٔ همهٔ محصولات");
      note.href = "/shop";
      head.appendChild(note);
      section.appendChild(head);
      section.appendChild(el("p", "muted small",
        "جدیدترین کدهای کاتالوگ نمونه — بر اساس ترتیب کد کالا (SKU)."));
      var grid = el("div", "grid");
      fresh.forEach(function (p) { grid.appendChild(buildProductCard(p)); });
      section.appendChild(grid);
      anchor.after(section);
    }).catch(function () {
      // Fresh section is progressive enhancement; home works without it.
    });
  }

  // -- product page: main image (server body in index.ts renders no <img>;
  // image is injected client-side from the API so the detail shows one) -----

  function initProductImage() {
    if (window.location.pathname !== "/product") return;
    var article = document.querySelector(".product-detail");
    if (!article) return;
    var sku = new URLSearchParams(window.location.search).get("sku") || "";
    if (sku === "") return;
    fetch("/api/products/" + encodeURIComponent(sku))
      .then(function (r) {
        if (!r.ok) throw new Error("product not found");
        return r.json();
      })
      .then(function (data) {
        var p = data.product;
        if (!p) return;
        var figure = el("figure", "detail-img");
        figure.style.margin = "0 0 21px";
        var img = document.createElement("img");
        img.src = productImageUrl(p);
        img.alt = p.name;
        img.width = 800;
        img.height = 500;
        figure.appendChild(img);
        if (p.demo) figure.appendChild(el("span", "badge-demo", p.badge === "" ? "نمونه" : p.badge));
        article.before(figure);
      })
      .catch(function () {
        // Image is enhancement; the detail works without it.
      });
  }

  // -- product page: quantity stepper ----------------------------------------

  function initQtyStepper() {
    var input = document.getElementById("qty");
    if (!input || input.type !== "number") return;
    var max = parseInt(input.getAttribute("max") || "99", 10) || 99;
    var minus = el("button", "qty-btn", "−");
    minus.type = "button";
    minus.setAttribute("aria-label", "کم‌کردن تعداد");
    var plus = el("button", "qty-btn", "+");
    plus.type = "button";
    plus.setAttribute("aria-label", "زیادکردن تعداد");
    function clamp() {
      var v = parseInt(input.value, 10);
      if (!Number.isInteger(v) || v < 1) v = 1;
      if (v > max) v = max;
      input.value = String(v);
    }
    minus.addEventListener("click", function () {
      input.value = String(Math.max(1, (parseInt(input.value, 10) || 1) - 1));
    });
    plus.addEventListener("click", function () {
      input.value = String(Math.min(max, (parseInt(input.value, 10) || 1) + 1));
    });
    input.addEventListener("change", clamp);
    var row = el("div", "qty-row");
    var label = input.closest("label");
    if (label && label.parentNode) {
      row.appendChild(minus);
      row.appendChild(input);
      row.appendChild(plus);
      label.parentNode.insertBefore(row, label);
      label.remove();
      var caption = el("span", "muted small", "تعداد (حداکثر " + fa(max) + " عدد)");
      row.appendChild(caption);
    }
  }

  // -- cart page ---------------------------------------------------------------

  function renderCartPage() {
    var root = document.getElementById("cart-root");
    if (!root) return;
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(el("p", "loading", "در حال بارگذاری سبد…"));
    var items = readCart();
    if (items.length === 0) {
      while (root.firstChild) root.removeChild(root.firstChild);
      var empty = el("div", "empty");
      empty.appendChild(el("p", null, "سبد خرید خالی است."));
      var link = el("a", "btn", "مشاهدهٔ فروشگاه");
      link.href = "/shop";
      empty.appendChild(link);
      root.appendChild(empty);
      return;
    }
    fetchProducts().then(function (data) {
      var bySku = productsBySku(data.products || []);
      // Drop lines whose product no longer exists (stale localStorage).
      var known = items.filter(function (line) { return bySku[line.sku]; });
      if (known.length !== items.length) writeCart(known);
      if (known.length === 0) { renderCartPage(); return; }
      while (root.firstChild) root.removeChild(root.firstChild);

      var table = el("table", "cart-table");
      var thead = document.createElement("thead");
      var headRow = document.createElement("tr");
      ["محصول", "تعداد", "مبلغ", "حذف"].forEach(function (h) {
        headRow.appendChild(el("th", null, h));
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      var tbody = document.createElement("tbody");
      known.forEach(function (line) {
        var p = bySku[line.sku];
        var tr = document.createElement("tr");
        var tdName = document.createElement("td");
        tdName.setAttribute("data-label", "محصول");
        var itemBox = el("div", "cart-item");
        var img = document.createElement("img");
        img.src = productImageUrl(p);
        img.alt = p.name;
        img.width = 64;
        img.height = 40;
        itemBox.appendChild(img);
        var nameLink = el("a", null, p.name);
        nameLink.href = "/product?sku=" + encodeURIComponent(p.sku);
        itemBox.appendChild(nameLink);
        tdName.appendChild(itemBox);
        tr.appendChild(tdName);

        var tdQty = document.createElement("td");
        tdQty.setAttribute("data-label", "تعداد");
        var qtyRow = el("div", "qty-row");
        var minus = el("button", "qty-btn", "−");
        minus.type = "button";
        minus.setAttribute("aria-label", "کم‌کردن تعداد " + p.name);
        var qtyVal = el("span", "qty-val", fa(line.qty));
        var plus = el("button", "qty-btn", "+");
        plus.type = "button";
        plus.setAttribute("aria-label", "زیادکردن تعداد " + p.name);
        minus.addEventListener("click", function () {
          var cart = readCart();
          var target = null;
          cart.forEach(function (l) { if (l.sku === line.sku) target = l; });
          if (!target) return;
          target.qty -= 1;
          if (target.qty <= 0) cart = cart.filter(function (l) { return l.sku !== line.sku; });
          writeCart(cart);
          renderCartPage();
        });
        plus.addEventListener("click", function () {
          var cart = readCart();
          var target = null;
          cart.forEach(function (l) { if (l.sku === line.sku) target = l; });
          if (!target) return;
          target.qty = Math.min(p.stock, 99, target.qty + 1);
          writeCart(cart);
          renderCartPage();
        });
        qtyRow.appendChild(minus);
        qtyRow.appendChild(qtyVal);
        qtyRow.appendChild(plus);
        tdQty.appendChild(qtyRow);
        tr.appendChild(tdQty);

        var tdTotal = document.createElement("td");
        tdTotal.setAttribute("data-label", "مبلغ");
        tdTotal.textContent = formatToman(p.price_toman * line.qty);
        tr.appendChild(tdTotal);

        var tdRemove = document.createElement("td");
        tdRemove.setAttribute("data-label", "حذف");
        var removeBtn = el("button", "link-danger", "حذف");
        removeBtn.type = "button";
        removeBtn.addEventListener("click", function () {
          writeCart(readCart().filter(function (l) { return l.sku !== line.sku; }));
          toast("از سبد حذف شد");
          renderCartPage();
        });
        tdRemove.appendChild(removeBtn);
        tr.appendChild(tdRemove);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      root.appendChild(table);

      var t = cartTotals(known, bySku, "delivery");
      var totals = el("div", "totals");
      function totalRow(label, valueText, isTotal, isFree) {
        var row = el("div", isTotal ? "row total" : "row");
        row.appendChild(el("span", null, label));
        row.appendChild(el("span", isFree ? "free" : null, valueText));
        totals.appendChild(row);
      }
      totalRow("جمع اقلام", formatToman(t.subtotal), false, false);
      totalRow("ارسال", t.shipping === 0 ? "رایگان" : formatToman(t.shipping), false, t.shipping === 0);
      totalRow("مبلغ نهایی", formatToman(t.total), true, false);
      totals.appendChild(el("p", "muted small",
        "ارسال ۱۵۰٬۰۰۰ تومان؛ سفارش‌های بالای ۱۰٬۰۰۰٬۰۰۰ تومان رایگان؛ تحویل حضوری بیرجند رایگان."));
      root.appendChild(totals);

      var actions = el("div", "cart-actions");
      var clearBtn = el("button", "link-danger", "خالی‌کردن سبد");
      clearBtn.type = "button";
      clearBtn.addEventListener("click", function () {
        writeCart([]);
        toast("سبد خالی شد");
        renderCartPage();
      });
      var shopLink = el("a", "btn btn-ghost", "ادامهٔ خرید");
      shopLink.href = "/shop";
      var checkoutLink = el("a", "btn", "ثبت سفارش");
      checkoutLink.href = "/checkout";
      actions.appendChild(clearBtn);
      actions.appendChild(shopLink);
      actions.appendChild(checkoutLink);
      root.appendChild(actions);
    }).catch(function () {
      while (root.firstChild) root.removeChild(root.firstChild);
      root.appendChild(el("p", "error-box", "خطا در بارگذاری سبد. لطفاً صفحه را تازه کنید."));
    });
  }

  // -- checkout ----------------------------------------------------------------

  function normalizeMobile(value) {
    var persian = "۰۱۲۳۴۵۶۷۸۹";
    var arabic = "٠١٢٣٤٥٦٧٨٩";
    var out = "";
    for (var i = 0; i < value.length; i++) {
      var ch = value[i];
      var pi = persian.indexOf(ch);
      if (pi >= 0) { out += String(pi); continue; }
      var ai = arabic.indexOf(ch);
      if (ai >= 0) { out += String(ai); continue; }
      if (ch === " " || ch === "-" || ch === "ـ") continue;
      out += ch;
    }
    return out;
  }

  function fieldError(input, message) {
    var parent = input.parentNode;
    if (!parent) return;
    var existing = parent.querySelector(".field-error");
    if (existing) existing.remove();
    input.classList.remove("invalid");
    if (message) {
      input.classList.add("invalid");
      var p = el("p", "field-error", message);
      p.setAttribute("role", "alert");
      parent.insertBefore(p, input.nextSibling);
    }
  }

  function validateCheckoutForm(form) {
    var errors = {};
    function val(name) {
      var input = form.elements.namedItem(name);
      return input ? String(input.value || "").trim() : "";
    }
    var name = val("name");
    if (name.length < 1 || name.length > 100) errors.name = "نام باید بین ۱ تا ۱۰۰ نویسه باشد.";
    var phone = normalizeMobile(val("phone"));
    if (!/^09\d{9}$/.test(phone)) errors.phone = "شمارهٔ موبایل باید به شکل 09xxxxxxxxx باشد.";
    var city = val("city");
    if (city.length < 1 || city.length > 60) errors.city = "شهر باید بین ۱ تا ۶۰ نویسه باشد.";
    var address = val("address");
    if (address.length < 1 || address.length > 500) errors.address = "آدرس باید بین ۱ تا ۵۰۰ نویسه باشد.";
    var note = val("note");
    if (note.length > 500) errors.note = "توضیحات باید حداکثر ۵۰۰ نویسه باشد.";
    var method = val("shipping_method");
    if (method !== "delivery" && method !== "pickup") errors.shipping_method = "روش ارسال نامعتبر است.";
    return { errors: errors, phone: phone };
  }

  function initCheckout() {
    var form = document.getElementById("checkout-form");
    var summary = document.getElementById("checkout-summary");
    var errorEl = document.getElementById("checkout-error");
    if (!form) return;
    // Use our own per-field validation (Persian messages + field errors)
    // instead of the browser's native bubbles, which block the submit event.
    form.setAttribute("novalidate", "");
    var items = readCart();
    if (items.length === 0) {
      if (summary) {
        while (summary.firstChild) summary.removeChild(summary.firstChild);
        var empty = el("div", "empty");
        empty.appendChild(el("p", null, "سبد خرید خالی است؛ ابتدا محصولی اضافه کنید."));
        var link = el("a", "btn", "مشاهدهٔ فروشگاه");
        link.href = "/shop";
        empty.appendChild(link);
        summary.appendChild(empty);
      }
      form.style.display = "none";
      return;
    }

    function renderSummary(bySku) {
      if (!summary) return;
      var methodInput = form.elements.namedItem("shipping_method");
      var method = methodInput ? String(methodInput.value) : "delivery";
      var known = items.filter(function (line) { return bySku[line.sku]; });
      var t = cartTotals(known, bySku, method === "pickup" ? "pickup" : "delivery");
      while (summary.firstChild) summary.removeChild(summary.firstChild);
      var box = el("div", "order-summary");
      box.appendChild(el("h2", null, "خلاصهٔ سفارش"));
      var table = document.createElement("table");
      var tbody = document.createElement("tbody");
      known.forEach(function (line) {
        var p = bySku[line.sku];
        var tr = document.createElement("tr");
        var tdName = document.createElement("td");
        tdName.textContent = p.name + " × " + fa(line.qty);
        var tdPrice = document.createElement("td");
        tdPrice.textContent = formatToman(p.price_toman * line.qty);
        tr.appendChild(tdName);
        tr.appendChild(tdPrice);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      box.appendChild(table);
      function sumRow(label, valueText, isFree) {
        var row = el("div", "row");
        row.appendChild(el("span", null, label));
        row.appendChild(el("span", isFree ? "free" : null, valueText));
        box.appendChild(row);
      }
      sumRow("جمع اقلام", formatToman(t.subtotal), false);
      sumRow("ارسال", t.shipping === 0 ? "رایگان" : formatToman(t.shipping), t.shipping === 0);
      var totalRow = el("div", "row total");
      totalRow.appendChild(el("span", null, "مبلغ نهایی"));
      totalRow.appendChild(el("span", null, formatToman(t.total)));
      box.appendChild(totalRow);
      summary.appendChild(box);
    }

    var cachedBySku = null;
    fetchProducts().then(function (data) {
      cachedBySku = productsBySku(data.products || []);
      renderSummary(cachedBySku);
    }).catch(function () {
      if (summary) summary.appendChild(el("p", "error-box", "خطا در بارگذاری خلاصهٔ سفارش."));
    });
    var methodInput = form.elements.namedItem("shipping_method");
    if (methodInput) {
      methodInput.addEventListener("change", function () {
        if (cachedBySku) renderSummary(cachedBySku);
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var check = validateCheckoutForm(form);
      var hasError = false;
      ["name", "phone", "city", "address", "note", "shipping_method"].forEach(function (field) {
        var input = form.elements.namedItem(field);
        if (!input) return;
        fieldError(input, check.errors[field] || "");
        if (check.errors[field]) hasError = true;
      });
      if (errorEl) { errorEl.textContent = ""; errorEl.hidden = true; }
      if (hasError) {
        if (errorEl) {
          errorEl.textContent = "لطفاً خطاهای فرم را اصلاح کنید.";
          errorEl.hidden = false;
        }
        return;
      }
      var submitBtn = form.querySelector("button[type=submit]");
      if (submitBtn) submitBtn.disabled = true;
      var fd = new FormData(form);
      var payload = {
        address: String(fd.get("address") || "").trim(),
        city: String(fd.get("city") || "").trim(),
        items: readCart(),
        name: String(fd.get("name") || "").trim(),
        note: String(fd.get("note") || "").trim(),
        phone: check.phone,
        shipping_method: String(fd.get("shipping_method") || "delivery")
      };
      fetch("/api/orders", {
        body: JSON.stringify(payload),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": "web-" + Date.now() + "-" + Math.floor(Math.random() * 1e6)
        },
        method: "POST"
      })
        .then(function (r) {
          return r.json().then(function (d) { return { data: d, status: r.status }; });
        })
        .then(function (res) {
          if (res.status === 201 || res.status === 200) {
            writeCart([]);
            window.location.href = "/confirmation?order=" + encodeURIComponent(res.data.order.id);
            return;
          }
          if (submitBtn) submitBtn.disabled = false;
          var messages = res.data.errors || [res.data.error || "خطا در ثبت سفارش."];
          // Map server messages to fields by keyword; the rest go to the banner.
          var mapped = false;
          var keywords = [
            ["نام", "name"], ["موبایل", "phone"], ["شهر", "city"],
            ["آدرس", "address"], ["توضیحات", "note"], ["ارسال", "shipping_method"]
          ];
          messages.forEach(function (msg) {
            var text = String(msg);
            var hit = null;
            keywords.forEach(function (pair) {
              if (text.indexOf(pair[0]) >= 0) hit = pair[1];
            });
            if (hit) {
              var input = form.elements.namedItem(hit);
              if (input) { fieldError(input, text); mapped = true; }
            }
          });
          if (errorEl) {
            errorEl.textContent = mapped
              ? "لطفاً خطاهای فرم را اصلاح کنید."
              : messages.join("؛ ");
            errorEl.hidden = false;
          }
        })
        .catch(function () {
          if (submitBtn) submitBtn.disabled = false;
          if (errorEl) {
            errorEl.textContent = "خطا در ارتباط با سرور. دوباره تلاش کنید.";
            errorEl.hidden = false;
          }
        });
    });
  }

  // -- confirmation ------------------------------------------------------------

  function initConfirmation() {
    var root = document.getElementById("confirmation-root");
    if (!root) return;
    var orderId = root.getAttribute("data-order") || "";
    if (!orderId) {
      while (root.firstChild) root.removeChild(root.firstChild);
      root.appendChild(el("p", "error-box", "شمارهٔ سفارش نامعتبر است."));
      return;
    }
    while (root.firstChild) root.removeChild(root.firstChild);
    root.appendChild(el("p", "loading", "در حال بارگذاری سفارش…"));
    fetch("/api/orders/" + encodeURIComponent(orderId))
      .then(function (r) {
        if (!r.ok) throw new Error("order not found");
        return r.json();
      })
      .then(function (data) {
        if (!data.order) throw new Error("order not found");
        var o = data.order;
        while (root.firstChild) root.removeChild(root.firstChild);
        var box = el("div", "confirm-details");
        var idLine = el("p");
        idLine.appendChild(el("span", null, "شمارهٔ سفارش: "));
        idLine.appendChild(el("strong", "order-id", o.id));
        box.appendChild(idLine);
        var statusText = o.status === "pending" ? "در انتظار تأیید در دایرکت اینستاگرام"
          : o.status === "awaiting_payment" ? "در انتظار پرداخت"
          : o.status === "paid" ? "پرداخت‌شده"
          : "لغوشده";
        box.appendChild(el("p", null, "وضعیت: " + statusText));
        var table = document.createElement("table");
        table.className = "cart-table";
        var tbody = document.createElement("tbody");
        o.items.forEach(function (it) {
          var tr = document.createElement("tr");
          var tdName = document.createElement("td");
          tdName.textContent = it.name + " × " + fa(it.qty);
          var tdPrice = document.createElement("td");
          tdPrice.textContent = formatToman(it.price_toman * it.qty);
          tr.appendChild(tdName);
          tr.appendChild(tdPrice);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        box.appendChild(table);
        function sumLine(label, value) {
          var p = el("p");
          p.appendChild(el("span", null, label + ": "));
          p.appendChild(el("strong", null, value));
          box.appendChild(p);
        }
        sumLine("جمع اقلام", formatToman(o.subtotal_toman));
        sumLine("ارسال", o.shipping_fee_toman === 0 ? "رایگان" : formatToman(o.shipping_fee_toman));
        sumLine("مبلغ نهایی", formatToman(o.total_toman));
        box.appendChild(el("p", "muted small",
          "روش ارسال: " + (o.shipping_method === "pickup" ? "تحویل حضوری در بیرجند" : "ارسال با پست/پیک")));
        box.appendChild(el("p", null, "متن آمادهٔ دایرکت:"));
        var dmLines = [
          "سلام، سفارش " + o.id + " به مبلغ " + formatToman(o.total_toman) + " ثبت شد.",
          "نام: " + o.name + " — شهر: " + o.city,
          "روش ارسال: " + (o.shipping_method === "pickup" ? "تحویل حضوری در بیرجند" : "ارسال")
        ];
        var dm = dmLines.join("\n");
        var pre = el("pre", "dm-text", dm);
        pre.id = "dm-text";
        box.appendChild(pre);
        var actions = el("div", "actions-row");
        var copyBtn = el("button", "btn", "کپی متن دایرکت");
        copyBtn.type = "button";
        copyBtn.id = "copy-dm";
        copyBtn.addEventListener("click", function () {
          function done() { toast("کپی شد"); }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(dm).then(done, function () { fallbackCopy(dm, done); });
          } else {
            fallbackCopy(dm, done);
          }
        });
        var igLink = el("a", "btn btn-ghost", "ارسال در دایرکت اینستاگرام");
        igLink.href = IG_URL;
        igLink.rel = "noopener";
        actions.appendChild(copyBtn);
        actions.appendChild(igLink);
        box.appendChild(actions);
        root.appendChild(box);
      })
      .catch(function () {
        while (root.firstChild) root.removeChild(root.firstChild);
        root.appendChild(el("p", "error-box", "سفارش یافت نشد."));
      });
  }

  function fallbackCopy(text, done) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* clipboard unavailable */ }
    ta.remove();
    if (done) done();
  }

  // -- logo fallback (replaces the former inline onerror on the logo <img>;
  // CSP script-src 'self' forbids inline handlers) ---------------------------
  // If the hotlinked logo fails to load, hide the <img>; the «پارسه»
  // brand-name text next to it remains as the fallback.

  function initLogoFallback() {
    var img = document.getElementById("site-logo");
    if (!img) return;
    function hideOnError() { img.style.display = "none"; }
    img.addEventListener("error", hideOnError);
    // The error may already have fired before this script ran.
    if (img.complete && img.naturalWidth === 0) hideOnError();
  }

  // -- pathname-based auto-init (replaces the former inline <script> blocks
  // on /cart, /checkout and /confirmation; CSP forbids inline scripts) ------

  function initPageByPath() {
    var path = window.location.pathname;
    if (path === "/cart") renderCartPage();
    else if (path === "/checkout") initCheckout();
    else if (path === "/confirmation") initConfirmation();
  }

  // -- global wiring -----------------------------------------------------------

  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest ? ev.target.closest("[data-add-to-cart]") : null;
    if (!btn || btn.disabled) return;
    var qtyInput = document.getElementById("qty");
    var qty = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;
    addToCart(btn.getAttribute("data-add-to-cart"), qty);
  });

  document.addEventListener("DOMContentLoaded", function () {
    updateCartBadge();
    initLogoFallback();
    initQtyStepper();
    initProductImage();
    initHomeFresh();
    initPageByPath();
  });
  // If the script loads after DOMContentLoaded, run immediately.
  if (document.readyState !== "loading") {
    updateCartBadge();
    initLogoFallback();
    initQtyStepper();
    initProductImage();
    initHomeFresh();
    initPageByPath();
  }

  window.ParsehCart = {
    addToCart: addToCart,
    initCheckout: initCheckout,
    initConfirmation: initConfirmation,
    readCart: readCart,
    renderCartPage: renderCartPage,
    toast: toast
  };
})();
