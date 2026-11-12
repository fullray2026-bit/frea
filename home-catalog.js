(function () {
  "use strict";

  const sdk = window.supabase;
  const config = window.freaSupabaseConfig;
  if (!sdk || !config) return;

  const client = sdk.createClient(config.url, config.publishableKey);
  const lifestyleGallery = true;
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
    const detailPages={"3coins-2524-jbsbag01-1":"product-FR-000077.html","3coins-2524-jbsbag02-1":"product-FR-000076.html","akomeya-4562208090192":"product-FR-000001.html","akomeya-4571158953013":"product-FR-000014.html","akomeya-4571213190018":"product-FR-000022.html","akomeya-4580330652460":"product-FR-000008.html","akomeya-4580504111106":"product-FR-000004.html","akomeya-4580835071926":"product-FR-000029.html","akomeya-4901509906731":"product-FR-000024.html","akomeya-4949666117133":"product-FR-000007.html","akomeya-4962968025227":"product-FR-000034.html","akomeya-4980520302197":"product-FR-000015.html","akomeya-bird-eye-mszo9m2k":"product-FR-000036.html","akomeya-hanamidori-yuzu-kosho-30":"product-FR-000042.html","asahimatsu-shin-asahi-tofu-33g-b0fmxzj7b3":"product-FR-000049.html","catalog-10g-muummcl2":"product-FR-000080.html","catalog-1l-muumkosh":"product-FR-000082.html","catalog-205g-mv0ng9h4":"product-FR-000091.html","catalog-22cm-mw7px8gx":"product-FR-000094.html","catalog-230ml-muumlkyi":"product-FR-000083.html","catalog-250g-mv0nh0go":"product-FR-000092.html","catalog-30-40cm-mw7ovjum":"product-FR-000099.html","catalog-330ml-muumlbvz":"product-FR-000084.html","catalog-jo-malone-london-100ml-mus32bno":"product-FR-000062.html","catalog-jo-malone-london-100ml-mus32kod":"product-FR-000061.html","catalog-kihara-mv113hg2":"product-FR-000093.html","catalog-kinto-36-28cm-mw7qb4vy":"product-FR-000098.html","catalog-kinto-scs-300ml-mw7qo598":"product-FR-000095.html","catalog-leaf-botanics-20g-musjljb8":"product-FR-000070.html","catalog-leaf-botanics-20g-musjltyi":"product-FR-000071.html","catalog-leaf-botanics-20g-musjm195":"product-FR-000072.html","catalog-m-mark-100g-musk6279":"product-FR-000073.html","catalog-m-mark-65g-musjktep":"product-FR-000069.html","catalog-m-mark-65g-musjl9pu":"product-FR-000068.html","catalog-porlex-coffee-mill-ii-mini-muuml2av":"product-FR-000085.html","catalog-press-butter-sand-5-mus4zliz":"product-FR-000064.html","catalog-press-butter-sand-5-mus4zu26":"product-FR-000063.html","catalog-pro-300ml-muumm2dv":"product-FR-000078.html","catalog-pro-500ml-muumltlj":"product-FR-000079.html","catalog-product-muumfo74":"product-FR-000081.html","catalog-product-mwczgjnj":"product-FR-000100.html","catalog-russell-hobbs-basic-kettle-plus-0-8l-mw7mlk51":"product-FR-000097.html","fr-000055":"product-FR-000055.html","fr-000056":"product-FR-000056.html","fr-000057":"product-FR-000057.html","fr-000058":"product-FR-000058.html","fukuoka-coffee-product-mus02vcq":"product-FR-000060.html","fukuoka-county-chelbesa-200":"product-FR-000003.html","fukuoka-county-kibingo-middle-200":"product-FR-000013.html","fukuoka-rec-ffty4-100":"product-FR-000025.html","fukuoka-rec-hakata-blend-100":"product-FR-000039.html","fukuoka-rec-kiangai-100":"product-FR-000028.html","fukuoka-rec-kissa-blend-100":"product-FR-000041.html","fukuoka-rec-lucy-blend-100":"product-FR-000040.html","fukuoka-tokado-blend-1000":"product-FR-000027.html","fukuoka-tokado-haiti-mare-blanche-200":"product-FR-000009.html","fukuoka-tokado-hakata-umaka-150":"product-FR-000054.html","fukuoka-tokado-house-blend-200":"product-FR-000037.html","fukuoka-tokado-mandheling-200":"product-FR-000018.html","fukuoka-tokado-mild-blend-200":"product-FR-000038.html","hakusan-g-type-soy-sauce-pot-large":"product-FR-000089.html","hakusan-g-type-soy-sauce-pot-small":"product-FR-000090.html","kayanoya-black-salt-pepper-55":"product-FR-000021.html","kayanoya-chicken-dashi-16":"product-FR-000031.html","kayanoya-chinese-dashi-soup-10":"product-FR-000033.html","kayanoya-dashi-30":"product-FR-000002.html","kayanoya-japanese-dashi-soup-10":"product-FR-000016.html","kayanoya-shiitake-dashi-20p":"product-FR-000053.html","kayanoya-vegetable-dashi-24":"product-FR-000023.html","kayanoya-wafu-dashi-salt-60":"product-FR-000010.html","kayanoya-western-dashi-soup-10":"product-FR-000011.html","kinto-day-off-tumbler-500":"product-FR-000006.html","kinto-travel-tumbler-350":"product-FR-000059.html","kinto-travel-tumbler-500":"product-FR-000020.html","kinto-unitea-cup-m-450ml-8291":"product-FR-000087.html","kinto-unitea-cup-s-350ml-8290":"product-FR-000086.html","kinto-unitea-glass-teapot-s-500ml-8363":"product-FR-000088.html","kinto-water-bottle-300":"product-FR-000043.html","kinto-water-bottle-500":"product-FR-000044.html","kinto-water-bottle-950":"product-FR-000045.html","lifestyle-picks-clever-mttwv0fb":"product-FR-000047.html","lifestyle-picks-miwabi-mttwufzw":"product-FR-000046.html","mina-perhonen-ilo-aea7923":"product-FR-000074.html","mina-perhonen-thermo-mug-mg0034-59":"product-FR-000075.html","tokado-brazil-bahas-pn-1kg":"product-FR-000051.html","tokado-ethiopia-haile-selassie-1kg":"product-FR-000052.html","tokado-mild-blend-1kg":"product-FR-000050.html"};
    const detailLink=!document.getElementById('detailProduct') && (detailPages[product.slug] || 'product.html?slug='+encodeURIComponent(product.slug));
    const variants = (product.product_variants || []).sort((a, b) => a.sort_order - b.sort_order);
    const stock = Math.max(0, Number(product.stock_quantity) || 0);
    const disabled = stock === 0;
    return '<article ' + (lifestyleGallery ? 'data-gallery-images="' + escapeHtml(JSON.stringify(product.gallery_images || [])) + '" ' : '') + 'class="brand-product-row" data-cart-product data-product-id="' + escapeHtml(product.slug) +
      '" data-name="' + escapeHtml(product.name) + '" data-spec="' + escapeHtml(product.specification) +
      '" data-price="' + escapeHtml(product.price) + '" data-currency="' + escapeHtml(product.currency) +
      '" data-image="' + escapeHtml(product.image_url) + '" data-product-stock="' + stock + '" data-stock="' + stock + '">' +
      '<div class="brand-product-thumb"' + (detailLink ? ' data-detail-link="'+detailLink+'"' : '') + '><img src="' + escapeHtml(product.image_url) + '" alt="' + escapeHtml(product.name) + '"></div>' +
      '<div class="brand-product-name"><h3>' + (detailLink ? '<a href="'+detailLink+'">'+escapeHtml(product.name)+'</a>' : escapeHtml(product.name)) + '</h3><p>' + escapeHtml(product.description || "") + '</p></div>' +
      '<div class="brand-product-spec">' + escapeHtml(product.specification) + (variants.length ? '<label class="product-variant-label">規格/款式<select data-product-variant required><option value="">請選擇</option>' + variants.map(item => '<option value="' + escapeHtml(item.id) + '" data-label="' + escapeHtml(item.option_value) + '" data-image="' + escapeHtml(item.image_url || product.image_url) + '" data-available="' + item.available + '">' + escapeHtml(item.option_value) + (item.available ? '' : '（售罄）') + '</option>').join("") + '</select></label>' : '') + '</div>' +
      '<p class="brand-product-use">' + escapeHtml(product.usage_flavor) + '</p>' +
      '<div class="brand-product-price"><strong>' + escapeHtml(formatPrice(product.price, product.currency)) + '</strong><span data-stock-label>' +
      (disabled ? "暫時售罄" : lifestyleGallery ? "" : "庫存 " + stock) + '</span></div>' +
      '<div class="brand-product-quantity"><div class="brand-quantity" aria-label="' + escapeHtml(product.name) + '商品數量">' +
      '<button type="button" data-qty-action="decrease" aria-label="減少數量"' + (disabled ? " disabled" : "") + '>−</button>' +
      '<input data-quantity type="number" min="1" max="' + Math.max(1, stock) + '" value="1" inputmode="numeric" aria-label="數量"' +
      (disabled ? " disabled" : "") + '><button type="button" data-qty-action="increase" aria-label="增加數量"' +
      (disabled ? " disabled" : "") + '>＋</button></div></div>' +
      '<div class="brand-product-action"><button class="brand-cart-btn" data-add-cart type="button"' +
      (disabled ? " disabled" : "") + '>' + (disabled ? "暫時售罄" : "加入購物車") + '</button></div></article>';
  }

  function readCart() {
    try { return JSON.parse(window.FreaCartStorage.getItem(cartKey) || "[]"); } catch (_) { return []; }
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
        addButton.textContent = "請選擇規格/款式";
        variantSelect.addEventListener("change", () => {
          const option = variantSelect.selectedOptions[0];
          const productStock = Math.max(0, Number(row.dataset.productStock) || 0);
          const hasSelection = Boolean(variantSelect.value);
          const selectedStock = !hasSelection ? productStock : (option?.dataset.available === "true" ? productStock : 0);
          row.dataset.stock = selectedStock;
          input.max = Math.max(1, selectedStock);
          input.value = 1;
          const stockLabel = row.querySelector("[data-stock-label]");
          if (stockLabel) stockLabel.textContent = selectedStock > 0 ? (lifestyleGallery ? "" : "庫存 " + selectedStock) : "暫時售罄";
          const image = row.querySelector(".brand-product-thumb img");
          if (image && option?.dataset.image) image.src = option.dataset.image;
          addButton.disabled = !hasSelection || selectedStock === 0;
          addButton.textContent = selectedStock === 0 && hasSelection ? "此規格/款式售罄" : (hasSelection ? "加入購物車" : "請選擇規格/款式");
        });
      }
      row.querySelector('[data-qty-action="decrease"]')?.addEventListener("click", () => { input.value = Math.max(1, quantity() - 1); });
      row.querySelector('[data-qty-action="increase"]')?.addEventListener("click", () => { input.value = Math.min(currentMax(), quantity() + 1); });
      row.querySelector("[data-add-cart]")?.addEventListener("click", () => {
        const cart = readCart();
        const amount = quantity();
        if (variantSelect && !variantSelect.value) return notify("請選擇規格/款式。");
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
          spec: row.dataset.spec + (option?.dataset.label ? "｜規格/款式：" + option.dataset.label : ""),
          price: Number(row.dataset.price), currency: productCurrency, quantity: amount,
          image: option?.dataset.image || row.dataset.image });
        window.FreaCartStorage.setItem(cartKey, JSON.stringify(cart));
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
      client.from("products").select("slug,brand_code,name,description,specification,usage_flavor,price,currency,stock_quantity,image_url,sort_order,is_active" + (lifestyleGallery ? ",gallery_images" : "")).eq("is_active", true).order("brand_code").order("sort_order").order("created_at"),
      client.rpc("get_public_product_variants")
    ]);
    if (error || variantError || !data) {
      const status=document.getElementById("kitchenCatalogStatus");
      if(status)status.textContent="暫時無法取得最新價格與庫存，請重新整理後再購買。";
      return;
    }
    data.forEach(product => { product.product_variants = (variantData || []).filter(item => item.product_slug === product.slug); });

    const current = location.pathname.split("/").pop() || "index.html";
    if(current==="category-kitchen.html"){
      document.querySelectorAll("[data-kitchen-brand]").forEach(group=>{
        replaceList(group.querySelector(".brand-product-list"),data.filter(product=>product.brand_code===group.dataset.kitchenBrand));
      });
      const count=data.filter(p=>["akomeya","kayanoya"].includes(p.brand_code)).length;
      document.getElementById("kitchenCatalogStatus").textContent="共 "+count+" 項上架商品";
      return;
    }
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

  window.FreaHomeCatalog={render:replaceList};
})();

