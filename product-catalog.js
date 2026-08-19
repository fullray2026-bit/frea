(function () {
  "use strict";

  const sdk = window.supabase;
  const config = window.freaSupabaseConfig;
  if (!sdk || !config) return;

  const client = sdk.createClient(config.url, config.publishableKey);
  const cartKey = "frea_demo_cart_v1";
  const pageBrand = {
    "brand-kayanoya.html": "kayanoya",
    "brand-kinto.html": "kinto",
    "brand-kajidonya.html": "kajidonya",
    "brand-akomeya.html": "akomeya",
    "brand-fukuoka-coffee.html": "fukuoka-coffee",
    "category-lifestyle.html": "lifestyle-picks"
  };
  const brandHref = {
    "brand-kayanoya.html": "kayanoya",
    "brand-kinto.html": "kinto",
    "brand-kajidonya.html": "kajidonya",
    "brand-akomeya.html": "akomeya",
    "brand-fukuoka-coffee.html": "fukuoka-coffee",
    "category-lifestyle.html": "lifestyle-picks"
  };

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function formatPrice(value, currency) {
    try {
      return new Intl.NumberFormat("zh-TW", { style: "currency", currency: currency || "JPY", maximumFractionDigits: 0 }).format(Number(value || 0));
    } catch (_) {
      return (currency === "TWD" ? "NT$" : "¥") + Number(value || 0).toLocaleString("zh-TW");
    }
  }

  function productRow(product) {
    const stock = Math.max(0, Number(product.stock_quantity) || 0);
    const disabled = stock === 0;
    return '<article class="brand-product-row" data-cart-product data-product-id="' + escapeHtml(product.slug) +
      '" data-name="' + escapeHtml(product.name) + '" data-spec="' + escapeHtml(product.specification) +
      '" data-price="' + escapeHtml(product.price) + '" data-currency="' + escapeHtml(product.currency) +
      '" data-image="' + escapeHtml(product.image_url) + '" data-stock="' + stock + '">' +
      '<div class="brand-product-thumb"><img src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.name) + '"></div>' +
      '<div class="brand-product-name"><h3>' + escapeHtml(product.name) + '</h3><p>' + escapeHtml(product.description || "") + '</p></div>' +
      '<div class="brand-product-spec">' + escapeHtml(product.specification) + '</div>' +
      '<p class="brand-product-use">' + escapeHtml(product.usage_flavor) + '</p>' +
      '<div class="brand-product-price"><strong>' + escapeHtml(formatPrice(product.price, product.currency)) + '</strong><span>' +
      (disabled ? "暫時售罄" : "庫存 " + stock) + '</span></div>' +
      '<div class="brand-product-quantity"><div class="brand-quantity" aria-label="' + escapeHtml(product.name) + '商品數量">' +
      '<button type="button" data-qty-action="decrease" aria-label="減少數量"' + (disabled ? " disabled" : "") + '>−</button>' +
      '<input data-quantity type="number" min="1" max="' + Math.max(1, stock) + '" value="1" inputmode="numeric" aria-label="數量"' +
      (disabled ? " disabled" : "") + '><button type="button" data-qty-action="increase" aria-label="增加數量"' +
      (disabled ? " disabled" : "") + '>＋</button></div></div>' +
      '<div class="brand-product-action"><button class="brand-cart-btn" data-add-cart type="button"' +
      (disabled ? " disabled" : "") + '>' + (disabled ? "暫時售罄" : "加入購物車") + '</button></div></article>';
  }

  function readCart() {
    try { return JSON.parse(localStorage.getItem(cartKey) || "[]"); } catch (_) { return []; }
  }

  function notify(message) {
    const el = document.querySelector(".toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function bindCart(container) {
    container.querySelectorAll("[data-cart-product]").forEach(row => {
      const input = row.querySelector("[data-quantity]");
      const max = Math.max(1, Number(row.dataset.stock) || 1);
      const quantity = () => Math.min(max, Math.max(1, Math.round(Number(input.value) || 1)));
      row.querySelector('[data-qty-action="decrease"]')?.addEventListener("click", () => { input.value = Math.max(1, quantity() - 1); });
      row.querySelector('[data-qty-action="increase"]')?.addEventListener("click", () => { input.value = Math.min(max, quantity() + 1); });
      row.querySelector("[data-add-cart]")?.addEventListener("click", () => {
        const cart = readCart();
        const amount = quantity();
        const item = cart.find(entry => entry.id === row.dataset.productId);
        if (item) item.quantity = Math.min(max, Number(item.quantity || 0) + amount);
        else cart.push({ id: row.dataset.productId, name: row.dataset.name, spec: row.dataset.spec,
          price: Number(row.dataset.price), currency: row.dataset.currency || "JPY", quantity: amount, image: row.dataset.image });
        localStorage.setItem(cartKey, JSON.stringify(cart));
        notify("已加入 " + amount + " 件商品（瀏覽器測試版）");
      });
    });
  }

  function replaceList(list, items) {
    if (!list) return;
    const labels = list.querySelector(".brand-product-labels");
    list.innerHTML = (labels ? labels.outerHTML : "") + (items.length ? items.map(productRow).join("") :
      '<p style="padding:34px 0;color:#8a7a6d">目前尚無上架商品。</p>');
    bindCart(list);
  }

  async function loadCatalog() {
    const { data, error } = await client.from("products").select("slug,brand_code,name,description,specification,usage_flavor,price,currency,stock_quantity,image_url,sort_order,is_active")
      .eq("is_active", true).order("brand_code").order("sort_order").order("created_at");
    if (error || !data) return;

    const current = location.pathname.split("/").pop() || "index.html";
    if (pageBrand[current]) {
      let list = document.querySelector(".brand-product-list");
      if (!list && current === "category-lifestyle.html") {
        const empty = document.querySelector(".collection-empty");
        if (empty) {
          list = document.createElement("div");
          list.className = "brand-product-list";
          list.innerHTML = '<div class="brand-product-labels" aria-hidden="true"><span>商品照片</span><span>商品名稱</span><span>規格</span><span>用途／風味</span><span>價格</span><span>數量</span><span></span></div>';
          empty.replaceWith(list);
        }
      }
      replaceList(list, data.filter(product => product.brand_code === pageBrand[current]));
      return;
    }
    if (current === "products.html") {
      document.querySelectorAll(".all-products-group").forEach(group => {
        const href = group.querySelector(".all-products-brand a")?.getAttribute("href")?.split("#")[0];
        const brand = brandHref[href];
        if (brand) replaceList(group.querySelector(".brand-product-list"), data.filter(product => product.brand_code === brand));
      });
    }
  }

  loadCatalog();
})();
