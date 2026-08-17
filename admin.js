(function () {
  "use strict";

  const sdk = window.supabase;
  const config = window.freaSupabaseConfig;
  if (!sdk || !config) return;

  const client = sdk.createClient(config.url, config.publishableKey);
  const login = document.getElementById("adminLogin");
  const shell = document.getElementById("adminShell");
  const loginForm = document.getElementById("adminLoginForm");
  const titles = { overview: "管理總覽", members: "會員管理", orders: "訂單管理", personal: "代購訂單管理" };
  const statusLabels = {
    pending_payment: "待匯款",
    payment_review: "待核款",
    paid: "已收款",
    processing: "備貨中",
    shipped: "已出貨",
    completed: "已完成",
    cancelled: "已取消"
  };
  const personalStatusLabels = {
    new: "新需求", reviewing: "確認中", quoted: "已報價", confirmed: "顧客已確認",
    purchased: "日本已下單", shipped: "已寄出", completed: "已完成", cancelled: "已取消"
  };
  let profiles = [];
  let addresses = [];
  let ezwayProfiles = [];
  let orders = [];
  let personalRequests = [];

  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const safeHttpUrl = value => {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  };
  const formatDate = value => value ? new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
  }).format(new Date(value)) : "—";
  const formatMoney = (amount, currency) => {
    try {
      return new Intl.NumberFormat("zh-TW", {
        style: "currency", currency: currency || "TWD", maximumFractionDigits: 0
      }).format(Number(amount || 0));
    } catch (_) {
      return "¥" + Number(amount || 0).toLocaleString("zh-TW");
    }
  };
  const showMessage = (id, text, type) => {
    const el = byId(id);
    if (!el) return;
    el.textContent = text || "";
    el.className = "admin-message" + (type ? " " + type : "");
  };
  const isAdmin = user => user && user.app_metadata && user.app_metadata.role === "admin";

  async function verifyAdmin() {
    const { data, error } = await client.auth.getUser();
    if (error || !isAdmin(data.user)) {
      if (data && data.user) await client.auth.signOut();
      login.hidden = false;
      shell.hidden = true;
      return false;
    }
    login.hidden = true;
    shell.hidden = false;
    byId("adminIdentity").textContent = data.user.email || "管理員";
    return true;
  }

  async function loadData() {
    showMessage("adminGlobalMessage", "正在讀取最新資料…");
    const [profileResult, addressResult, ezwayResult, orderResult, personalResult] = await Promise.all([
      client.from("profiles").select("id,email,full_name,phone,newsletter,created_at").order("created_at", { ascending: false }),
      client.from("member_addresses").select("user_id,recipient_name,recipient_phone,postal_code,address,is_default").eq("is_default", true),
      client.from("ezway_profiles").select("user_id,real_name,mobile"),
      client.from("orders").select("id,user_id,order_number,status,currency,total_amount,created_at,updated_at,recipient_name,recipient_phone,postal_code,shipping_address,payment_proof_name,admin_note,tracking_number,order_items(product_name,specification,quantity,unit_price,line_total)").order("created_at", { ascending: false }),
      client.from("personal_shopping_requests").select("id,request_number,user_id,customer_name,email,phone,line_id,note,items,status,quote_amount,quote_details,admin_note,created_at,updated_at").order("created_at", { ascending: false })
    ]);
    const failed = [profileResult, addressResult, ezwayResult, orderResult, personalResult].find(result => result.error);
    if (failed) {
      showMessage("adminGlobalMessage", failed.error.message || "資料讀取失敗。", "error");
      return;
    }
    profiles = profileResult.data || [];
    addresses = addressResult.data || [];
    ezwayProfiles = ezwayResult.data || [];
    orders = orderResult.data || [];
    personalRequests = personalResult.data || [];
    renderAll();
    showMessage("adminGlobalMessage", "資料更新時間：" + new Date().toLocaleTimeString("zh-TW"), "success");
  }

  function renderAll() {
    const pending = orders.filter(order => !["completed", "cancelled"].includes(order.status)).length;
    byId("statMembers").textContent = profiles.length;
    byId("statOrders").textContent = orders.length;
    byId("statPending").textContent = pending;
    byId("statCompleted").textContent = orders.filter(order => order.status === "completed").length;
    renderRecentOrders();
    renderMembers();
    renderOrders();
    renderPersonalRequests();
  }

  function personalStatusOptions(selected) {
    return Object.entries(personalStatusLabels).map(([value, label]) =>
      '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" + label + "</option>"
    ).join("");
  }

  function renderPersonalRequests() {
    const term = byId("personalSearch").value.trim().toLowerCase();
    const status = byId("personalStatusFilter").value;
    const filtered = personalRequests.filter(request => {
      const searchable = [request.request_number, request.customer_name, request.email, request.phone].join(" ").toLowerCase();
      return (!term || searchable.includes(term)) && (!status || request.status === status);
    });
    byId("personalCount").textContent = "共 " + filtered.length + " 筆";
    const target = byId("personalCards");
    if (!filtered.length) {
      target.innerHTML = '<div class="admin-empty">目前沒有符合的代購需求。</div>';
      return;
    }
    target.innerHTML = filtered.map(request => {
      const items = Array.isArray(request.items) ? request.items : [];
      const quote = request.quote_details && typeof request.quote_details === "object" ? request.quote_details : {};
      const unitPrices = Array.isArray(quote.unit_prices) ? quote.unit_prices : [];
      const itemHtml = items.length ? '<ul class="admin-order-items">' + items.map(item => {
        const itemUrl = safeHttpUrl(item.url);
        return (
        "<li>" + escapeHtml(item.name || "未填商品名稱") + "｜顏色及規格：" + escapeHtml(item.specification || "—") + "｜數量 " + escapeHtml(item.quantity || 1) +
        (itemUrl ? '｜<a href="' + escapeHtml(itemUrl) + '" target="_blank" rel="noopener">商品連結</a>' : "") + "</li>"
        );
      }).join("") + "</ul>" : "<p>沒有商品明細</p>";
      return '<article class="admin-order" data-personal-id="' + escapeHtml(request.id) + '">' +
        '<div class="admin-order-head"><div><h3>' + escapeHtml(request.request_number) +
        '</h3><p class="admin-order-meta">' + escapeHtml(formatDate(request.created_at)) + " · " +
        escapeHtml(personalStatusLabels[request.status] || request.status) + '</p></div><div><strong>' +
        escapeHtml(request.customer_name) + '</strong><p class="admin-order-meta">' +
        escapeHtml(request.email) + "／" + escapeHtml(request.phone) + '</p></div><strong class="admin-order-total" data-quote-display>' +
        (request.quote_amount == null ? "尚未報價" : escapeHtml(formatMoney(request.quote_amount, "TWD"))) + '</strong></div>' +
        '<div class="admin-order-grid"><div><h4>代購品項</h4>' + itemHtml +
        '</div><div><h4>顧客資料與備註</h4><p>LINE ID：' + escapeHtml(request.line_id || "—") +
        '</p><p>' + escapeHtml(request.note || "無備註") + '</p></div></div>' +
        '<div class="personal-quote-sheet"><h4>報價試算表</h4><div class="personal-quote-table">' +
        '<div class="personal-quote-row personal-quote-head"><span>商品</span><span>數量</span><span>商品單價（JPY）</span><span>小計（JPY）</span></div>' +
        items.map((item, index) => '<div class="personal-quote-row"><span>' + escapeHtml(item.name || "未填商品名稱") +
          '</span><span>' + escapeHtml(item.quantity || 1) + '</span><input data-quote-unit data-quantity="' +
          escapeHtml(item.quantity || 1) + '" type="number" min="0" step="1" value="' +
          escapeHtml(unitPrices[index] ?? "") + '" placeholder="0"><strong data-quote-line>¥0</strong></div>').join("") +
        '</div><div class="personal-quote-costs">' +
        '<label>匯率（JPY → TWD）<input data-quote-rate type="number" min="0" step="0.0001" value="' + escapeHtml(quote.exchange_rate ?? "") + '" placeholder="例如 0.22"></label>' +
        '<label>日本國內運費（JPY）<input data-quote-domestic type="number" min="0" step="1" value="' + escapeHtml(quote.domestic_shipping_jpy ?? "") + '" placeholder="0"></label>' +
        '<label>關稅及手續費（TWD）<input data-quote-fees type="number" min="0" step="1" value="' + escapeHtml(quote.duties_and_fees_twd ?? "") + '" placeholder="0"></label>' +
        '<label>國際運費（TWD）<input data-quote-international type="number" min="0" step="1" value="' + escapeHtml(quote.international_shipping_twd ?? "") + '" placeholder="0"></label>' +
        '<label class="personal-quote-total">總金額（TWD）<output data-quote-total>NT$0</output></label></div>' +
        '<p class="admin-order-meta">計算方式：（商品小計＋日本國內運費）× 匯率＋關稅及手續費＋國際運費</p></div>' +
        '<div class="admin-order-controls"><label>處理狀態<select data-personal-status>' +
        personalStatusOptions(request.status) + '</select></label><label>後台備註<textarea data-personal-note rows="2" placeholder="僅供管理使用">' +
        escapeHtml(request.admin_note || "") + '</textarea></label><button class="admin-save" type="button" data-save-personal>儲存變更</button></div></article>';
    }).join("");
    target.querySelectorAll("[data-personal-id]").forEach(recalculatePersonalQuote);
  }

  function quoteNumber(card, selector) {
    return Math.max(0, Number(card.querySelector(selector)?.value) || 0);
  }

  function recalculatePersonalQuote(card) {
    let productSubtotal = 0;
    card.querySelectorAll("[data-quote-unit]").forEach(input => {
      const line = Math.round(Math.max(0, Number(input.value) || 0) * Math.max(1, Number(input.dataset.quantity) || 1));
      productSubtotal += line;
      input.closest(".personal-quote-row").querySelector("[data-quote-line]").textContent = "¥" + line.toLocaleString("zh-TW");
    });
    const rate = quoteNumber(card, "[data-quote-rate]");
    const domestic = quoteNumber(card, "[data-quote-domestic]");
    const fees = quoteNumber(card, "[data-quote-fees]");
    const international = quoteNumber(card, "[data-quote-international]");
    const total = Math.round((productSubtotal + domestic) * rate + fees + international);
    card.dataset.quoteTotal = String(total);
    card.querySelector("[data-quote-total]").textContent = new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(total);
    card.querySelector("[data-quote-display]").textContent = total > 0 ? formatMoney(total, "TWD") : "尚未報價";
  }

  async function savePersonalRequest(card) {
    const id = card.dataset.personalId;
    const button = card.querySelector("[data-save-personal]");
    recalculatePersonalQuote(card);
    const unitPrices = [...card.querySelectorAll("[data-quote-unit]")].map(input => Math.max(0, Math.round(Number(input.value) || 0)));
    const quoteDetails = {
      unit_prices: unitPrices,
      exchange_rate: quoteNumber(card, "[data-quote-rate]"),
      domestic_shipping_jpy: Math.round(quoteNumber(card, "[data-quote-domestic]")),
      duties_and_fees_twd: Math.round(quoteNumber(card, "[data-quote-fees]")),
      international_shipping_twd: Math.round(quoteNumber(card, "[data-quote-international]"))
    };
    const updates = {
      status: card.querySelector("[data-personal-status]").value,
      quote_amount: Number(card.dataset.quoteTotal) || null,
      quote_details: quoteDetails,
      admin_note: card.querySelector("[data-personal-note]").value.trim(),
      updated_at: new Date().toISOString()
    };
    button.disabled = true;
    button.textContent = "儲存中…";
    const { data, error } = await client.from("personal_shopping_requests").update(updates)
      .eq("id", id).select("id,status,quote_amount,quote_details,admin_note,updated_at").single();
    button.disabled = false;
    button.textContent = error ? "儲存失敗" : "已儲存";
    if (error) {
      showMessage("adminGlobalMessage", error.message || "代購需求更新失敗。", "error");
      return;
    }
    const request = personalRequests.find(item => String(item.id) === String(id));
    if (request) Object.assign(request, data);
    showMessage("adminGlobalMessage", "代購需求 " + (request?.request_number || id) + " 已更新。", "success");
    renderPersonalRequests();
  }

  function renderRecentOrders() {
    const target = byId("recentOrders");
    if (!orders.length) {
      target.innerHTML = '<div class="admin-empty">目前尚無訂單。</div>';
      return;
    }
    target.innerHTML = orders.slice(0, 5).map(order => {
      const member = profiles.find(profile => profile.id === order.user_id);
      return '<div class="admin-recent"><div><strong>' + escapeHtml(order.order_number) +
        '</strong><small>' + escapeHtml(member?.full_name || order.recipient_name || "未填姓名") +
        ' · ' + escapeHtml(statusLabels[order.status] || order.status) + '</small></div><strong>' +
        escapeHtml(formatMoney(order.total_amount, order.currency)) + '</strong></div>';
    }).join("");
  }

  function renderMembers() {
    const term = byId("memberSearch").value.trim().toLowerCase();
    const filtered = profiles.filter(profile =>
      [profile.full_name, profile.email, profile.phone].some(value => String(value || "").toLowerCase().includes(term))
    );
    byId("memberCount").textContent = "共 " + filtered.length + " 位";
    const target = byId("memberRows");
    if (!filtered.length) {
      target.innerHTML = '<tr><td colspan="5"><div class="admin-empty">目前沒有符合的會員資料。</div></td></tr>';
      return;
    }
    target.innerHTML = filtered.map(profile => {
      const address = addresses.find(item => item.user_id === profile.id) || {};
      const ezway = ezwayProfiles.find(item => item.user_id === profile.id) || {};
      return "<tr><td><strong>" + escapeHtml(profile.full_name || "未填姓名") +
        "</strong><small>" + escapeHtml(profile.email || "—") + "</small></td><td>" +
        escapeHtml(profile.phone || "—") + "</td><td><strong>" +
        escapeHtml(address.recipient_name || "—") + "</strong><small>" +
        escapeHtml([address.postal_code, address.address].filter(Boolean).join(" ") || "尚未填寫") +
        "</small><small>" + escapeHtml(address.recipient_phone || "") + "</small></td><td><strong>" +
        escapeHtml(ezway.real_name || "—") + "</strong><small>" +
        escapeHtml(ezway.mobile || "尚未填寫") + "</small></td><td>" +
        escapeHtml(formatDate(profile.created_at)) + "</td></tr>";
    }).join("");
  }

  function statusOptions(selected) {
    return Object.entries(statusLabels).map(([value, label]) =>
      '<option value="' + value + '"' + (value === selected ? " selected" : "") + ">" + label + "</option>"
    ).join("");
  }

  function renderOrders() {
    const term = byId("orderSearch").value.trim().toLowerCase();
    const status = byId("orderStatusFilter").value;
    const filtered = orders.filter(order => {
      const member = profiles.find(profile => profile.id === order.user_id);
      const searchable = [order.order_number, order.recipient_name, order.recipient_phone, member?.email].join(" ").toLowerCase();
      return (!term || searchable.includes(term)) && (!status || order.status === status);
    });
    byId("orderCount").textContent = "共 " + filtered.length + " 筆";
    const target = byId("orderCards");
    if (!filtered.length) {
      target.innerHTML = '<div class="admin-empty">目前沒有符合的訂單。</div>';
      return;
    }
    target.innerHTML = filtered.map(order => {
      const member = profiles.find(profile => profile.id === order.user_id);
      const items = Array.isArray(order.order_items) ? order.order_items : [];
      const itemHtml = items.length ? '<ul class="admin-order-items">' + items.map(item =>
        "<li>" + escapeHtml(item.product_name) + "｜" + escapeHtml(item.specification) +
        " × " + escapeHtml(item.quantity) + "｜" + escapeHtml(formatMoney(item.line_total, order.currency)) + "</li>"
      ).join("") + "</ul>" : "<p>沒有商品明細</p>";
      return '<article class="admin-order" data-order-id="' + escapeHtml(order.id) + '">' +
        '<div class="admin-order-head"><div><h3>' + escapeHtml(order.order_number) +
        '</h3><p class="admin-order-meta">' + escapeHtml(formatDate(order.created_at)) + " · " +
        escapeHtml(statusLabels[order.status] || order.status) + '</p></div><div><strong>' +
        escapeHtml(order.recipient_name || member?.full_name || "未填姓名") + '</strong><p class="admin-order-meta">' +
        escapeHtml(member?.email || "") + '</p></div><strong class="admin-order-total">' +
        escapeHtml(formatMoney(order.total_amount, order.currency)) + '</strong></div>' +
        '<div class="admin-order-grid"><div><h4>商品明細</h4>' + itemHtml +
        '</div><div><h4>收件與付款資料</h4><p>' + escapeHtml(order.recipient_name || "—") + "／" +
        escapeHtml(order.recipient_phone || "—") + '</p><p>' +
        escapeHtml([order.postal_code, order.shipping_address].filter(Boolean).join(" ") || "未填地址") +
        '</p><p>匯款證明：' + escapeHtml(order.payment_proof_name || "未上傳") + "</p></div></div>" +
        '<div class="admin-order-controls"><label>訂單狀態<select data-order-status>' +
        statusOptions(order.status) + '</select></label><label data-tracking-wrap' + (order.status === "shipped" ? "" : " hidden") +
        '>出貨單號<input data-tracking-number value="' + escapeHtml(order.tracking_number || "") +
        '" placeholder="請輸入物流出貨單號"></label><label>後台備註<textarea data-order-note rows="2" placeholder="僅供管理使用">' +
        escapeHtml(order.admin_note || "") + '</textarea></label><button class="admin-save" type="button" data-save-order>儲存變更</button></div></article>';
    }).join("");
  }

  async function saveOrder(card) {
    const id = card.dataset.orderId;
    const button = card.querySelector("[data-save-order]");
    const status = card.querySelector("[data-order-status]").value;
    const trackingNumber = card.querySelector("[data-tracking-number]").value.trim();
    const note = card.querySelector("[data-order-note]").value.trim();
    if (status === "shipped" && !trackingNumber) {
      showMessage("adminGlobalMessage", "訂單狀態為「已出貨」時，請輸入出貨單號。", "error");
      card.querySelector("[data-tracking-number]").focus();
      return;
    }
    button.disabled = true;
    button.textContent = "儲存中…";
    const { data, error } = await client.from("orders")
      .update({ status, tracking_number: trackingNumber, admin_note: note })
      .eq("id", id)
      .select("id,status,tracking_number,admin_note,updated_at")
      .single();
    button.disabled = false;
    button.textContent = error ? "儲存失敗" : "已儲存";
    if (error) {
      showMessage("adminGlobalMessage", error.message || "訂單更新失敗。", "error");
      return;
    }
    const order = orders.find(item => String(item.id) === String(id));
    if (order) Object.assign(order, data);
    showMessage("adminGlobalMessage", "訂單 " + (order?.order_number || id) + " 已更新。", "success");
    renderAll();
  }

  function switchView(view) {
    document.querySelectorAll("[data-admin-panel]").forEach(panel => {
      panel.hidden = panel.dataset.adminPanel !== view;
    });
    document.querySelectorAll("[data-admin-view]").forEach(button => {
      button.classList.toggle("is-active", button.dataset.adminView === view);
    });
    byId("adminPageTitle").textContent = titles[view] || "後台管理";
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = loginForm.querySelector("button");
    const data = new FormData(loginForm);
    button.disabled = true;
    showMessage("adminLoginMessage", "正在驗證管理員身分…");
    const result = await client.auth.signInWithPassword({
      email: String(data.get("email") || "").trim(),
      password: String(data.get("password") || "")
    });
    button.disabled = false;
    if (result.error) {
      showMessage("adminLoginMessage", "Email 或密碼不正確。", "error");
      return;
    }
    if (!isAdmin(result.data.user)) {
      await client.auth.signOut();
      showMessage("adminLoginMessage", "此帳戶沒有後台管理權限。", "error");
      return;
    }
    showMessage("adminLoginMessage", "");
    await verifyAdmin();
    await loadData();
  });

  document.querySelectorAll("[data-admin-view]").forEach(button => {
    button.addEventListener("click", () => switchView(button.dataset.adminView));
  });
  byId("adminRefresh").addEventListener("click", loadData);
  byId("memberSearch").addEventListener("input", renderMembers);
  byId("orderSearch").addEventListener("input", renderOrders);
  byId("orderStatusFilter").addEventListener("change", renderOrders);
  byId("personalSearch").addEventListener("input", renderPersonalRequests);
  byId("personalStatusFilter").addEventListener("change", renderPersonalRequests);
  byId("orderCards").addEventListener("click", event => {
    const button = event.target.closest("[data-save-order]");
    if (button) saveOrder(button.closest(".admin-order"));
  });
  byId("orderCards").addEventListener("change", event => {
    if (!event.target.matches("[data-order-status]")) return;
    const card = event.target.closest(".admin-order");
    const trackingWrap = card.querySelector("[data-tracking-wrap]");
    trackingWrap.hidden = event.target.value !== "shipped";
    card.querySelector("[data-tracking-number]").required = event.target.value === "shipped";
  });
  byId("personalCards").addEventListener("click", event => {
    const button = event.target.closest("[data-save-personal]");
    if (button) savePersonalRequest(button.closest(".admin-order"));
  });
  byId("personalCards").addEventListener("input", event => {
    if (!event.target.matches("[data-quote-unit],[data-quote-rate],[data-quote-domestic],[data-quote-fees],[data-quote-international]")) return;
    recalculatePersonalQuote(event.target.closest(".admin-order"));
  });
  byId("adminLogout").addEventListener("click", async () => {
    await client.auth.signOut();
    location.reload();
  });

  verifyAdmin().then(ok => {
    if (ok) loadData();
  });
})();

