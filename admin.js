(function () {
  "use strict";

  const sdk = window.supabase;
  const config = window.freaSupabaseConfig;
  if (!sdk || !config) return;

  const client = sdk.createClient(config.url, config.publishableKey);
  const login = document.getElementById("adminLogin");
  const shell = document.getElementById("adminShell");
  const loginForm = document.getElementById("adminLoginForm");
  const titles = { overview: "管理總覽", members: "會員管理", orders: "訂單管理", personal: "代購訂單管理", master: "商品主檔", costs: "商品成本試算", purchases: "進貨管理", products: "商品管理" };
  const brandLabels = { kayanoya: "茅乃舍", kinto: "KINTO", kajidonya: "家事問屋", akomeya: "AKOMEYA TOKYO", "fukuoka-coffee": "福岡咖啡精選", "lifestyle-picks": "生活雜貨精選" };
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
  let memberAccounts = [];
  let membershipApplications = [];
  let addresses = [];
  let ezwayProfiles = [];
  let orders = [];
  let personalRequests = [];
  let products = [];
  let masterProducts = [];
  let costScenarios = [];
  let suppliers = [];
  let purchaseOrders = [];

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
    const code = currency === "JPY" ? "JPY" : "TWD";
    return (code === "TWD" ? "NT$" : "¥") + Number(amount || 0).toLocaleString(code === "TWD" ? "zh-TW" : "ja-JP");
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

  let bankRateLoading = false;
  let bankRateText = "台銀日幣現金賣出：讀取中…";
  let bankRateTitle = "台銀最新牌告，僅供參考。點擊查看來源。";
  let reverseBankRateText = "台灣銀行即時匯率：讀取中…";
  let reverseBankRateTitle = "依日幣現金賣出牌告倒數換算，僅供參考。";
  function renderBankRate() {
    document.querySelectorAll("#botJpyRate, [data-bot-jpy-rate]").forEach(label => {
      label.textContent = bankRateText;
      label.title = bankRateTitle;
    });
    document.querySelectorAll("[data-bot-twd-jpy-rate]").forEach(label => {
      label.textContent = reverseBankRateText;
      label.title = reverseBankRateTitle;
    });
  }
  async function refreshBankRate() {
    if (bankRateLoading) return;
    bankRateLoading = true;
    bankRateText = "台銀日幣現金賣出：讀取中…";
    reverseBankRateText = "台灣銀行即時匯率：讀取中…";
    renderBankRate();
    let timer;
    try {
      const {data, error} = await Promise.race([
        client.functions.invoke("bot-jpy-cash-rate"),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 15000); })
      ]);
      if (error || !data || !Number.isFinite(data.rate) || data.rate <= 0) throw error || new Error("Invalid rate");
      bankRateText = "台銀日幣現金賣出 " + data.rate.toFixed(4) + "（" + data.quoted_at + " 台灣時間）";
      reverseBankRateText = "台灣銀行：1 TWD ≈ " + (1 / data.rate).toFixed(4) + " JPY（現金賣出換算；" + data.quoted_at + " 台灣時間）";
      reverseBankRateTitle = "台灣銀行日幣現金賣出 " + data.rate.toFixed(4) + " TWD／JPY；以 1 ÷ 牌告匯率換算。最新牌告僅供參考，報價匯率請自行設定。";
      bankRateTitle = "1 JPY = " + data.rate + " TWD；台銀最新牌告，僅供參考。點擊查看來源。";
    } catch (_) {
      bankRateText = "台銀匯率暫時無法取得｜查看來源";
      reverseBankRateText = "台灣銀行匯率暫時無法取得｜查看來源";
      reverseBankRateTitle = "請點擊查看台灣銀行最新牌告。";
    } finally { clearTimeout(timer); bankRateLoading = false; renderBankRate(); }
  }

  async function loadData() {
    refreshBankRate();
    showMessage("adminGlobalMessage", "正在讀取最新資料…");
    let loadingTimeout;
    try {
    const [profileResult, accountResult, applicationResult, addressResult, ezwayResult, orderResult, personalResult, productResult, masterResult, costResult, supplierResult, purchaseResult] = await Promise.race([Promise.all([
      client.from("profiles").select("id,email,full_name,phone,referrer,newsletter,created_at").order("created_at", { ascending: false }),
      client.from("member_accounts").select("*").order("created_at", { ascending: false }),
      client.from("membership_applications").select("*").order("created_at", { ascending: false }),
      client.from("member_addresses").select("user_id,recipient_name,recipient_phone,postal_code,address,is_default").eq("is_default", true),
      client.from("ezway_profiles").select("user_id,real_name,mobile"),
      client.from("orders").select("id,user_id,order_number,status,currency,total_amount,created_at,updated_at,recipient_name,recipient_phone,postal_code,shipping_address,payment_proof_name,payment_proof_path,admin_note,tracking_number,order_items(product_name,specification,quantity,unit_price,line_total)").order("created_at", { ascending: false }),
      client.from("personal_shopping_requests").select("id,request_number,user_id,customer_name,email,phone,line_id,note,items,status,quote_amount,quote_details,service_direction,contact_language,quote_currency,delivery_address,payment_method,admin_note,created_at,updated_at").order("created_at", { ascending: false }),
      client.from("products").select("*,product_variants(id,option_value,sku,image_url,stock_quantity,sort_order,is_active)").order("brand_code").order("sort_order").order("created_at"),
      client.from("product_master").select("*").order("created_at", { ascending: false }),
      client.from("cost_scenarios").select("*").order("created_at", { ascending: false }),
      client.from("suppliers").select("*").order("name"),
      client.from("purchase_orders").select("*,suppliers(name),purchase_order_items(*,product_master(name,product_code))").order("created_at", { ascending: false })
    ]), new Promise((_, reject) => {
      loadingTimeout = setTimeout(() => reject(new Error("資料讀取逾時，請按重新整理再試一次。")), 20000);
    })]);
    const failed = [profileResult, accountResult, applicationResult, addressResult, ezwayResult, orderResult, personalResult, productResult, masterResult, costResult, supplierResult, purchaseResult].find(result => result.error);
    if (failed) {
      showMessage("adminGlobalMessage", failed.error.message || "資料讀取失敗。", "error");
      return;
    }
    profiles = profileResult.data || [];
    memberAccounts = accountResult.data || [];
    membershipApplications = applicationResult.data || [];
    addresses = addressResult.data || [];
    ezwayProfiles = ezwayResult.data || [];
    orders = orderResult.data || [];
    personalRequests = personalResult.data || [];
    products = productResult.data || [];
    masterProducts = masterResult.data || [];
    costScenarios = costResult.data || [];
    suppliers = supplierResult.data || [];
    purchaseOrders = purchaseResult.data || [];
    renderAll();
    showMessage("adminGlobalMessage", "資料更新時間：" + new Date().toLocaleTimeString("zh-TW"), "success");
    } catch (error) {
      console.error("Admin data loading failed", error);
      showMessage("adminGlobalMessage", error.message || "資料顯示失敗，請重新整理後再試。", "error");
    } finally {
      clearTimeout(loadingTimeout);
    }
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
    renderProducts();
    renderMasterProducts();
    renderCosts();
    renderPurchases();
  }

  function productSlug(brand, name) {
    const latin = String(name || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    return brand + "-" + (latin || "product") + "-" + Date.now().toString(36);
  }

  const masterStatusLabels = { pending_review: "待確認", confirmed: "已確認", costed: "已試算", ready_to_publish: "待上架", published: "已上架", archived: "已封存" };

  function setMasterPreview(url) {
    const image = byId("masterImagePreview");
    image.hidden = !url; byId("masterPreviewEmpty").hidden = Boolean(url);
    if (url) image.src = url; else image.removeAttribute("src");
  }

  function openMasterForm(item) {
    const form = byId("masterForm"); form.hidden = false; form.reset();
    byId("masterId").value = item?.id || ""; byId("masterCode").value = item?.product_code || "";
    byId("masterSourceUrl").value = item?.source_url || ""; byId("masterBrandName").value = item?.brand_name || "";
    byId("masterBrandCode").value = item?.storefront_brand_code || ""; byId("masterName").value = item?.name || "";
    byId("masterSpecification").value = item?.specification || ""; byId("masterUsage").value = item?.usage_flavor || "";
    byId("masterDescription").value = item?.description || ""; byId("masterModel").value = item?.model || "";
    byId("masterBarcode").value = item?.barcode || ""; byId("masterReferencePrice").value = item?.reference_price_jpy || 0;
    byId("masterWeight").value = item?.weight_g || 0; byId("masterNotes").value = item?.notes || "";
    byId("masterStatus").value = item?.status || "pending_review";
    byId("masterExistingImage").value = item?.image_url || ""; byId("masterStoragePath").value = item?.storage_path || "";
    byId("masterFormTitle").textContent = item ? "編輯商品主檔" : "新增候選商品"; setMasterPreview(item?.image_url || "");
  }

  function renderMasterProducts() {
    const term = byId("masterSearch").value.trim().toLowerCase();
    const rows = masterProducts.filter(item => [item.product_code,item.name,item.brand_name,item.source_url].join(" ").toLowerCase().includes(term));
    byId("masterCount").textContent = "共 " + rows.length + " 項";
    byId("masterRows").innerHTML = rows.length ? rows.map(item => {
      const related = Boolean(item.published_product_id || products.some(p => p.product_master_id === item.id) || costScenarios.some(s => s.product_master_id === item.id) || purchaseOrders.some(o => (o.purchase_order_items || []).some(i => i.product_master_id === item.id)));
      const action = related ? "封存" : "刪除";
      return '<article class="product-item" data-master-id="'+escapeHtml(item.id)+'"><img src="'+escapeHtml(item.image_url||"assets/logo_round.png")+'" alt=""><div><h3>'+escapeHtml(item.name)+'</h3><small>'+escapeHtml(item.product_code)+' · '+escapeHtml(item.brand_name)+'</small><span class="product-status">'+escapeHtml(masterStatusLabels[item.status]||item.status)+'</span></div><div class="product-meta"><p>'+escapeHtml(item.specification||"—")+'</p><small class="master-source">'+escapeHtml(item.source_url||"無來源網址")+'</small></div><strong>'+escapeHtml(formatMoney(item.reference_price_jpy,"JPY"))+'</strong><div class="product-actions"><button type="button" data-edit-master>編輯</button><button class="danger" type="button" data-delete-master>'+action+'</button></div></article>';
    }).join("") : '<div class="admin-empty">目前尚無商品主檔。</div>';
    const ready=masterProducts.filter(item=>item.status==="ready_to_publish"&&!item.published_product_id&&!linkedProduct(item.id)&&item.storefront_brand_code&&adoptedCost(item.id));
    byId("productCandidate").innerHTML='<option value="">從待上架主檔選擇（'+ready.length+'）</option>'+ready.map(item=>'<option value="'+item.id+'">'+escapeHtml(item.product_code+'｜'+item.name)+'</option>').join("");
  }

  async function saveMaster(event) {
    event.preventDefault(); const id=byId("masterId").value; const file=byId("masterImage").files[0];
    try {
      const uploaded=await uploadProductImage(file,"master",byId("masterCode").value.toLowerCase().replace(/[^a-z0-9-]/g,"-")||"candidate");
      const payload={source_url:byId("masterSourceUrl").value.trim(),brand_name:byId("masterBrandName").value.trim(),storefront_brand_code:byId("masterBrandCode").value||null,name:byId("masterName").value.trim(),specification:byId("masterSpecification").value.trim(),usage_flavor:byId("masterUsage").value.trim(),description:byId("masterDescription").value.trim(),model:byId("masterModel").value.trim(),barcode:byId("masterBarcode").value.trim(),reference_price_jpy:Number(byId("masterReferencePrice").value)||0,weight_g:Number(byId("masterWeight").value)||0,notes:byId("masterNotes").value.trim(),status:byId("masterStatus").value,image_url:uploaded?.url||byId("masterExistingImage").value,storage_path:uploaded?.path||byId("masterStoragePath").value||null,updated_at:new Date().toISOString()};
      const {error}=id?await client.from("product_master").update(payload).eq("id",id):await client.from("product_master").insert(payload); if(error) throw error;
      byId("masterForm").hidden=true; await loadData();
    } catch(error){showMessage("masterFormMessage",error.message||"商品主檔儲存失敗。","error");}
  }

  async function deleteMaster(id) {
    const item = masterProducts.find(product => product.id === id);
    if (!item) return;
    const related = Boolean(item.published_product_id || products.some(p => p.product_master_id === id) || costScenarios.some(s => s.product_master_id === id) || purchaseOrders.some(o => (o.purchase_order_items || []).some(i => i.product_master_id === id)));
    if (related) {
      if (item.status === "archived") return showMessage("adminGlobalMessage", "此商品主檔已有關聯資料，並已封存。", "success");
      if (!confirm("商品「" + item.name + "」已有上架、成本或進貨關聯，無法直接刪除。是否改為安全封存？")) return;
      const { error } = await client.from("product_master").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
      if (error) return showMessage("adminGlobalMessage", error.message || "商品主檔封存失敗。", "error");
      showMessage("adminGlobalMessage", "商品主檔「" + item.name + "」已封存，既有商品與歷史資料不受影響。", "success");
    } else {
      if (!confirm("確定刪除尚未使用的商品主檔「" + item.name + "」嗎？此動作無法復原。")) return;
      const { error } = await client.from("product_master").delete().eq("id", id);
      if (error) return showMessage("adminGlobalMessage", error.message || "商品主檔刪除失敗。", "error");
      if (item.storage_path) await client.storage.from("product-images").remove([item.storage_path]);
      showMessage("adminGlobalMessage", "商品主檔「" + item.name + "」已刪除。", "success");
    }
    await loadData();
  }

  const costNumber = id => Math.max(0, Number(byId(id).value) || 0);
  const moneyText = value => formatMoney(Math.round(value || 0), "TWD");
  const yenText = value => "¥" + Math.round(value || 0).toLocaleString("zh-TW");
  const kgText = value => Number(value || 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 }) + " kg";

  function calculateCostValues(source) {
    const v = source || {
      quantity: costNumber("costQuantity"), exchange_rate: costNumber("costRate"), purchase_price_jpy: costNumber("costPurchase"), actual_sale_price_twd: costNumber("costSalePrice"),
      japan_shipping_jpy: costNumber("costJapanShipping"), product_weight_g: costNumber("costWeight"), packing_weight_kg: costNumber("costPackingWeight"), box_count: costNumber("costBoxCount"),
      box_length_cm: costNumber("costBoxLength"), box_width_cm: costNumber("costBoxWidth"), box_height_cm: costNumber("costBoxHeight"), freight_rate_jpy_kg: costNumber("costFreightRate"),
      customs_twd: costNumber("costCustoms"), duty_rate: costNumber("costDutyRate") / 100, local_cost_twd: costNumber("costLocal"), platform_rate: costNumber("costPlatform") / 100,
      group_commission_amount_twd: costNumber("costGroupAmount"), target_margin_rate: costNumber("costMargin") / 100
    };
    const qty = Math.max(1, Number(v.quantity) || 1), fx = Math.max(0, Number(v.exchange_rate) || 0), purchase = Math.max(0, Number(v.purchase_price_jpy) || 0), sale = Math.max(0, Number(v.actual_sale_price_twd) || 0);
    const boxCount = Math.max(1, Number(v.box_count) || 1), length = Math.max(0, Number(v.box_length_cm) || 0), width = Math.max(0, Number(v.box_width_cm) || 0), height = Math.max(0, Number(v.box_height_cm) || 0);
    const actualWeight = Math.max(0, Number(v.product_weight_g) || 0) * qty / 1000 + Math.max(0, Number(v.packing_weight_kg) || 0);
    const hasDimensions = length > 0 && width > 0 && height > 0;
    const volumetricWeight = hasDimensions ? length * width * height / 6000 * boxCount : 0;
    const rawChargeable = Math.max(actualWeight, volumetricWeight);
    const billableWeight = rawChargeable <= 0 ? 0 : rawChargeable <= 1 ? 1 : rawChargeable <= 20 ? Math.ceil(rawChargeable * 2) / 2 : Math.ceil(rawChargeable);
    const intlJpy = billableWeight * Math.max(0, Number(v.freight_rate_jpy_kg) || 0);
    const productUnit = purchase * fx;
    const japanShippingUnit = Math.max(0, Number(v.japan_shipping_jpy) || 0) * fx / qty;
    const intlUnit = intlJpy * fx / qty;
    const customsUnit = Math.max(0, Number(v.customs_twd) || 0) / qty;
    const dutyRate = Math.max(0, Number(v.duty_rate) || 0);
    const dutyUnit = (productUnit + japanShippingUnit + intlUnit) * dutyRate;
    const landed = productUnit + japanShippingUnit + intlUnit + customsUnit + dutyUnit;
    const fixed = landed + Math.max(0, Number(v.local_cost_twd) || 0);
    const groupFee = Math.max(0, Number(v.group_commission_amount_twd) || 0);
    const platformRate = Math.max(0, Number(v.platform_rate) || 0);
    const targetRate = Math.max(0, Number(v.target_margin_rate) || 0);
    const platformFee = sale * platformRate;
    const netReceipt = sale - groupFee - platformFee;
    const full = fixed + groupFee + platformFee;
    const profit = sale - full;
    const margin = sale > 0 ? profit / sale * 100 : 0;
    const denominator = 1 - platformRate - targetRate;
    const suggested = denominator > 0 ? (fixed + groupFee) / denominator : 0;
    return { productUnit, landed, intlUnit, intlJpy, actualWeight, volumetricWeight, billableWeight, hasDimensions, full, groupFee, platformFee, netReceipt, profit, margin, suggested };
  }

  function calcCost() {
    const values = calculateCostValues();
    byId("costProductUnit").textContent = moneyText(values.productUnit); byId("costLanded").textContent = moneyText(values.landed); byId("costIntlUnit").textContent = moneyText(values.intlUnit); byId("costIntlJpy").textContent = yenText(values.intlJpy);
    byId("costTotalWeight").textContent = kgText(values.actualWeight); byId("costVolWeight").textContent = values.hasDimensions ? kgText(values.volumetricWeight) : "未輸入尺寸"; byId("costBillableWeight").textContent = kgText(values.billableWeight);
    byId("costFull").textContent = moneyText(values.full); byId("costGroupFee").textContent = moneyText(values.groupFee); byId("costPlatformFee").textContent = moneyText(values.platformFee); byId("costNetReceipt").textContent = moneyText(values.netReceipt);
    byId("costProfit").textContent = moneyText(values.profit); byId("costActualMargin").textContent = values.margin.toFixed(1) + "%"; byId("costSuggested").textContent = moneyText(values.suggested);
    const oversized = costNumber("costBoxLength") > 170 || costNumber("costBoxWidth") > 60 || costNumber("costBoxHeight") > 60;
    byId("costFreightHint").textContent = !values.hasDimensions ? "未輸入外箱尺寸，目前僅依實際重量估算；已套用最低 1kg 與重量進位規則。" : (oversized ? "外箱尺寸可能超出一般空運規格，實際運費請另行確認。" : "國際運費依實際重量與材積重量取較高者，並套用最低 1kg 與重量進位規則。");
    return values;
  }

  function scenarioValues(s) { return calculateCostValues({ ...s, freight_rate_jpy_kg: s.freight_rate_jpy_kg || 0, duty_rate: s.duty_rate || 0, group_commission_amount_twd: s.group_commission_amount_twd || 0 }); }

  function renderCosts() {
    const selected = byId("costProduct").value;
    const options=masterProducts.filter(x=>x.status!=="archived").map(x=>'<option value="'+x.id+'">'+escapeHtml(x.product_code+'｜'+x.name)+'</option>').join("");
    byId("costProduct").innerHTML='<option value="">請選擇商品</option>'+options; if (selected && masterProducts.some(x => x.id === selected)) byId("costProduct").value = selected;
    if (byId("purchaseProduct")) byId("purchaseProduct").innerHTML='<option value="">請選擇商品</option>'+options;
    byId("costRows").innerHTML=costScenarios.length?costScenarios.map(s=>{const p=masterProducts.find(x=>x.id===s.product_master_id),v=scenarioValues(s);return '<tr data-cost-id="'+escapeHtml(s.id)+'"><td><strong>'+escapeHtml(p?.name||"未知商品")+'</strong><small>'+escapeHtml(s.scenario_name||"成本方案")+(s.is_selected?' · 上架採用':'')+'</small></td><td>'+yenText(s.purchase_price_jpy)+'</td><td>'+moneyText(v.productUnit)+'</td><td>'+moneyText(v.intlUnit)+'</td><td>'+moneyText(v.landed)+'</td><td>'+moneyText(v.full)+'</td><td>'+moneyText(v.groupFee)+'</td><td>'+moneyText(s.actual_sale_price_twd)+'</td><td>'+moneyText(v.netReceipt)+'</td><td>'+moneyText(v.profit)+'</td><td><div class="cost-row-actions"><button type="button" data-edit-cost>編輯</button><button type="button" data-select-cost>'+ (s.is_selected?'已採用':'採用') +'</button><button class="danger" type="button" data-delete-cost>刪除</button></div></td></tr>';}).join(""):'<tr><td colspan="11" class="admin-empty">尚無成本方案。</td></tr>';
    calcCost();
  }

  function resetCostForm() { byId("costForm").reset(); byId("costId").value=""; byId("costFormTitle").textContent="商品成本試算"; byId("costCancelEdit").hidden=true; calcCost(); }

  function editCost(id) { const s=costScenarios.find(x=>x.id===id); if(!s)return; const set=(id,value)=>{byId(id).value=value??0;}; byId("costId").value=s.id; set("costProduct",s.product_master_id); set("costMsrp",s.msrp_jpy); set("costWholesaleRate",s.wholesale_rate); set("costPurchase",s.purchase_price_jpy); set("costQuantity",s.quantity); set("costRate",s.exchange_rate); set("costJapanShipping",s.japan_shipping_jpy); set("costWeight",s.product_weight_g); set("costPackingWeight",s.packing_weight_kg); set("costBoxCount",s.box_count||1); set("costBoxLength",s.box_length_cm); set("costBoxWidth",s.box_width_cm); set("costBoxHeight",s.box_height_cm); set("costFreightRate",s.freight_rate_jpy_kg); set("costCustoms",s.customs_twd); set("costDutyRate",(s.duty_rate||0)*100); set("costLocal",s.local_cost_twd); set("costPlatform",(s.platform_rate||0)*100); set("costGroupAmount",s.group_commission_amount_twd); set("costSalePrice",s.actual_sale_price_twd); set("costMargin",(s.target_margin_rate||0)*100); byId("costFormTitle").textContent="編輯商品成本方案"; byId("costCancelEdit").hidden=false; calcCost(); byId("costForm").scrollIntoView({behavior:"smooth",block:"start"}); }

  async function saveCost(event){event.preventDefault();const values=calcCost(),id=byId("costId").value,productId=byId("costProduct").value;const payload={product_master_id:productId,scenario_name:"成本方案 "+new Date().toLocaleDateString("zh-TW"),msrp_jpy:costNumber("costMsrp"),wholesale_rate:costNumber("costWholesaleRate"),purchase_price_jpy:costNumber("costPurchase"),quantity:Math.max(1,costNumber("costQuantity")),exchange_rate:costNumber("costRate"),japan_shipping_jpy:costNumber("costJapanShipping"),product_weight_g:costNumber("costWeight"),packing_weight_kg:costNumber("costPackingWeight"),box_count:Math.max(1,costNumber("costBoxCount")),box_length_cm:costNumber("costBoxLength"),box_width_cm:costNumber("costBoxWidth"),box_height_cm:costNumber("costBoxHeight"),freight_rate_jpy_kg:costNumber("costFreightRate"),customs_twd:costNumber("costCustoms"),duty_rate:costNumber("costDutyRate")/100,local_cost_twd:costNumber("costLocal"),platform_rate:costNumber("costPlatform")/100,group_commission_amount_twd:costNumber("costGroupAmount"),target_margin_rate:costNumber("costMargin")/100,actual_sale_price_twd:costNumber("costSalePrice"),calculated_cost_twd:Math.round(values.full),suggested_price_twd:Math.round(values.suggested),actual_weight_kg:values.actualWeight,volumetric_weight_kg:values.volumetricWeight,billable_weight_kg:values.billableWeight,estimated_intl_freight_jpy:values.intlJpy,landed_unit_cost_twd:values.landed,full_unit_cost_twd:values.full,platform_fee_unit_twd:values.platformFee,net_receipt_unit_twd:values.netReceipt,updated_at:new Date().toISOString()};const result=id?await client.from("cost_scenarios").update(payload).eq("id",id):await client.from("cost_scenarios").insert(payload);if(result.error)return showMessage("costMessage",result.error.message,"error");resetCostForm();await loadData();if(linkedProduct(productId))showMessage("adminGlobalMessage","成本方案已儲存；既有商品售價與上架狀態維持不變，請至商品管理確認售價。","success");}

  async function selectCost(id){
    const scenario=costScenarios.find(x=>x.id===id);if(!scenario)return;
    if(Number(scenario.actual_sale_price_twd)<=0)return showMessage("costMessage","請先填寫大於 0 的實際銷售價，再採用成本方案。","error");
    const {error}=await client.rpc("adopt_product_cost",{p_id:id});
    if(error)return showMessage("costMessage",error.message,"error");
    await loadData();
    showMessage("adminGlobalMessage",linkedProduct(scenario.product_master_id)?"成本方案已採用；既有商品售價與上架狀態維持不變，請至商品管理確認售價。":"成本方案已採用；指定網站品牌後即可從待上架主檔選擇商品。","success");
  }
  async function deleteCost(id){if(!confirm("確定刪除此成本方案嗎？"))return;const {error}=await client.from("cost_scenarios").delete().eq("id",id);if(error)return showMessage("costMessage",error.message,"error");await loadData();}
  function exportCosts(){const header=["商品","實際進貨單價 JPY","商品進貨成本／件","國際運費／件","單件進貨成本","完整成本／件","團購主抽成／件","實際銷售價 TWD","扣除抽成後實收","單件毛利"];const rows=costScenarios.map(s=>{const p=masterProducts.find(x=>x.id===s.product_master_id),v=scenarioValues(s);return [p?.name||"未知商品",s.purchase_price_jpy,Math.round(v.productUnit),Math.round(v.intlUnit),Math.round(v.landed),Math.round(v.full),Math.round(v.groupFee),s.actual_sale_price_twd,Math.round(v.netReceipt),Math.round(v.profit)];});const csv="\uFEFF"+[header,...rows].map(row=>row.map(value=>'"'+String(value??"").replaceAll('"','""')+'"').join(",")).join("\r\n");const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));link.download="frea-cost-scenarios-"+new Date().toISOString().slice(0,10)+".csv";link.click();URL.revokeObjectURL(link.href);}

  let supplierRequestId = null, purchaseRequestId = null;
  function renderPurchases() {
    const previous = byId("purchaseSupplier").value;
    byId("purchaseSupplier").innerHTML = '<option value="">請選擇供應商</option>' + suppliers.map(s => '<option value="'+escapeHtml(s.id)+'">'+escapeHtml(s.supplier_code+'｜'+s.name)+'</option>').join("");
    if (suppliers.some(s=>s.id===previous)) byId("purchaseSupplier").value=previous;
    const next=Math.max(0,...suppliers.map(s=>Number(/^SUP_(\d+)$/.exec(s.supplier_code)?.[1]||0)))+1;
    byId("supplierCode").value="SUP_"+String(next).padStart(3,"0");
    if (!byId("purchaseDate").value) {
      const today=new Date();
      byId("purchaseDate").value=[today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-");
    }
    if (!byId("purchaseItemRows").children.length) addPurchaseItem();
    renderSupplierList();
    renderPurchaseList();
  }
  function filteredPurchaseOrders() {
    const from=byId("purchaseFilterFrom").value,to=byId("purchaseFilterTo").value;
    if(from && to && from>to) return null;
    return purchaseOrders.filter(o=>(!from&&!to)||Boolean(o.ordered_at && (!from||o.ordered_at>=from)&&(!to||o.ordered_at<=to)));
  }
  function renderSupplierList() {
    byId("supplierListRows").innerHTML=suppliers.map(s=>"<tr>"+[s.supplier_code,s.name,s.contact_name,s.email,s.phone,s.website,s.notes].map(v=>"<td>"+escapeHtml(v||"—")+"</td>").join("")+"</tr>").join("");
    byId("supplierListCount").textContent="共 "+suppliers.length+" 家供應商";
    byId("supplierListDownload").disabled=!suppliers.length;
  }
  function downloadProcurementCsv(filename,rows) {
    const cell=v=>{
      let value=String(v??"");
      if(typeof v!=="number" && /^[\s\uFEFF]*[=+@-]/.test(value)) value="'"+value;
      return '"'+value.replace(/"/g,'""')+'"';
    };
    const blob=new Blob(["\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  byId("supplierListToggle").addEventListener("click",()=>{
    const panel=byId("supplierListPreview");panel.hidden=!panel.hidden;
    byId("supplierListToggle").setAttribute("aria-expanded",String(!panel.hidden));
    byId("supplierListToggle").textContent=panel.hidden?"供應商清單":"收起供應商清單";
  });
  byId("supplierListDownload").addEventListener("click",()=>downloadProcurementCsv("fréa-供應商清單.csv",[
    ["供應商編號","供應商名稱","聯絡人","Email","電話","網站","備註"],
    ...suppliers.map(s=>[s.supplier_code,s.name,s.contact_name,s.email,s.phone,s.website,s.notes])
  ]));
  ["purchaseFilterFrom","purchaseFilterTo"].forEach(id=>byId(id).addEventListener("change",renderPurchaseList));
  byId("purchaseFilterReset").addEventListener("click",()=>{
    byId("purchaseFilterFrom").value="";byId("purchaseFilterTo").value="";renderPurchaseList();
  });
  byId("purchaseListDownload").addEventListener("click",()=>{
    const rows=filteredPurchaseOrders();if(!rows?.length)return;
    downloadProcurementCsv("fréa-進貨單清單-"+(byId("purchaseFilterFrom").value||"全部")+"-"+(byId("purchaseFilterTo").value||"全部")+".csv",[
      ["進貨單編號","進貨日","供應商編號","供應商名稱","狀態","幣別","商品編號","商品名稱","數量","進貨單價","商品小計","成本方案","備註"],
      ...rows.flatMap(o=>(o.purchase_order_items?.length?o.purchase_order_items:[{}]).map(i=>[
        o.order_number,o.ordered_at,suppliers.find(s=>s.id===o.supplier_id)?.supplier_code,o.suppliers?.name,
        o.status==="draft"?"草稿":o.status,o.currency,i.product_master?.product_code,i.product_master?.name,
        i.quantity,i.unit_cost,i.quantity==null?"":Number(i.quantity)*Number(i.unit_cost),
        costScenarios.find(c=>c.id===i.cost_scenario_id)?.scenario_name||"",o.notes
      ]))
    ]);
  });
  function renderPurchaseList() {
    const rows=filteredPurchaseOrders();
    byId("purchaseListDownload").disabled=!rows?.length;
    byId("purchaseFilterMessage").textContent=rows?"共 "+rows.length+" 筆進貨單":"起日不可晚於迄日，請調整日期。";
    if(!rows){byId("purchaseRows").innerHTML="";return;}
    byId("purchaseRows").innerHTML=rows.length?rows.map(o=>'<article class="admin-order"><div class="admin-order-head"><div><h3>'+escapeHtml(o.order_number)+'</h3><p class="admin-order-meta">'+escapeHtml(o.suppliers?.name||"未指定供應商")+' · '+escapeHtml(o.status==='draft'?'草稿':o.status)+' · 進貨日：'+escapeHtml(o.ordered_at||"未填")+'</p></div></div><ul class="admin-order-items">'+(o.purchase_order_items||[]).map(i=>'<li>'+escapeHtml(i.product_master?.product_code||"")+'｜'+escapeHtml(i.product_master?.name||"")+' × '+escapeHtml(i.quantity)+'｜單價 '+escapeHtml(formatMoney(i.unit_cost,o.currency))+(i.cost_scenario_id?'｜來源：'+escapeHtml(costScenarios.find(c=>c.id===i.cost_scenario_id)?.scenario_name||"已連結成本方案"):'')+'</li>').join("")+'</ul><p class="admin-order-meta">'+escapeHtml(o.notes||"")+'</p></article>').join(""):'<div class="admin-empty">此區間沒有進貨單。</div>';
  }
  function addPurchaseItem() {
    const row=document.createElement("div");
    row.dataset.purchaseItem="";
    row.style.cssText="min-width:0;border:1px solid #e5d9cc;border-radius:12px;padding:16px;margin-bottom:12px";
    row.innerHTML='<div class="stack-form"><label>商品<select data-purchase-product required style="width:100%;min-width:0;max-width:100%"><option value="">請選擇商品</option>'+masterProducts.filter(p=>p.status!=="archived").map(p=>'<option value="'+escapeHtml(p.id)+'">'+escapeHtml(p.product_code+'｜'+p.name)+'</option>').join("")+'</select></label><label>套用成本方案<select data-purchase-cost style="width:100%;min-width:0;max-width:100%"><option value="">手動填寫</option></select></label><label>數量<input data-purchase-quantity type="number" min="1" step="1" value="1" required></label><label>日幣進貨單價（JPY／件）<input data-purchase-price type="number" min="0" step="0.01" value="0" required></label><button type="button" class="product-cancel" data-remove-purchase-item>移除商品</button></div>';
    byId("purchaseItemRows").appendChild(row);
  }
  byId("purchaseAddItem").addEventListener("click",addPurchaseItem);
  byId("purchaseItemRows").addEventListener("click",event=>{
    if(event.target.closest("[data-remove-purchase-item]"))event.target.closest("[data-purchase-item]").remove();
  });
  byId("purchaseItemRows").addEventListener("change",event=>{
    const row=event.target.closest("[data-purchase-item]");if(!row)return;
    if(event.target.matches("[data-purchase-product]")){
      row.querySelector("[data-purchase-cost]").innerHTML='<option value="">手動填寫</option>'+costScenarios.filter(c=>c.product_master_id===event.target.value).map(c=>'<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.scenario_name)+'｜¥'+escapeHtml(c.purchase_price_jpy)+'</option>').join("");
      row.querySelector("[data-purchase-quantity]").value=1;row.querySelector("[data-purchase-price]").value=0;
    }
    if(event.target.matches("[data-purchase-cost]")){
      const c=costScenarios.find(c=>c.id===event.target.value&&c.product_master_id===row.querySelector("[data-purchase-product]").value);
      if(c){row.querySelector("[data-purchase-quantity]").value=c.quantity;row.querySelector("[data-purchase-price]").value=c.purchase_price_jpy;}
    }
  });
  async function procurementRpc(name,payload) {
    const controller=new AbortController();let timer;
    try {
      const result=await Promise.race([
        Promise.resolve(client.rpc(name,payload).abortSignal(controller.signal)),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("確認逾時，請保留原內容再次送出；系統會核對同一筆操作，避免重複建立。"));},20000);})
      ]);
      if(result.error)throw result.error;
      return result.data;
    } finally {clearTimeout(timer);}
  }
  async function saveSupplier(event) {
    event.preventDefault();const form=event.target;if(form.dataset.saving==="true"||!form.reportValidity())return;
    const controls=[...form.querySelectorAll("input,textarea,button")];
    supplierRequestId ||= crypto.randomUUID();
    const payload={p_id:supplierRequestId,p_name:byId("supplierName").value.trim(),p_website:byId("supplierWebsite").value.trim(),p_notes:byId("supplierNotes").value.trim()};
    form.dataset.saving="true";controls.forEach(el=>el.disabled=true);
    try{
      const data=await procurementRpc("create_supplier",payload);
      supplierRequestId=null;form.reset();await loadData();
      showMessage("adminGlobalMessage","供應商 "+data.supplier_code+" 已新增。","success");
    }catch(error){showMessage("adminGlobalMessage",error.message||"新增供應商失敗。","error");}
    finally{form.dataset.saving="false";controls.forEach(el=>el.disabled=false);}
  }
  async function savePurchase(event) {
    event.preventDefault();const form=event.target;if(form.dataset.saving==="true"||!form.reportValidity())return;
    const items=[...byId("purchaseItemRows").querySelectorAll("[data-purchase-item]")].map(row=>({
      product_master_id:row.querySelector("[data-purchase-product]").value,
      cost_scenario_id:row.querySelector("[data-purchase-cost]").value||null,
      quantity:Number(row.querySelector("[data-purchase-quantity]").value),
      unit_cost:Number(row.querySelector("[data-purchase-price]").value)
    }));
    if(!items.length)return showMessage("adminGlobalMessage","請至少加入一筆商品明細。","error");
    purchaseRequestId ||= crypto.randomUUID();
    const payload={p_id:purchaseRequestId,p_supplier_id:byId("purchaseSupplier").value,p_ordered_at:byId("purchaseDate").value,p_notes:byId("purchaseNotes").value.trim(),p_items:items};
    const controls=[...form.querySelectorAll("input,select,textarea,button")];
    form.dataset.saving="true";controls.forEach(el=>el.disabled=true);
    try{
      const data=await procurementRpc("create_purchase_order",payload);
      purchaseRequestId=null;form.reset();byId("purchaseItemRows").replaceChildren();await loadData();
      showMessage("adminGlobalMessage","進貨單 "+data.order_number+" 已建立。","success");
    }catch(error){showMessage("adminGlobalMessage",error.message||"建立进貨單失敗。","error");}
    finally{form.dataset.saving="false";controls.forEach(el=>el.disabled=false);}
  }

  function renderProducts() {
    const term = byId("productSearch").value.trim().toLowerCase();
    const brand = byId("productBrandFilter").value;
    const status = byId("productStatusFilter").value;
    const filtered = products.filter(product => {
      const searchable = [product.name, product.specification, product.usage_flavor, product.description].join(" ").toLowerCase();
      const statusMatch = !status || (status === "active" ? product.is_active : !product.is_active);
      return (!term || searchable.includes(term)) && (!brand || product.brand_code === brand) && statusMatch;
    });
    byId("productCount").textContent = "共 " + filtered.length + " 項";
    const target = byId("productRows");
    if (!filtered.length) {
      target.innerHTML = '<div class="admin-empty">目前沒有符合的商品。</div>';
      return;
    }
    target.innerHTML = filtered.map(product => '<article class="product-item" data-product-id="' + escapeHtml(product.id) + '">' +
      '<img src="' + escapeHtml(product.image_url || "assets/logo_round.png") + '" alt="' + escapeHtml(product.name) + '">' +
      '<div><h3>' + escapeHtml(product.name) + '</h3><small>' + escapeHtml(brandLabels[product.brand_code] || product.brand_code) +
      ' · ' + escapeHtml(product.specification) + '</small><span class="product-status' + (product.is_active ? "" : " inactive") + '">' +
      (product.is_active ? "上架中" : "已下架") + '</span></div><div class="product-meta"><p>' + escapeHtml(product.usage_flavor || "—") +
      '</p></div><strong class="product-price">' + escapeHtml(formatMoney(product.price, product.currency)) +
      '</strong><strong class="product-stock' + (Number(product.stock_quantity) === 0 ? " product-stock-zero" : "") + '">庫存 ' +
      escapeHtml(product.stock_quantity) + '</strong><small class="product-sort">排序 ' + escapeHtml(product.sort_order) +
      '</small><div class="product-actions"><button type="button" data-edit-product>編輯</button><button type="button" data-toggle-product>' +
      (product.is_active ? "下架" : "上架") + '</button><button class="danger" type="button" data-delete-product>刪除</button></div></article>').join("");
  }

  function setProductPreview(url) {
    const image = byId("productImagePreview");
    const empty = byId("productPreviewEmpty");
    image.hidden = !url;
    empty.hidden = Boolean(url);
    if (url) image.src = url;
    else image.removeAttribute("src");
  }

  function renderProductVariants(variants = []) {
    const target = byId("productVariantRows");
    target.innerHTML = variants.length ? variants.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(item =>
      '<div class="product-variant-row"><input data-variant-label placeholder="顏色名稱" value="'+escapeHtml(item.option_value||"")+'"><input data-variant-sku placeholder="商品編號" value="'+escapeHtml(item.sku||"")+'"><input data-variant-stock type="number" min="0" step="1" placeholder="庫存" value="'+escapeHtml(item.stock_quantity??0)+'"><input data-variant-image type="url" placeholder="該色圖片網址" value="'+escapeHtml(item.image_url||"")+'"><button class="product-variant-remove" type="button">移除</button></div>'
    ).join("") : '<div class="product-variant-empty">此商品沒有顏色規格。</div>';
    target.querySelectorAll(".product-variant-remove").forEach(button=>button.addEventListener("click",()=>{button.closest(".product-variant-row").remove();if(!target.querySelector(".product-variant-row"))renderProductVariants([]);}));
  }

  function addProductVariant() {
    const target=byId("productVariantRows");
    if(target.querySelector(".product-variant-empty"))target.innerHTML="";
    const row=document.createElement("div");
    row.className="product-variant-row";
    row.innerHTML='<input data-variant-label placeholder="顏色名稱"><input data-variant-sku placeholder="商品編號"><input data-variant-stock type="number" min="0" step="1" placeholder="庫存" value="0"><input data-variant-image type="url" placeholder="該色圖片網址"><button class="product-variant-remove" type="button">移除</button>';
    row.querySelector(".product-variant-remove").addEventListener("click",()=>{row.remove();if(!target.querySelector(".product-variant-row"))renderProductVariants([]);});
    target.appendChild(row);
  }

  function openProductForm(product) {
    const form = byId("productForm");
    form.hidden = false;
    form.reset();
    byId("productId").value = product?.id || "";
    byId("productMasterId").value = product?.product_master_id || "";
    byId("productCostScenarioId").value = product?.cost_scenario_id || "";
    byId("productExistingImage").value = product?.image_url || "";
    byId("productStoragePath").value = product?.storage_path || "";
    byId("productBrand").value = product?.brand_code || "";
    byId("productName").value = product?.name || "";
    byId("productSpecification").value = product?.specification || "";
    byId("productUsage").value = product?.usage_flavor || "";
    byId("productDescription").value = product?.description || "";
    byId("productPrice").value = product?.price ?? "";
    byId("productCurrency").value = product?.currency || "JPY";
    byId("productStock").value = product?.stock_quantity ?? 0;
    byId("productSort").value = product?.sort_order ?? 0;
    byId("productActive").value = String(product?.is_active ?? false);
    renderProductVariants(product?.product_variants || []);
    byId("productFormTitle").textContent = product ? "編輯商品" : "新增商品";
    setProductPreview(product?.image_url || "");
    showMessage("productFormMessage", "");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function adoptedCost(masterId) { return costScenarios.find(s=>s.product_master_id===masterId&&s.is_selected&&Number(s.actual_sale_price_twd)>0); }
  function linkedProduct(masterId) { return products.find(p=>p.product_master_id===masterId); }
  function openProductFromMaster(masterId) {
    const item=masterProducts.find(x=>x.id===masterId);
    if(!item)return openProductForm();
    const existing=linkedProduct(masterId);
    if(existing)return openProductForm(existing);
    const scenario=adoptedCost(item.id);
    if(!scenario||!item.storefront_brand_code)return showMessage("adminGlobalMessage","請先指定網站品牌，並採用實際銷售價大於 0 的成本方案。","error");
    openProductForm({product_master_id:item.id,cost_scenario_id:scenario.id,brand_code:item.storefront_brand_code,name:item.name,specification:item.specification,usage_flavor:item.usage_flavor,description:item.description,price:scenario.actual_sale_price_twd,currency:"TWD",stock_quantity:0,sort_order:0,is_active:false,image_url:item.image_url,storage_path:item.storage_path});
    byId("productFormTitle").textContent="新增商品";
    showMessage("productFormMessage","已帶入採用的成本方案售價；目前預設未上架，請確認資料後再選擇上架。");
  }

  async function uploadProductImage(file, brand, slug) {
    if (!file) return null;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("商品照片僅接受 JPG、PNG 或 WebP。");
    if (file.size > 3 * 1024 * 1024) throw new Error("商品照片不可超過 3MB。");
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = brand + "/" + slug + "-" + Date.now() + "." + extension;
    const { error } = await client.storage.from("product-images").upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw error;
    return { path, url: client.storage.from("product-images").getPublicUrl(path).data.publicUrl };
  }

  async function saveProduct(event) {
    event.preventDefault();
    const id = byId("productId").value;
    const brand = byId("productBrand").value;
    const name = byId("productName").value.trim();
    const file = byId("productImage").files[0];
    if (!id && !file && !byId("productExistingImage").value) {
      showMessage("productFormMessage", "新增商品時請上傳商品照片。", "error");
      return;
    }
    const existing = products.find(p=>p.id===id);
    const masterId=byId("productMasterId").value, active=byId("productActive").value==="true";
    if(!id && masterId && linkedProduct(masterId))return showMessage("productFormMessage","此主檔已建立商品，請從商品清單編輯。","error");
    if(masterId && (!id || (active&&!existing?.is_active)) && !adoptedCost(masterId))return showMessage("productFormMessage","請先採用實際銷售價大於 0 的成本方案。","error");
    if(active && Number(byId("productPrice").value)<=0)return showMessage("productFormMessage","上架售價必須大於 0。","error");
    if(active&&!existing?.is_active&&!confirm("確認商品「"+name+"」的售價、圖片、規格及庫存，並上架至網站？"))return;
    const button = byId("productSave");
    button.disabled = true;
    button.textContent = "儲存中…";
    try {
      const slug = id ? products.find(item => item.id === id)?.slug : productSlug(brand, name);
      const uploaded = await uploadProductImage(file, brand, slug);
      const payload = {
        brand_code: brand, name, description: byId("productDescription").value.trim(),
        specification: byId("productSpecification").value.trim(), usage_flavor: byId("productUsage").value.trim(),
        price: Number(byId("productPrice").value), currency: byId("productCurrency").value,
        stock_quantity: Math.max(0, Math.round(Number(byId("productStock").value) || 0)),
        sort_order: Math.round(Number(byId("productSort").value) || 0), is_active: byId("productActive").value === "true",
        image_url: uploaded?.url || byId("productExistingImage").value,
        storage_path: uploaded?.path || byId("productStoragePath").value || null,
        product_master_id: byId("productMasterId").value || null,
        cost_scenario_id: byId("productCostScenarioId").value || null,
        updated_at: new Date().toISOString()
      };
      if (!id) payload.slug = slug;
      const query = id ? client.from("products").update(payload).eq("id", id).select("id").single() : client.from("products").insert(payload).select("id").single();
      const { data: savedProduct, error } = await query;
      if (error) throw error;
      const productId=savedProduct.id;
      const variants=[...byId("productVariantRows").querySelectorAll(".product-variant-row")].map((row,index)=>({product_id:productId,option_name:"顏色",option_value:row.querySelector("[data-variant-label]").value.trim(),sku:row.querySelector("[data-variant-sku]").value.trim(),image_url:row.querySelector("[data-variant-image]").value.trim(),stock_quantity:Math.max(0,Math.round(Number(row.querySelector("[data-variant-stock]").value)||0)),sort_order:index,is_active:true})).filter(item=>item.option_value&&item.sku);
      const removed=await client.from("product_variants").delete().eq("product_id",productId);
      if(removed.error)throw removed.error;
      if(variants.length){const inserted=await client.from("product_variants").insert(variants);if(inserted.error)throw inserted.error;}

      showMessage("adminGlobalMessage", "商品「" + name + "」已儲存。", "success");
      byId("productForm").hidden = true;
      await loadData();
    } catch (error) {
      showMessage("productFormMessage", error.message || "商品儲存失敗。", "error");
    } finally {
      button.disabled = false;
      button.textContent = "儲存商品";
    }
  }

  async function toggleProduct(id) {
    const product = products.find(item => item.id === id);
    if (!product) return;
    if(!product.is_active){
      if(Number(product.price)<=0)return showMessage("adminGlobalMessage","請先編輯商品，設定大於 0 的售價。","error");
      if(product.product_master_id&&!adoptedCost(product.product_master_id))return showMessage("adminGlobalMessage","請先採用實際銷售價大於 0 的成本方案。","error");
      if(!confirm("確認商品「"+product.name+"」的售價、圖片、規格及庫存，並上架至網站？"))return;
    }
    const { error } = await client.from("products").update({ is_active: !product.is_active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return showMessage("adminGlobalMessage", error.message || "商品狀態更新失敗。", "error");
    await loadData();
  }

  async function deleteProduct(id) {
    const product = products.find(item => item.id === id);
    if (!product || !confirm("確定要刪除商品「" + product.name + "」嗎？此動作無法復原。")) return;
    const { error } = await client.from("products").delete().eq("id", id);
    if (error) return showMessage("adminGlobalMessage", error.message || "商品刪除失敗。", "error");
    if (product.storage_path) await client.storage.from("product-images").remove([product.storage_path]);
    await loadData();
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
      const japan = request.service_direction === 'tw_to_jp';
      const source = japan ? 'TWD' : 'JPY', currency = japan ? 'JPY' : 'TWD';
      const origin = japan ? '台灣' : '日本', destination = japan ? '日本' : '台灣';
      const address = request.delivery_address || {};
      const unitPrices = Array.isArray(quote.unit_prices) ? quote.unit_prices : [];
      const itemHtml = items.length ? '<ul class="admin-order-items">' + items.map(item => {
        const itemUrl = safeHttpUrl(item.url);
        return (
        "<li>" + escapeHtml(item.name || "未填商品名稱") + "｜顏色及規格：" + escapeHtml(item.specification || "—") + "｜數量 " + escapeHtml(item.quantity || 1) +
        (itemUrl ? '｜<a href="' + escapeHtml(itemUrl) + '" target="_blank" rel="noopener">商品連結</a>' : "") + "</li>"
        );
      }).join("") + "</ul>" : "<p>沒有商品明細</p>";
      return '<article class="admin-order" data-personal-id="' + escapeHtml(request.id) + '" data-service-direction="' + (japan ? 'tw_to_jp' : 'jp_to_tw') + '">' +
        '<div class="admin-order-head"><div><h3>' + escapeHtml(request.request_number) +
        '</h3><p class="admin-order-meta">' + escapeHtml(formatDate(request.created_at)) + " · " +
        escapeHtml(japan && request.status === 'purchased' ? '台灣已下單' : personalStatusLabels[request.status] || request.status) + ' · ' + origin + ' → ' + destination + ' · ' + currency + '</p></div><div><strong>' +
        escapeHtml(request.customer_name) + '</strong><p class="admin-order-meta">' +
        escapeHtml(request.email) + "／" + escapeHtml(request.phone) + '</p></div><strong class="admin-order-total" data-quote-display>' +
        (request.quote_amount == null ? "尚未報價" : escapeHtml(formatMoney(request.quote_amount, currency))) + '</strong></div>' +
        '<div class="admin-order-grid"><div><h4>代購品項</h4>' + itemHtml +
        '</div><div><h4>顧客資料與備註</h4><p>LINE ID：' + escapeHtml(request.line_id || "—") +
        '</p><p>' + escapeHtml(request.note || "無備註") + '</p><p>聯絡語言：' + (request.contact_language === 'ja' ? '日本語' : '繁體中文') + ' · 收件國家：' + destination + '</p><p>' + escapeHtml([address.recipient,address.postal_code,address.region,address.city,address.address_line].filter(Boolean).join(' ')) + '</p>' + (japan ? '<p>付款：福岡銀行 ATM 日圓匯款（帳戶資訊於報價確認後提供）</p>' : '') + '</div></div>' +
        '<div class="personal-quote-sheet"><h4>報價試算表</h4><div class="personal-quote-table">' +
        '<div class="personal-quote-row personal-quote-head"><span>商品</span><span>數量</span><span>商品單價（' + source + '）</span><span>小計（' + source + '）</span></div>' +
        items.map((item, index) => '<div class="personal-quote-row"><span>' + escapeHtml(item.name || "未填商品名稱") +
          '</span><span>' + escapeHtml(item.quantity || 1) + '</span><input data-quote-unit data-quantity="' +
          escapeHtml(item.quantity || 1) + '" type="number" min="0" step="1" value="' +
          escapeHtml(unitPrices[index] ?? "") + '" placeholder="0"><strong data-quote-line>¥0</strong></div>').join("") +
        '</div><div class="personal-quote-costs">' +
        '<label>匯率（' + source + ' → ' + currency + '）<input data-quote-rate type="number" min="0" step="0.0001" value="' + escapeHtml(quote.exchange_rate ?? "") + '" placeholder="' + (japan ? '例如 4.5' : '例如 0.22') + '"></label>' +
        '<label>' + origin + '國內運費（' + source + '）<input data-quote-domestic type="number" min="0" step="1" value="' + escapeHtml(quote[japan ? 'domestic_shipping_twd' : 'domestic_shipping_jpy'] ?? "") + '" placeholder="0"></label>' +
        '<label>關稅及手續費（' + currency + '）<input data-quote-fees type="number" min="0" step="1" value="' + escapeHtml(quote[japan ? 'duties_and_fees_jpy' : 'duties_and_fees_twd'] ?? "") + '" placeholder="0"></label>' +
        '<label>國際運費（' + currency + '）<input data-quote-international type="number" min="0" step="1" value="' + escapeHtml(quote[japan ? 'international_shipping_jpy' : 'international_shipping_twd'] ?? "") + '" placeholder="0"></label>' +
        '<label>' + destination + '國內運費（' + currency + '）<input data-quote-taiwan type="number" min="0" step="1" value="' + escapeHtml(quote[japan ? 'japan_shipping_jpy' : 'taiwan_shipping_twd'] ?? '') + '" placeholder="0"></label>' +
        '<label>其他（' + currency + '）<input data-quote-other type="number" min="0" step="1" value="' + escapeHtml(quote[japan ? 'other_fees_jpy' : 'other_fees_twd'] ?? '') + '" placeholder="0"></label>' +
        '<label class="personal-quote-total">總金額（' + currency + '）<output data-quote-total>NT$0</output></label></div>' +
        (japan ? '<p class="admin-order-meta"><a data-bot-twd-jpy-rate href="https://rate.bot.com.tw/xrt?Lang=zh-TW" target="_blank" rel="noopener noreferrer" aria-live="polite" style="color:#8b7561">台灣銀行即時匯率：讀取中…</a></p>' : '<p class="admin-order-meta"><a data-bot-jpy-rate href="https://rate.bot.com.tw/xrt?Lang=zh-TW" target="_blank" rel="noopener noreferrer" aria-live="polite" style="color:#8b7561">台銀日幣現金賣出：讀取中…</a></p>') +
        '<p class="admin-order-meta">計算方式：（商品小計＋' + origin + '國內運費）× 匯率＋關稅及手續費＋國際運費＋' + destination + '國內運費＋其他</p></div>' +
        '<div class="admin-order-controls"><label>處理狀態<select data-personal-status>' +
        personalStatusOptions(request.status).replace('日本已下單', japan ? '台灣已下單' : '日本已下單') + '</select></label><label>後台備註<textarea data-personal-note rows="2" placeholder="僅供管理使用">' +
        escapeHtml(request.admin_note || "") + '</textarea></label><button class="admin-save" type="button" data-save-personal>儲存變更</button></div><div class="personal-quote-actions"><button type="button" data-preview-personal>報價單預覽</button><button type="button" data-download-personal>下載報價單 PDF</button><button type="button" class="danger" data-delete-personal>刪除訂單</button></div></article>';
    }).join("");
    target.querySelectorAll("[data-personal-id]").forEach(recalculatePersonalQuote);
    renderBankRate();
  }

  function quoteNumber(card, selector) {
    return Math.max(0, Number(card.querySelector(selector)?.value) || 0);
  }

  function recalculatePersonalQuote(card) {
    const quote = window.FreaPersonalQuote.read(card);
    card.querySelectorAll('[data-quote-unit]').forEach((input,index)=>{
      input.closest('.personal-quote-row').querySelector('[data-quote-line]').textContent = formatMoney(quote.lines[index],quote.sourceCurrency);
    });
    card.dataset.quoteTotal=String(quote.total);
    card.querySelector('[data-quote-total]').textContent=formatMoney(quote.total,quote.currency);
    card.querySelector('[data-quote-display]').textContent=quote.total>0?formatMoney(quote.total,quote.currency):'尚未報價';
  }

  async function deletePersonalRequest(card) {
    const request=personalRequests.find(item=>String(item.id)===card.dataset.personalId);
    if(!request || !window.confirm('確定刪除代購訂單 '+request.request_number+'？訂單與報價資料將永久刪除，無法復原。')) return;
    const button=card.querySelector('[data-delete-personal]');button.disabled=true;
    try {
      const {data,error}=await client.from('personal_shopping_requests').delete().eq('id',request.id).select('id').single();
      if(error || !data) throw error || new Error('訂單未刪除，請重新整理後再試。');
      personalRequests=personalRequests.filter(item=>String(item.id)!==String(request.id));
      renderPersonalRequests();showMessage('adminGlobalMessage','代購訂單 '+request.request_number+' 已刪除。','success');
    } catch(error){button.disabled=false;showMessage('adminGlobalMessage',error.message || '刪除失敗，請稍後重試。','error');}
  }

  async function previewPersonalQuote(card,download) {
    const request=personalRequests.find(item=>String(item.id)===card.dataset.personalId);
    if(!request || !window.FreaPersonalQuote.validate(card)) return;
    try{await window.FreaPersonalQuote.open(request,window.FreaPersonalQuote.read(card),download);}
    catch(error){showMessage('adminGlobalMessage','報價單產生失敗，請稍後再試。','error');}
  }

  async function savePersonalRequest(card) {
    const id = card.dataset.personalId;
    const button = card.querySelector("[data-save-personal]");
    if(!window.FreaPersonalQuote.validate(card,true)) return;
    recalculatePersonalQuote(card);
    const unitPrices = [...card.querySelectorAll("[data-quote-unit]")].map(input => Math.max(0, Math.round(Number(input.value) || 0)));
    const japan = card.dataset.serviceDirection === 'tw_to_jp';
    const quoteDetails = {
      ...(personalRequests.find(item=>String(item.id)===String(id))?.quote_details || {}),
      unit_prices: unitPrices,
      exchange_rate: quoteNumber(card, "[data-quote-rate]"),
      [japan ? 'domestic_shipping_twd' : 'domestic_shipping_jpy']: Math.round(quoteNumber(card, "[data-quote-domestic]")),
      [japan ? 'duties_and_fees_jpy' : 'duties_and_fees_twd']: Math.round(quoteNumber(card, "[data-quote-fees]")),
      [japan ? 'international_shipping_jpy' : 'international_shipping_twd']: Math.round(quoteNumber(card, "[data-quote-international]")),
      [japan ? 'japan_shipping_jpy' : 'taiwan_shipping_twd']: Math.round(quoteNumber(card, "[data-quote-taiwan]")),
      [japan ? 'other_fees_jpy' : 'other_fees_twd']: Math.round(quoteNumber(card, "[data-quote-other]"))
    };
    const updates = {
      status: card.querySelector("[data-personal-status]").value,
      quote_amount: Number(card.dataset.quoteTotal),
      quote_details: quoteDetails,
      admin_note: card.querySelector("[data-personal-note]").value.trim(),
      updated_at: new Date().toISOString()
    };
    button.disabled = true;
    button.textContent = "儲存中…";
    const controller = new AbortController();
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("儲存逾時，請確認網路後重試；若仍失敗，請重新登入。"));
        }, 20000);
      });
      const { data, error } = await Promise.race([
        Promise.resolve(client.from("personal_shopping_requests").update(updates)
          .eq("id", id).select("id,status,quote_amount,quote_details,admin_note,updated_at")
          .abortSignal(controller.signal).single()),
        timeout
      ]);
      if (error) throw error;
      if (!data) throw new Error("未收到儲存結果，請重新整理確認。");
      const request = personalRequests.find(item => String(item.id) === String(id));
      if (request) Object.assign(request, data);
      showMessage("adminGlobalMessage", "代購需求 " + (request?.request_number || id) + " 已更新。", "success");
      renderPersonalRequests();
    } catch (error) {
      button.textContent = "儲存失敗，重試";
      showMessage("adminGlobalMessage", error.message || "代購需求更新失敗，請稍後重試。", "error");
    } finally {
      clearTimeout(timer);
      button.disabled = false;
      if (button.textContent === "儲存中…") button.textContent = "儲存變更";
    }
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
      [profile.full_name, profile.email, profile.phone, profile.referrer, memberAccounts.find(x=>x.user_id===profile.id)?.member_number].some(value => String(value || "").toLowerCase().includes(term))
    );
    byId("memberCount").textContent = "共 " + filtered.length + " 位";
    const target = byId("memberRows");
    if (!filtered.length) {
      target.innerHTML = '<tr><td colspan="6"><div class="admin-empty">目前沒有符合的會員資料。</div></td></tr>';
      return;
    }
    target.innerHTML = filtered.map(profile => {
      const account = memberAccounts.find(item => item.user_id === profile.id) || {};
      const address = addresses.find(item => item.user_id === profile.id) || {};
      const ezway = ezwayProfiles.find(item => item.user_id === profile.id) || {};
      const deliveryDetail = '<details class="member-delivery-detail"><summary>收件與 EZ WAY 資訊</summary><small>收件人：' +
        escapeHtml(address.recipient_name || "尚未填寫") + '</small><small>收件人手機：' +
        escapeHtml(address.recipient_phone || "尚未填寫") + '</small><small>郵遞區號：' +
        escapeHtml(address.postal_code || "尚未填寫") + '</small><small>收件地址：' +
        escapeHtml(address.address || "尚未填寫") + '</small><small>EZ WAY 實名認證姓名：' +
        escapeHtml(ezway.real_name || "尚未填寫") + '</small><small>EZ WAY 認證手機：' +
        escapeHtml(ezway.mobile || "尚未填寫") + '</small></details>';

      const application = membershipApplications.find(item => item.user_id === profile.id) || {};
      const typeLabels={A01:"fréa 內部專用",B01:"企業會員",C01:"團購主／部落客",D01:"一般會員"};
      const reviewLabels={not_required:"不需審核",draft:"資料未完成",submitted:"待審核",under_review:"審核中",approved:"已通過",changes_requested:"待補件",rejected:"未通過"};
      const applicationDetail=account.member_type==="B01"?[application.company_name,application.tax_id,application.representative_name].filter(Boolean).join("／"):account.member_type==="C01"?application.community_links:"—";
      return "<tr><td><strong>" + escapeHtml(profile.full_name || "未填姓名") +
        "</strong><small>" + escapeHtml(profile.email || "—") + "</small>" + deliveryDetail + "</td><td><strong>"+escapeHtml(account.member_number||"—")+"</strong><small>"+escapeHtml(typeLabels[account.member_type]||"—")+"</small></td><td>" +
        escapeHtml(profile.phone || "—") + "<small>推薦人："+escapeHtml(profile.referrer || "—")+"</small></td><td><strong>"+escapeHtml(reviewLabels[application.status||account.review_status]||"—")+"</strong><small>"+escapeHtml(applicationDetail||"—")+"</small>"+(application.proof_path?'<button class="member-proof" type="button" data-proof-path="'+escapeHtml(application.proof_path)+'">查看證明</button>':"")+"</td><td><div class=\"member-admin-controls\"><select data-member-type=\""+escapeHtml(profile.id)+"\"><option value=\"A01\""+(account.member_type==="A01"?" selected":"")+">A01</option><option value=\"B01\""+(account.member_type==="B01"?" selected":"")+">B01</option><option value=\"C01\""+(account.member_type==="C01"?" selected":"")+">C01</option><option value=\"D01\""+(account.member_type==="D01"?" selected":"")+">D01</option></select>"+(["B01","C01"].includes(account.member_type)?'<select data-review-status="'+escapeHtml(profile.id)+'"><option value="submitted">待審核</option><option value="under_review"'+(application.status==="under_review"?" selected":"")+'>審核中</option><option value="approved"'+(application.status==="approved"?" selected":"")+'>通過</option><option value="changes_requested"'+(application.status==="changes_requested"?" selected":"")+'>補件</option><option value="rejected"'+(application.status==="rejected"?" selected":"")+'>拒絕</option></select>':"")+'<button type="button" data-save-member="'+escapeHtml(profile.id)+'">儲存</button></div></td><td>' +
        escapeHtml(formatDate(profile.created_at)) + "</td></tr>";
    }).join("");
  }

  async function saveMemberClassification(userId){
    const account=memberAccounts.find(x=>x.user_id===userId); if(!account)return;
    const memberType=document.querySelector('[data-member-type="'+CSS.escape(userId)+'"]').value;
    const typeResult=await client.from("member_accounts").update({member_type:memberType,updated_at:new Date().toISOString()}).eq("user_id",userId);
    if(typeResult.error)return showMessage("adminGlobalMessage",typeResult.error.message,"error");
    let application=membershipApplications.find(x=>x.user_id===userId);
    if(["B01","C01"].includes(memberType)&&!application){
      const createResult=await client.from("membership_applications").insert({user_id:userId,requested_type:memberType,status:"draft"});
      if(createResult.error)return showMessage("adminGlobalMessage",createResult.error.message,"error");
      application={user_id:userId,requested_type:memberType,status:"draft"};
    }else if(["B01","C01"].includes(memberType)&&account.member_type!==memberType){
      const resetResult=await client.from("membership_applications").update({requested_type:memberType,status:"draft",reviewed_at:null,reviewed_by:null,updated_at:new Date().toISOString()}).eq("user_id",userId);
      if(resetResult.error)return showMessage("adminGlobalMessage",resetResult.error.message,"error");
    }
    const review=document.querySelector('[data-review-status="'+CSS.escape(userId)+'"]');
    if(review&&application){
      const status=review.value; const result=await client.from("membership_applications").update({status,reviewed_at:new Date().toISOString(),reviewed_by:(await client.auth.getUser()).data.user.id,updated_at:new Date().toISOString()}).eq("user_id",userId);
      if(result.error)return showMessage("adminGlobalMessage",result.error.message,"error");
    }
    await loadData();
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
        '</p><p>匯款證明：' + escapeHtml(order.payment_proof_name || "未上傳") + "</p>" +
        (order.payment_proof_path ? '<button class="admin-save" type="button" data-view-payment-proof>查看匯款證明</button>' : "") + "</div></div>" +
        '<div class="admin-order-controls"><label>訂單狀態<select data-order-status>' +
        statusOptions(order.status) + '</select></label><label data-tracking-wrap' + (order.status === "shipped" ? "" : " hidden") +
        '>出貨單號<input data-tracking-number value="' + escapeHtml(order.tracking_number || "") +
        '" placeholder="請輸入物流出貨單號"></label><label>後台備註<textarea data-order-note rows="2" placeholder="僅供管理使用">' +
        escapeHtml(order.admin_note || "") + '</textarea></label><button class="admin-save" type="button" data-save-order>儲存變更</button></div><div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="danger product-cancel" type="button" data-delete-order>刪除訂單</button></div></article>';
    }).join("");
  }

  async function deleteOrder(card) {
    const order = orders.find(item => String(item.id) === card.dataset.orderId);
    if (!order || !window.confirm("確定刪除訂單 " + order.order_number + "？訂單與商品明細將永久刪除，無法復原。")) return;
    const button = card.querySelector("[data-delete-order]");
    button.disabled = true;
    button.textContent = "刪除中…";
    const controller = new AbortController();
    let timer;
    try {
      const {data, error} = await Promise.race([
        Promise.resolve(client.from("orders").delete().eq("id", order.id).select("id").abortSignal(controller.signal).single()),
        new Promise((_, reject) => {timer = setTimeout(() => {controller.abort();reject(new Error("刪除確認逾時，請重新整理確認訂單是否仍存在。"));},20000);})
      ]);
      if (error || !data) throw error || new Error("未能確認訂單已刪除，請重新整理後再試。");
      orders = orders.filter(item => String(item.id) !== String(order.id));
      renderAll();
      showMessage("adminGlobalMessage", "訂單 " + order.order_number + " 已刪除。", "success");
    } catch (error) {
      showMessage("adminGlobalMessage", error.message || "刪除失敗，請稍後再試。", "error");
    } finally {clearTimeout(timer);button.disabled = false;button.textContent = "刪除訂單";}
  }

  async function viewPaymentProof(card, button) {
    const order = orders.find(item => String(item.id) === String(card.dataset.orderId));
    if (!order?.payment_proof_path) return;
    const viewer = window.open("", "_blank");
    if (!viewer) return showMessage("adminGlobalMessage", "請允許開啟新分頁後，再查看匯款證明。", "error");
    viewer.opener = null;
    button.disabled = true;
    try {
      const { data, error } = await client.storage.from("payment-proofs").createSignedUrl(order.payment_proof_path, 120);
      if (error || !data?.signedUrl) throw error || new Error("無法取得檔案連結。");
      viewer.location.replace(data.signedUrl);
    } catch (error) {
      viewer.close();
      showMessage("adminGlobalMessage", "無法開啟匯款證明，請重新登入或稍後再試。", "error");
    } finally { button.disabled = false; }
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
    if (view === "costs" || view === "personal") refreshBankRate();
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
  byId("memberRows").addEventListener("click", async event => {
    const save = event.target.closest("[data-save-member]");
    if (save) return saveMemberClassification(save.dataset.saveMember);
    const proof = event.target.closest("[data-proof-path]");
    if (proof) {
      const result = await client.storage.from("membership-documents").createSignedUrl(proof.dataset.proofPath, 120);
      if (result.error) return showMessage("adminGlobalMessage", result.error.message || "無法開啟證明文件。", "error");
      window.open(result.data.signedUrl, "_blank", "noopener");
    }
  });
  byId("orderSearch").addEventListener("input", renderOrders);
  byId("orderStatusFilter").addEventListener("change", renderOrders);
  byId("personalSearch").addEventListener("input", renderPersonalRequests);
  byId("personalStatusFilter").addEventListener("change", renderPersonalRequests);
  byId("productSearch").addEventListener("input", renderProducts);
  byId("productBrandFilter").addEventListener("change", renderProducts);
  byId("productStatusFilter").addEventListener("change", renderProducts);
  byId("productCreate").addEventListener("click", () => openProductFromMaster(byId("productCandidate").value));
  byId("productCancel").addEventListener("click", () => { byId("productForm").hidden = true; });
  byId("productVariantAdd").addEventListener("click", addProductVariant);
  byId("productForm").addEventListener("submit", saveProduct);
  byId("productImage").addEventListener("change", event => {
    const file = event.target.files[0];
    if (!file) return setProductPreview(byId("productExistingImage").value);
    setProductPreview(URL.createObjectURL(file));
  });
  byId("productRows").addEventListener("click", event => {
    const item = event.target.closest("[data-product-id]");
    if (!item) return;
    const id = item.dataset.productId;
    if (event.target.closest("[data-edit-product]")) openProductForm(products.find(product => product.id === id));
    if (event.target.closest("[data-toggle-product]")) toggleProduct(id);
    if (event.target.closest("[data-delete-product]")) deleteProduct(id);
  });
  byId("masterSearch").addEventListener("input",renderMasterProducts);
  byId("masterCreate").addEventListener("click",()=>openMasterForm());
  byId("masterCancel").addEventListener("click",()=>{byId("masterForm").hidden=true;});
  byId("masterForm").addEventListener("submit",saveMaster);
  byId("masterImage").addEventListener("change",event=>{const file=event.target.files[0];setMasterPreview(file?URL.createObjectURL(file):byId("masterExistingImage").value);});
  byId("masterRows").addEventListener("click",event=>{const row=event.target.closest("[data-master-id]");if(!row)return;if(event.target.closest("[data-edit-master]"))openMasterForm(masterProducts.find(x=>x.id===row.dataset.masterId));if(event.target.closest("[data-delete-master]"))deleteMaster(row.dataset.masterId);});
  byId("costForm").addEventListener("input",calcCost);
  byId("costForm").addEventListener("submit",saveCost);
  ["costMsrp","costWholesaleRate"].forEach(id=>byId(id).addEventListener("input",()=>{byId("costPurchase").value=Math.round(costNumber("costMsrp")*costNumber("costWholesaleRate")/100);calcCost();}));
  byId("costProduct").addEventListener("change",()=>{const item=masterProducts.find(x=>x.id===byId("costProduct").value);if(item){byId("costMsrp").value=item.reference_price_jpy||0;byId("costWeight").value=item.weight_g||0;byId("costPurchase").value=Math.round(costNumber("costMsrp")*costNumber("costWholesaleRate")/100);calcCost();}});
  byId("costCancelEdit").addEventListener("click",resetCostForm);
  byId("costRows").addEventListener("click",event=>{const row=event.target.closest("[data-cost-id]");if(!row)return;if(event.target.closest("[data-edit-cost]"))editCost(row.dataset.costId);if(event.target.closest("[data-select-cost]"))selectCost(row.dataset.costId);if(event.target.closest("[data-delete-cost]"))deleteCost(row.dataset.costId);});
  byId("exportScenariosExcel").addEventListener("click",exportCosts);
  byId("supplierForm").addEventListener("submit",saveSupplier);
  byId("purchaseForm").addEventListener("submit",savePurchase);
  byId("orderCards").addEventListener("click", event => {
    const deletion = event.target.closest("[data-delete-order]");
    if (deletion) return deleteOrder(deletion.closest(".admin-order"));
    const proof = event.target.closest("[data-view-payment-proof]");
    if (proof) return viewPaymentProof(proof.closest(".admin-order"), proof);
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
    const card=event.target.closest('[data-personal-id]');
    if(!card)return;
    if(event.target.closest('[data-delete-personal]'))return deletePersonalRequest(card);
    if(event.target.closest('[data-preview-personal]'))return previewPersonalQuote(card,false);
    if(event.target.closest('[data-download-personal]'))return previewPersonalQuote(card,true);
    const button = event.target.closest("[data-save-personal]");
    if (button) savePersonalRequest(button.closest(".admin-order"));
  });
  byId("personalCards").addEventListener("input", event => {
    if (!event.target.matches("[data-quote-unit],[data-quote-rate],[data-quote-domestic],[data-quote-fees],[data-quote-international],[data-quote-taiwan],[data-quote-other]")) return;
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



