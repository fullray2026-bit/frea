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
    const [profileResult, accountResult, applicationResult, addressResult, ezwayResult, orderResult, personalResult, productResult, masterResult, costResult, supplierResult, purchaseResult] = await Promise.all([
      client.from("profiles").select("id,email,full_name,phone,newsletter,created_at").order("created_at", { ascending: false }),
      client.from("member_accounts").select("*").order("created_at", { ascending: false }),
      client.from("membership_applications").select("*").order("created_at", { ascending: false }),
      client.from("member_addresses").select("user_id,recipient_name,recipient_phone,postal_code,address,is_default").eq("is_default", true),
      client.from("ezway_profiles").select("user_id,real_name,mobile"),
      client.from("orders").select("id,user_id,order_number,status,currency,total_amount,created_at,updated_at,recipient_name,recipient_phone,postal_code,shipping_address,payment_proof_name,admin_note,tracking_number,order_items(product_name,specification,quantity,unit_price,line_total)").order("created_at", { ascending: false }),
      client.from("personal_shopping_requests").select("id,request_number,user_id,customer_name,email,phone,line_id,note,items,status,quote_amount,quote_details,admin_note,created_at,updated_at").order("created_at", { ascending: false }),
      client.from("products").select("*").order("brand_code").order("sort_order").order("created_at"),
      client.from("product_master").select("*").order("created_at", { ascending: false }),
      client.from("cost_scenarios").select("*").order("created_at", { ascending: false }),
      client.from("suppliers").select("*").order("name"),
      client.from("purchase_orders").select("*,suppliers(name),purchase_order_items(*,product_master(name,product_code))").order("created_at", { ascending: false })
    ]);
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
    const ready=masterProducts.filter(item=>item.status==="ready_to_publish"&&!item.published_product_id&&item.storefront_brand_code);
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
    byId("purchaseProduct").innerHTML='<option value="">請選擇商品</option>'+options;
    byId("costRows").innerHTML=costScenarios.length?costScenarios.map(s=>{const p=masterProducts.find(x=>x.id===s.product_master_id),v=scenarioValues(s);return '<tr data-cost-id="'+escapeHtml(s.id)+'"><td><strong>'+escapeHtml(p?.name||"未知商品")+'</strong><small>'+escapeHtml(s.scenario_name||"成本方案")+(s.is_selected?' · 上架採用':'')+'</small></td><td>'+yenText(s.purchase_price_jpy)+'</td><td>'+moneyText(v.productUnit)+'</td><td>'+moneyText(v.intlUnit)+'</td><td>'+moneyText(v.landed)+'</td><td>'+moneyText(v.full)+'</td><td>'+moneyText(v.groupFee)+'</td><td>'+moneyText(s.actual_sale_price_twd)+'</td><td>'+moneyText(v.netReceipt)+'</td><td>'+moneyText(v.profit)+'</td><td><div class="cost-row-actions"><button type="button" data-edit-cost>編輯</button><button type="button" data-select-cost>'+ (s.is_selected?'已採用':'採用') +'</button><button class="danger" type="button" data-delete-cost>刪除</button></div></td></tr>';}).join(""):'<tr><td colspan="11" class="admin-empty">尚無成本方案。</td></tr>';
    calcCost();
  }

  function resetCostForm() { byId("costForm").reset(); byId("costId").value=""; byId("costFormTitle").textContent="商品成本試算"; byId("costCancelEdit").hidden=true; calcCost(); }

  function editCost(id) { const s=costScenarios.find(x=>x.id===id); if(!s)return; const set=(id,value)=>{byId(id).value=value??0;}; byId("costId").value=s.id; set("costProduct",s.product_master_id); set("costMsrp",s.msrp_jpy); set("costWholesaleRate",s.wholesale_rate); set("costPurchase",s.purchase_price_jpy); set("costQuantity",s.quantity); set("costRate",s.exchange_rate); set("costJapanShipping",s.japan_shipping_jpy); set("costWeight",s.product_weight_g); set("costPackingWeight",s.packing_weight_kg); set("costBoxCount",s.box_count||1); set("costBoxLength",s.box_length_cm); set("costBoxWidth",s.box_width_cm); set("costBoxHeight",s.box_height_cm); set("costFreightRate",s.freight_rate_jpy_kg); set("costCustoms",s.customs_twd); set("costDutyRate",(s.duty_rate||0)*100); set("costLocal",s.local_cost_twd); set("costPlatform",(s.platform_rate||0)*100); set("costGroupAmount",s.group_commission_amount_twd); set("costSalePrice",s.actual_sale_price_twd); set("costMargin",(s.target_margin_rate||0)*100); byId("costFormTitle").textContent="編輯商品成本方案"; byId("costCancelEdit").hidden=false; calcCost(); byId("costForm").scrollIntoView({behavior:"smooth",block:"start"}); }

  async function saveCost(event){event.preventDefault();const values=calcCost(),id=byId("costId").value,productId=byId("costProduct").value;const payload={product_master_id:productId,scenario_name:"成本方案 "+new Date().toLocaleDateString("zh-TW"),msrp_jpy:costNumber("costMsrp"),wholesale_rate:costNumber("costWholesaleRate"),purchase_price_jpy:costNumber("costPurchase"),quantity:Math.max(1,costNumber("costQuantity")),exchange_rate:costNumber("costRate"),japan_shipping_jpy:costNumber("costJapanShipping"),product_weight_g:costNumber("costWeight"),packing_weight_kg:costNumber("costPackingWeight"),box_count:Math.max(1,costNumber("costBoxCount")),box_length_cm:costNumber("costBoxLength"),box_width_cm:costNumber("costBoxWidth"),box_height_cm:costNumber("costBoxHeight"),freight_rate_jpy_kg:costNumber("costFreightRate"),customs_twd:costNumber("costCustoms"),duty_rate:costNumber("costDutyRate")/100,local_cost_twd:costNumber("costLocal"),platform_rate:costNumber("costPlatform")/100,group_commission_amount_twd:costNumber("costGroupAmount"),target_margin_rate:costNumber("costMargin")/100,actual_sale_price_twd:costNumber("costSalePrice"),calculated_cost_twd:Math.round(values.full),suggested_price_twd:Math.round(values.suggested),actual_weight_kg:values.actualWeight,volumetric_weight_kg:values.volumetricWeight,billable_weight_kg:values.billableWeight,estimated_intl_freight_jpy:values.intlJpy,landed_unit_cost_twd:values.landed,full_unit_cost_twd:values.full,platform_fee_unit_twd:values.platformFee,net_receipt_unit_twd:values.netReceipt,updated_at:new Date().toISOString()};const result=id?await client.from("cost_scenarios").update(payload).eq("id",id):await client.from("cost_scenarios").insert(payload);if(result.error)return showMessage("costMessage",result.error.message,"error");await client.from("product_master").update({status:"costed",updated_at:new Date().toISOString()}).eq("id",productId);resetCostForm();await loadData();}

  async function selectCost(id){const scenario=costScenarios.find(x=>x.id===id);if(!scenario)return;await client.from("cost_scenarios").update({is_selected:false}).eq("product_master_id",scenario.product_master_id);const {error}=await client.from("cost_scenarios").update({is_selected:true}).eq("id",id);if(error)return showMessage("costMessage",error.message,"error");await client.from("product_master").update({status:"ready_to_publish",updated_at:new Date().toISOString()}).eq("id",scenario.product_master_id);await loadData();}
  async function deleteCost(id){if(!confirm("確定刪除此成本方案嗎？"))return;const {error}=await client.from("cost_scenarios").delete().eq("id",id);if(error)return showMessage("costMessage",error.message,"error");await loadData();}
  function exportCosts(){const header=["商品","實際進貨單價 JPY","商品進貨成本／件","國際運費／件","單件進貨成本","完整成本／件","團購主抽成／件","實際銷售價 TWD","扣除抽成後實收","單件毛利"];const rows=costScenarios.map(s=>{const p=masterProducts.find(x=>x.id===s.product_master_id),v=scenarioValues(s);return [p?.name||"未知商品",s.purchase_price_jpy,Math.round(v.productUnit),Math.round(v.intlUnit),Math.round(v.landed),Math.round(v.full),Math.round(v.groupFee),s.actual_sale_price_twd,Math.round(v.netReceipt),Math.round(v.profit)];});const csv="\uFEFF"+[header,...rows].map(row=>row.map(value=>'"'+String(value??"").replaceAll('"','""')+'"').join(",")).join("\r\n");const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));link.download="frea-cost-scenarios-"+new Date().toISOString().slice(0,10)+".csv";link.click();URL.revokeObjectURL(link.href);}

  function renderPurchases(){byId("purchaseSupplier").innerHTML='<option value="">未指定供應商</option>'+suppliers.map(s=>'<option value="'+s.id+'">'+escapeHtml(s.name)+'</option>').join("");byId("purchaseRows").innerHTML=purchaseOrders.length?purchaseOrders.map(o=>'<article class="admin-order"><div class="admin-order-head"><div><h3>'+escapeHtml(o.order_number)+'</h3><p class="admin-order-meta">'+escapeHtml(o.suppliers?.name||"未指定供應商")+' · '+escapeHtml(o.status)+'</p></div></div><ul class="admin-order-items">'+(o.purchase_order_items||[]).map(i=>'<li>'+escapeHtml(i.product_master?.name||"")+' × '+i.quantity+'｜'+escapeHtml(formatMoney(i.unit_cost,o.currency))+'</li>').join("")+'</ul></article>').join(""):'<div class="admin-empty">尚無進貨單。</div>';}
  async function saveSupplier(event){event.preventDefault();const {error}=await client.from("suppliers").insert({supplier_code:byId("supplierCode").value.trim(),name:byId("supplierName").value.trim(),website:byId("supplierWebsite").value.trim(),notes:byId("supplierNotes").value.trim()});if(error)return showMessage("adminGlobalMessage",error.message,"error");event.target.reset();await loadData();}
  async function savePurchase(event){event.preventDefault();const number="PO"+new Date().toISOString().replace(/\D/g,"").slice(0,14),{data,error}=await client.from("purchase_orders").insert({order_number:number,supplier_id:byId("purchaseSupplier").value||null,notes:byId("purchaseNotes").value.trim()}).select("id").single();if(error)return showMessage("adminGlobalMessage",error.message,"error");const itemError=(await client.from("purchase_order_items").insert({purchase_order_id:data.id,product_master_id:byId("purchaseProduct").value,quantity:Math.max(1,Number(byId("purchaseQuantity").value)||1),unit_cost:Number(byId("purchaseUnitCost").value)||0})).error;if(itemError)return showMessage("adminGlobalMessage",itemError.message,"error");event.target.reset();await loadData();}

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
    byId("productActive").value = String(product?.is_active ?? true);
    byId("productFormTitle").textContent = product ? "編輯商品" : "新增商品";
    setProductPreview(product?.image_url || "");
    showMessage("productFormMessage", "");
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openProductFromMaster(masterId){const item=masterProducts.find(x=>x.id===masterId);if(!item)return openProductForm();const scenario=costScenarios.find(x=>x.product_master_id===item.id&&x.is_selected);openProductForm({product_master_id:item.id,cost_scenario_id:scenario?.id||"",brand_code:item.storefront_brand_code,name:item.name,specification:item.specification,usage_flavor:item.usage_flavor,description:item.description,price:scenario?.actual_sale_price_twd||0,currency:"TWD",stock_quantity:0,sort_order:0,is_active:true,image_url:item.image_url,storage_path:item.storage_path});}

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
      const query = id ? client.from("products").update(payload).eq("id", id) : client.from("products").insert(payload);
      const { error } = await query;
      if (error) throw error;
      if (!id && payload.product_master_id) {
        const created = await client.from("products").select("id").eq("slug", slug).single();
        await client.from("product_master").update({ status: "published", published_product_id: created.data?.id || null, updated_at: new Date().toISOString() }).eq("id", payload.product_master_id);
      }
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
      [profile.full_name, profile.email, profile.phone, memberAccounts.find(x=>x.user_id===profile.id)?.member_number].some(value => String(value || "").toLowerCase().includes(term))
    );
    byId("memberCount").textContent = "共 " + filtered.length + " 位";
    const target = byId("memberRows");
    if (!filtered.length) {
      target.innerHTML = '<tr><td colspan="6"><div class="admin-empty">目前沒有符合的會員資料。</div></td></tr>';
      return;
    }
    target.innerHTML = filtered.map(profile => {
      const account = memberAccounts.find(item => item.user_id === profile.id) || {};
      const application = membershipApplications.find(item => item.user_id === profile.id) || {};
      const typeLabels={A01:"fréa 內部專用",B01:"企業會員",C01:"團購主／部落客",D01:"一般會員"};
      const reviewLabels={not_required:"不需審核",draft:"資料未完成",submitted:"待審核",under_review:"審核中",approved:"已通過",changes_requested:"待補件",rejected:"未通過"};
      const applicationDetail=account.member_type==="B01"?[application.company_name,application.tax_id,application.representative_name].filter(Boolean).join("／"):account.member_type==="C01"?application.community_links:"—";
      return "<tr><td><strong>" + escapeHtml(profile.full_name || "未填姓名") +
        "</strong><small>" + escapeHtml(profile.email || "—") + "</small></td><td><strong>"+escapeHtml(account.member_number||"—")+"</strong><small>"+escapeHtml(typeLabels[account.member_type]||"—")+"</small></td><td>" +
        escapeHtml(profile.phone || "—") + "</td><td><strong>"+escapeHtml(reviewLabels[application.status||account.review_status]||"—")+"</strong><small>"+escapeHtml(applicationDetail||"—")+"</small>"+(application.proof_path?'<button class="member-proof" type="button" data-proof-path="'+escapeHtml(application.proof_path)+'">查看證明</button>':"")+"</td><td><div class=\"member-admin-controls\"><select data-member-type=\""+escapeHtml(profile.id)+"\"><option value=\"A01\""+(account.member_type==="A01"?" selected":"")+">A01</option><option value=\"B01\""+(account.member_type==="B01"?" selected":"")+">B01</option><option value=\"C01\""+(account.member_type==="C01"?" selected":"")+">C01</option><option value=\"D01\""+(account.member_type==="D01"?" selected":"")+">D01</option></select>"+(["B01","C01"].includes(account.member_type)?'<select data-review-status="'+escapeHtml(profile.id)+'"><option value="submitted">待審核</option><option value="under_review"'+(application.status==="under_review"?" selected":"")+'>審核中</option><option value="approved"'+(application.status==="approved"?" selected":"")+'>通過</option><option value="changes_requested"'+(application.status==="changes_requested"?" selected":"")+'>補件</option><option value="rejected"'+(application.status==="rejected"?" selected":"")+'>拒絕</option></select>':"")+'<button type="button" data-save-member="'+escapeHtml(profile.id)+'">儲存</button></div></td><td>' +
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
