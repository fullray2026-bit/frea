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
    const code = currency === "TWD" ? "TWD" : "JPY";
    return (code === "TWD" ? "NT$" : "¥") + Number(value || 0).toLocaleString(code === "TWD" ? "zh-TW" : "ja-JP");
  }

  function productRow(product) {
    const variants = (product.product_variants || []).sort((a, b) => a.sort_order - b.sort_order);
    const stock = Math.max(0, Number(product.stock_quantity) || 0);
    const disabled = stock === 0;
    return '<article class="brand-product-row" data-cart-product data-product-id="' + escapeHtml(product.slug) +
      '" data-name="' + escapeHtml(product.name) + '" data-spec="' + escapeHtml(product.specification) +
      '" data-price="' + escapeHtml(product.price) + '" data-currency="' + escapeHtml(product.currency) +
      '" data-image="' + escapeHtml(product.image_url) + '" data-product-stock="' + stock + '" data-stock="' + stock + '">' +
      '<div class="brand-product-thumb"><img src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.name) + '"></div>' +
      '<div class="brand-product-name"><h3>' + escapeHtml(product.name) + '</h3><p>' + escapeHtml(product.description || "") + '</p></div>' +
      '<div class="brand-product-spec">' + escapeHtml(product.specification) + (variants.length ? '<label class="product-variant-label">顏色<select data-product-variant required><option value="">請選擇</option>' + variants.map(item => '<option value="' + escapeHtml(item.id) + '" data-label="' + escapeHtml(item.option_value) + '" data-image="' + escapeHtml(item.image_url || product.image_url) + '" data-available="' + item.available + '">' + escapeHtml(item.option_value) + (item.available ? '' : '（售罄）') + '</option>').join("") + '</select></label>' : '') + '</div>' +
      '<p class="brand-product-use">' + escapeHtml(product.usage_flavor) + '</p>' +
      '<div class="brand-product-price"><strong>' + escapeHtml(formatPrice(product.price, product.currency)) + '</strong><span data-stock-label>' +
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
      const variantSelect = row.querySelector("[data-product-variant]");
      const addButton = row.querySelector("[data-add-cart]");
      const currentMax = () => Math.max(1, Number(row.dataset.stock) || 1);
      const quantity = () => Math.min(currentMax(), Math.max(1, Math.round(Number(input.value) || 1)));
      if (variantSelect) {
        addButton.disabled = true;
        addButton.textContent = "請先選擇顏色";
        variantSelect.addEventListener("change", () => {
          const option = variantSelect.selectedOptions[0];
          const productStock = Math.max(0, Number(row.dataset.productStock) || 0);
          const hasSelection = Boolean(variantSelect.value);
          const selectedStock = !hasSelection ? productStock : (option?.dataset.available === "true" ? productStock : 0);
          row.dataset.stock = selectedStock;
          input.max = Math.max(1, selectedStock);
          input.value = 1;
          const stockLabel = row.querySelector("[data-stock-label]");
          if (stockLabel) stockLabel.textContent = selectedStock > 0 ? "庫存 " + selectedStock : "暫時售罄";
          const image = row.querySelector(".brand-product-thumb img");
          if (image && option?.dataset.image) image.src = option.dataset.image;
          addButton.disabled = !hasSelection || selectedStock === 0;
          addButton.textContent = selectedStock === 0 && hasSelection ? "此色售罄" : (hasSelection ? "加入購物車" : "請先選擇顏色");
        });
      }
      row.querySelector('[data-qty-action="decrease"]')?.addEventListener("click", () => { input.value = Math.max(1, quantity() - 1); });
      row.querySelector('[data-qty-action="increase"]')?.addEventListener("click", () => { input.value = Math.min(currentMax(), quantity() + 1); });
      row.querySelector("[data-add-cart]")?.addEventListener("click", () => {
        const cart = readCart();
        const amount = quantity();
        if (variantSelect && !variantSelect.value) return notify("請先選擇顏色。");
        const productCurrency = row.dataset.currency || "JPY";
        const cartCurrency = cart.find(entry => entry.currency)?.currency;
        if (cartCurrency && cartCurrency !== productCurrency) {
          return notify("購物車內已有其他幣別商品，請分開結帳。");
        }
        const option = variantSelect?.selectedOptions[0];
        const variantId = variantSelect?.value || "";
        const id = variantId ? row.dataset.productId + "::" + variantId : row.dataset.productId;
        const item = cart.find(entry => entry.id === id);
        if (item) item.quantity = Math.min(currentMax(), Number(item.quantity || 0) + amount);
        else cart.push({ id, productId: row.dataset.productId, variantId, name: row.dataset.name,
          spec: row.dataset.spec + (option?.dataset.label ? "｜顏色：" + option.dataset.label : ""),
          price: Number(row.dataset.price), currency: productCurrency, quantity: amount,
          image: option?.dataset.image || row.dataset.image });
        localStorage.setItem(cartKey, JSON.stringify(cart));
        notify("已加入 " + amount + " 件商品");
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
    const [{ data, error }, { data: variantData, error: variantError }] = await Promise.all([
      client.from("products").select("slug,brand_code,name,description,specification,usage_flavor,price,currency,stock_quantity,image_url,sort_order,is_active").eq("is_active", true).order("brand_code").order("sort_order").order("created_at"),
      client.rpc("get_public_product_variants")
    ]);
    if (error || variantError || !data) return;
    data.forEach(product => { product.product_variants = (variantData || []).filter(item => item.product_slug === product.slug); });

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
