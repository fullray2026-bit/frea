(function () {
  "use strict";

  const config = window.freaSupabaseConfig;
  const sdk = window.supabase;
  if (!config || !sdk) {
    console.error("Supabase client failed to load.");
    return;
  }

  const client = sdk.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const byId = (id) => document.getElementById(id);
  const registerView = byId("registerView");
  const loginView = byId("loginView");
  const memberView = byId("memberView");
  const registerForm = byId("registerForm");
  const loginForm = byId("loginForm");
  const profileForm = byId("profileForm");
  const deliveryForm = byId("deliveryForm");
  const query = new URLSearchParams(window.location.search);
  const returnTo = query.get("return") === "personal-shopping.html" ? "personal-shopping.html" : "";
  const emailRedirectUrl = returnTo
    ? new URL("register.html?view=login&return=personal-shopping.html", window.location.href).href
    : "https://fullray2026-bit.github.io/frea/register.html";
  let currentUser = null;
  let currentAddressId = null;

  function message(id, text, type) {
    const element = byId(id);
    if (!element) return;
    element.textContent = text;
    element.className = "auth-message is-" + type;
  }

  function clearMessages() {
    document.querySelectorAll(".auth-message").forEach((element) => {
      element.textContent = "";
      element.className = "auth-message";
    });
  }

  function redirectAfterAuth() {
    if (!returnTo) return false;
    window.location.replace(returnTo);
    return true;
  }

  function show(view, scroll) {
    clearMessages();
    registerView.hidden = view !== "register";
    loginView.hidden = view !== "login";
    memberView.hidden = view !== "member";
    if (scroll !== false) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setField(form, name, value) {
    const field = form.elements.namedItem(name);
    if (field) field.value = value || "";
  }

  function activateTab(name) {
    document.querySelectorAll("[data-member-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.memberTab === name);
    });
    document.querySelectorAll("[data-member-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.memberPanel !== name;
    });
    clearMessages();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  function readableError(error) {
    const text = String(error && error.message || "").toLowerCase();
    if (text.includes("invalid login credentials")) return "Email 或密碼不正確。";
    if (text.includes("email not confirmed")) return "請先到信箱完成 Email 驗證，再回來登入。";
    if (text.includes("user already registered")) return "此 Email 已經註冊，請直接登入。";
    if (text.includes("password")) return "密碼格式不符合要求，請使用至少 8 碼。";
    if (text.includes("rate limit")) return "操作次數過多，請稍後再試。";
    return "目前無法完成操作，請稍後再試。";
  }

  async function renderOrders() {
    const target = byId("orderList");
    const { data, error } = await client
      .from("orders")
      .select("order_number,status,total_amount,currency,created_at,tracking_number")
      .order("created_at", { ascending: false });
    if (error) {
      target.innerHTML = '<div class="member-empty"><strong>暫時無法讀取訂單</strong><p>請稍後重新整理頁面。</p></div>';
      return;
    }
    if (!data.length) {
      target.innerHTML = '<div class="member-empty"><strong>目前尚無訂單</strong><p>完成購物後，訂單編號、日期、金額與處理狀態會顯示在這裡。</p></div>';
      return;
    }
    const statuses = { pending_payment: "待付款", payment_review: "對帳中", paid: "已收款", processing: "備貨中", shipped: "已出貨", completed: "已完成", cancelled: "已取消" };
    target.innerHTML = data.map((order) => {
      const date = new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(new Date(order.created_at));
      const total = new Intl.NumberFormat("zh-TW", { style: "currency", currency: order.currency || "TWD", maximumFractionDigits: 0 }).format(order.total_amount);
      const tracking = order.status === "shipped" && order.tracking_number
        ? '<small>出貨單號：' + escapeHtml(order.tracking_number) + '</small>'
        : "";
      return '<article class="member-order"><div><strong>' + escapeHtml(order.order_number) + '</strong><small>' + escapeHtml(date) + ' · ' + escapeHtml(statuses[order.status] || order.status) + '</small>' + tracking + '</div><div>' + escapeHtml(total) + '</div></article>';
    }).join("");
  }

  async function loadMember(user) {
    currentUser = user;
    const [profileResult, addressResult, ezwayResult] = await Promise.all([
      client.from("profiles").select("full_name,phone,newsletter").eq("id", user.id).single(),
      client.from("member_addresses").select("id,recipient_name,recipient_phone,postal_code,address").eq("user_id", user.id).eq("is_default", true).maybeSingle(),
      client.from("ezway_profiles").select("real_name,mobile").eq("user_id", user.id).maybeSingle()
    ]);
    if (profileResult.error) throw profileResult.error;
    const profile = profileResult.data;
    const address = addressResult.data || {};
    const ezway = ezwayResult.data || {};
    currentAddressId = address.id || null;
    byId("memberGreeting").textContent = (profile.full_name || "會員") + "，歡迎回到 fréa。";
    byId("profileEmail").value = user.email || "";
    setField(profileForm, "name", profile.full_name);
    setField(profileForm, "phone", profile.phone);
    profileForm.elements.newsletter.checked = Boolean(profile.newsletter);
    setField(deliveryForm, "recipientName", address.recipient_name);
    setField(deliveryForm, "recipientPhone", address.recipient_phone);
    setField(deliveryForm, "postalCode", address.postal_code);
    setField(deliveryForm, "address", address.address);
    setField(deliveryForm, "ezwayName", ezway.real_name);
    setField(deliveryForm, "ezwayPhone", ezway.mobile);
    await renderOrders();
    activateTab("profile");
    show("member", false);
  }

  byId("showLogin").addEventListener("click", (event) => { event.preventDefault(); show("login"); });
  byId("showRegister").addEventListener("click", (event) => { event.preventDefault(); show("register"); });
  document.querySelectorAll("[data-member-tab]").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.memberTab)));

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = registerForm.querySelector('[type="submit"]');
    const data = new FormData(registerForm);
    const email = String(data.get("email") || "").trim().toLowerCase();
    const password = String(data.get("password") || "");
    if (password.length < 8) return message("registerMessage", "密碼至少需要 8 碼。", "error");
    if (password !== String(data.get("confirm_password") || "")) return message("registerMessage", "兩次輸入的密碼不一致。", "error");
    submit.disabled = true;
    submit.textContent = "建立中…";
    const { data: authData, error } = await client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: emailRedirectUrl,
        data: {
          full_name: String(data.get("name") || "").trim(),
          phone: String(data.get("phone") || "").trim(),
          newsletter: data.get("newsletter") === "on",
          terms_accepted: true,
          privacy_accepted: true
        }
      }
    });
    submit.disabled = false;
    submit.textContent = "建立帳戶";
    if (error) return message("registerMessage", readableError(error), "error");
    registerForm.reset();
    if (authData.session) {
      if (redirectAfterAuth()) return;
      await loadMember(authData.user);
    } else {
      message("registerMessage", "帳戶已建立。請到信箱點擊驗證連結，完成後即可登入。", "success");
    }
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = loginForm.querySelector('[type="submit"]');
    const data = new FormData(loginForm);
    submit.disabled = true;
    submit.textContent = "登入中…";
    const { data: authData, error } = await client.auth.signInWithPassword({
      email: String(data.get("email") || "").trim().toLowerCase(),
      password: String(data.get("password") || "")
    });
    submit.disabled = false;
    submit.textContent = "登入";
    if (error) return message("loginMessage", readableError(error), "error");
    loginForm.reset();
    if (redirectAfterAuth()) return;
    try { await loadMember(authData.user); } catch (loadError) { message("loginMessage", readableError(loadError), "error"); }
  });

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(profileForm);
    const values = {
      full_name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      newsletter: data.get("newsletter") === "on"
    };
    const { error } = await client.from("profiles").update(values).eq("id", currentUser.id);
    if (error) return message("profileMessage", readableError(error), "error");
    byId("memberGreeting").textContent = values.full_name + "，歡迎回到 fréa。";
    message("profileMessage", "基本資料已儲存。", "success");
  });

  deliveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(deliveryForm);
    const address = {
      user_id: currentUser.id,
      recipient_name: String(data.get("recipientName") || "").trim(),
      recipient_phone: String(data.get("recipientPhone") || "").trim(),
      postal_code: String(data.get("postalCode") || "").trim(),
      address: String(data.get("address") || "").trim(),
      is_default: true
    };
    const addressQuery = currentAddressId
      ? client.from("member_addresses").update(address).eq("id", currentAddressId).eq("user_id", currentUser.id).select("id").single()
      : client.from("member_addresses").insert(address).select("id").single();
    const ezwayQuery = client.from("ezway_profiles").upsert({
      user_id: currentUser.id,
      real_name: String(data.get("ezwayName") || "").trim(),
      mobile: String(data.get("ezwayPhone") || "").trim()
    }, { onConflict: "user_id" });
    const [addressResult, ezwayResult] = await Promise.all([addressQuery, ezwayQuery]);
    if (addressResult.error || ezwayResult.error) return message("deliveryMessage", readableError(addressResult.error || ezwayResult.error), "error");
    currentAddressId = addressResult.data.id;
    message("deliveryMessage", "收件與 EZ WAY 資訊已儲存。", "success");
  });

  byId("logoutButton").addEventListener("click", async () => {
    await client.auth.signOut();
    currentUser = null;
    currentAddressId = null;
    loginForm.reset();
    show("login");
    message("loginMessage", "您已登出。", "success");
  });

  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") show("login", false);
    if (event === "SIGNED_IN" && session && (!currentUser || currentUser.id !== session.user.id)) {
      if (redirectAfterAuth()) return;
      setTimeout(() => loadMember(session.user).catch(async () => { await client.auth.signOut(); show("login", false); }), 0);
    }
  });

  client.auth.getSession().then(({ data }) => {
    if (data.session) {
      if (redirectAfterAuth()) return;
      loadMember(data.session.user).catch(async () => { await client.auth.signOut(); show("login", false); });
    } else if (returnTo || query.get("view") === "login") {
      show("login", false);
      if (returnTo) message("loginReturnMessage", "請先登入會員，再填寫自選代購需求。", "success");
    } else show("register", false);
  });
})();