(function(root){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const snapshot=i=>({name:i.name??null,specification:i.specification??null,quantity:i.quantity??null});
function personalChoices(requests){return requests.filter(p=>p.status!=="cancelled").flatMap(p=>(Array.isArray(p.items)?p.items:[]).map((i,n)=>({key:p.id+":"+n,id:p.id,index:n,snapshot:snapshot(i),label:p.request_number+"｜"+i.name+"｜"+(i.specification||"標準規格")})));}
function snapshotPurchase(o){
return {supplier_id:o.supplier_id,ordered_at:o.ordered_at,notes:o.notes,currency:o.currency,status:o.status,received_at:o.received_at,
items:(o.purchase_order_items||[]).map(i=>({id:i.id,product_master_id:i.product_master_id,cost_scenario_id:i.cost_scenario_id,quantity:Number(i.quantity),unit_cost:Number(i.unit_cost),
personal_request_id:i.personal_request_id??null,personal_item_index:i.personal_item_index??null,personal_snapshot:i.personal_snapshot??null,inventory_sku_id:i.inventory_sku_id??null,
received_quantity:Number(i.received_quantity??0),received_on:i.received_on??null})).sort((a,b)=>a.id.localeCompare(b.id))};
}
function populate(row,item,data){
 const choices=personalChoices(data.personalRequests||[]),personal=!!item?.personal_request_id,inventory=data.inventory||{};
 row.dataset.purchaseItemId=item?.id||row.dataset.purchaseItemId;
 row.innerHTML='<div class="stack-form"><label>商品來源<select data-purchase-kind><option value="catalog">正式商品主檔</option><option value="personal">單次代購（不建立 FR 編號）</option></select></label>'+
 '<div data-purchase-catalog class="stack-form"><label>正式商品<select data-purchase-product><option value="">請選擇商品</option>'+
 (data.masterProducts||[]).filter(p=>p.status!=="archived"||p.id===item?.product_master_id).map(p=>'<option value="'+esc(p.id)+'">'+esc(p.product_code+'｜'+p.name)+'</option>').join("")+'</select></label>'+
 '<label>庫存規格<select data-purchase-sku><option value="">規格待對應</option></select></label><label>套用成本方案<select data-purchase-cost><option value="">手動填寫</option></select></label></div>'+
 '<div data-purchase-personal-fields class="stack-form" hidden><label>代購單商品<select data-purchase-personal><option value="">請選擇代購單明細</option>'+
 choices.map(p=>'<option value="'+esc(p.key)+'">'+esc(p.label)+'</option>').join("")+'</select></label><p data-purchase-personal-info>直接沿用該筆代購的商品名稱、顏色及尺寸，不新增正式商品主檔。</p></div>'+
 '<label>數量<input data-purchase-quantity type="number" min="1" step="1" value="'+esc(item?.quantity??1)+'" required></label>'+
 '<label><span data-purchase-price-label>進貨單價（'+esc(data.currency)+'／件）</span><input data-purchase-price type="number" min="0" step="0.01" value="'+esc(item?.unit_cost??0)+'" required></label>'+
 '<button type="button" class="product-cancel" data-remove-purchase-item>移除商品</button></div>';
 const $=selector=>row.querySelector(selector);
 $('[data-purchase-kind]').value=personal?"personal":"catalog";
 $('[data-purchase-product]').value=item?.product_master_id||"";
 const fillCatalog=()=>{
  const mid=$('[data-purchase-product]').value;
  $('[data-purchase-cost]').innerHTML='<option value="">手動填寫</option>'+(data.costScenarios||[]).filter(c=>c.product_master_id===mid).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.scenario_name)+'</option>').join("");
  const opts=(inventory.skus||[]).filter(s=>s.product_master_id===mid);
  $('[data-purchase-sku]').innerHTML='<option value="">規格待對應</option>'+opts.map(s=>'<option value="'+s.id+'">'+esc(s.specification+"（"+s.unit+"）")+'</option>').join("");
  if(opts.length===1)$('[data-purchase-sku]').value=opts[0].id;
 };
 fillCatalog();
 if(item){$('[data-purchase-cost]').value=item.cost_scenario_id||"";
  const b=(inventory.bindings||[]).find(b=>b.source_type==="purchase"&&b.source_key===item.id);
  if(item.inventory_sku_id||b?.sku_id)$('[data-purchase-sku]').value=item.inventory_sku_id||b.sku_id;
 }
 if(personal){
  const key=item.personal_request_id+":"+item.personal_item_index;
  if(!choices.some(c=>c.key===key))$('[data-purchase-personal]').innerHTML+='<option value="'+esc(key)+'">'+esc(item.personal_snapshot?.name||"歷史代購明細")+'</option>';
  $('[data-purchase-personal]').value=key;row.receiptPersonalSnapshot=item.personal_snapshot;
 }
 const kind=()=>{
  const direct=$('[data-purchase-kind]').value==="personal";
  $('[data-purchase-catalog]').hidden=direct;$('[data-purchase-personal-fields]').hidden=!direct;
  $('[data-purchase-product]').required=!direct;$('[data-purchase-personal]').required=direct;
  $('[data-purchase-product]').disabled=direct;$('[data-purchase-cost]').disabled=direct;$('[data-purchase-sku]').disabled=direct;
  $('[data-purchase-personal]').disabled=!direct;
 };
 kind();
 row.addEventListener("change",event=>{
  if(event.target.matches('[data-purchase-kind]'))kind();
  if(event.target.matches('[data-purchase-product]')){fillCatalog();$('[data-purchase-quantity]').value=1;$('[data-purchase-price]').value=0;}
  if(event.target.matches('[data-purchase-personal]')){
   const choice=choices.find(x=>x.key===event.target.value);
   row.receiptPersonalSnapshot=choice?.snapshot||null;
   if(choice)$('[data-purchase-quantity]').value=Number(choice.snapshot.quantity||1);
   $('[data-purchase-personal-info]').textContent=choice?choice.label:"請先選擇代購單明細。";
  }
  if(event.target.matches('[data-purchase-cost]')){
   const c=(data.costScenarios||[]).find(c=>c.id===event.target.value&&c.product_master_id===$('[data-purchase-product]').value);
   if(c){$('[data-purchase-quantity]').value=c.quantity;if(data.currency==="JPY")$('[data-purchase-price]').value=c.purchase_price_jpy;}
  }
 });
}
function serialize(row){
 const $=q=>row.querySelector(q),direct=$('[data-purchase-kind]').value==="personal",key=$('[data-purchase-personal]').value.split(":");
 return {id:row.dataset.purchaseItemId,product_master_id:direct?null:$('[data-purchase-product]').value||null,
 cost_scenario_id:direct?null:$('[data-purchase-cost]').value||null,inventory_sku_id:direct?null:$('[data-purchase-sku]').value||null,
 personal_request_id:direct?Number(key[0]):null,personal_item_index:direct?Number(key[1]):null,personal_snapshot:direct?row.receiptPersonalSnapshot:null,
 quantity:Number($('[data-purchase-quantity]').value),unit_cost:Number($('[data-purchase-price]').value)};
}
const api={populate,serialize,snapshotPurchase,personalChoices,snapshot};root.FreaReceiptEditor=api;
if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);