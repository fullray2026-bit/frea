(function(root){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const snapshot=i=>({name:i.name??null,specification:i.specification??null,quantity:i.quantity??null});
function personalChoices(requests){return requests.filter(p=>p.status!=="cancelled").flatMap(p=>(Array.isArray(p.items)?p.items:[]).map((i,n)=>({key:p.id+":"+n,id:p.id,index:n,snapshot:snapshot(i),label:i.name+"｜"+(i.specification||"標準規格")+"｜"+p.request_number})));}
function snapshotPurchase(o){
return {supplier_id:o.supplier_id,ordered_at:o.ordered_at,notes:o.notes,currency:o.currency,status:o.status,received_at:o.received_at,
items:(o.purchase_order_items||[]).map(i=>({id:i.id,product_master_id:i.product_master_id,cost_scenario_id:i.cost_scenario_id,quantity:Number(i.quantity),unit_cost:Number(i.unit_cost),
personal_request_id:i.personal_request_id??null,personal_item_index:i.personal_item_index??null,personal_snapshot:i.personal_snapshot??null,inventory_sku_id:i.inventory_sku_id??null,
received_quantity:Number(i.received_quantity??0),received_on:i.received_on??null})).sort((a,b)=>a.id.localeCompare(b.id))};
}
function populate(row,item,data){
 const choices=personalChoices(data.personalRequests||[]),inventory=data.inventory||{};
 const legacyMaster=(data.masterProducts||[]).find(m=>m.id===item?.product_master_id&&m.catalog_type==="personal");
 const personal=item?.personal_request_id!=null,legacy=!!legacyMaster;
 row.dataset.purchaseItemId=item?.id||row.dataset.purchaseItemId;
 row.innerHTML='<div class="receipt-line"><label>來源<select data-purchase-kind><option value="catalog">常態商品</option><option value="personal">代購商品</option>'+(legacy?'<option value="legacy">代購歷史</option>':"")+'</select></label>'+
 '<div class="receipt-product-cell"><div data-purchase-catalog><label>商品<select data-purchase-product><option value="">選擇常態商品</option>'+
 (data.masterProducts||[]).filter(p=>(p.catalog_type!=="personal"&&p.status!=="archived")||p.id===item?.product_master_id).map(p=>'<option value="'+esc(p.id)+'">'+esc((p.product_code||"代購歷史")+'｜'+p.name)+'</option>').join("")+'</select></label>'+
 '<details class="receipt-cost"><summary>成本方案</summary><select data-purchase-cost aria-label="成本方案"><option value="">手動填寫</option></select></details></div>'+
 '<div data-purchase-personal-fields hidden><label>代購單明細<select data-purchase-personal><option value="">選擇代購單商品</option>'+choices.map(p=>'<option value="'+esc(p.key)+'">'+esc(p.label)+'</option>').join("")+'</select></label><span data-purchase-personal-info class="receipt-sr-only"></span></div>'+
 '<div data-purchase-legacy-fields hidden><label>歷史收據商品<input readonly value="'+esc(legacyMaster?.name||"")+'"></label></div></div>'+
 '<label data-purchase-sku-fields>規格<select data-purchase-sku><option value="">待對應</option></select></label>'+
 '<label data-purchase-direct-spec-fields hidden>規格<input data-purchase-direct-spec readonly></label>'+
 '<label>數量<input data-purchase-quantity type="number" min="1" step="1" value="'+esc(item?.quantity??1)+'" required></label>'+
 '<label><span data-purchase-price-label>單價（'+esc(data.currency)+'）</span><input data-purchase-price type="number" min="0" step="0.01" value="'+esc(item?.unit_cost??0)+'" required></label>'+
 '<label>小計<output data-purchase-subtotal></output></label><button type="button" data-remove-purchase-item aria-label="移除此商品">移除</button></div>';
 const $=q=>row.querySelector(q);
 $('[data-purchase-kind]').value=personal?"personal":legacy?"legacy":"catalog";
 $('[data-purchase-product]').value=item?.product_master_id||"";
 function fillCatalog(){
  const mid=$('[data-purchase-product]').value;
  $('[data-purchase-cost]').innerHTML='<option value="">手動填寫</option>'+(data.costScenarios||[]).filter(c=>c.product_master_id===mid).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.scenario_name)+'</option>').join("");
  const options=(inventory.skus||[]).filter(s=>s.product_master_id===mid);
  $('[data-purchase-sku]').innerHTML='<option value="">待對應</option>'+options.map(s=>'<option value="'+s.id+'">'+esc(s.specification)+'</option>').join("");
  if(options.length===1)$('[data-purchase-sku]').value=options[0].id;
 }
 fillCatalog();
 if(item){
  $('[data-purchase-cost]').value=item.cost_scenario_id||"";
  const binding=(inventory.bindings||[]).find(b=>b.source_type==="purchase"&&b.source_key===item.id);
  if(item.inventory_sku_id||binding?.sku_id)$('[data-purchase-sku]').value=item.inventory_sku_id||binding.sku_id;
 }
 if(personal){
  const key=item.personal_request_id+":"+item.personal_item_index;
  if(!choices.some(c=>c.key===key))$('[data-purchase-personal]').innerHTML+='<option value="'+esc(key)+'">'+esc(item.personal_snapshot?.name||"歷史代購明細")+'</option>';
  $('[data-purchase-personal]').value=key;row.receiptPersonalSnapshot=item.personal_snapshot;
 }
 function kind(){
  const value=$('[data-purchase-kind]').value,direct=value==="personal",historical=value==="legacy";
  $('[data-purchase-catalog]').hidden=direct||historical;$('[data-purchase-personal-fields]').hidden=!direct;$('[data-purchase-legacy-fields]').hidden=!historical;
  $('[data-purchase-sku-fields]').hidden=direct||historical;$('[data-purchase-direct-spec-fields]').hidden=!direct&&!historical;
  $('[data-purchase-direct-spec]').value=historical?legacyMaster?.specification||"依原收據":row.receiptPersonalSnapshot?.specification||"標準規格";
  $('[data-purchase-product]').required=!direct&&!historical;$('[data-purchase-personal]').required=direct;
  $('[data-purchase-product]').disabled=direct||historical;$('[data-purchase-cost]').disabled=direct||historical;$('[data-purchase-sku]').disabled=direct||historical;
  $('[data-purchase-personal]').disabled=!direct;
 }
 function subtotal(){const q=Number($('[data-purchase-quantity]').value),p=Number($('[data-purchase-price]').value);$('[data-purchase-subtotal]').textContent=(q*p).toLocaleString('zh-TW',{maximumFractionDigits:2});}
 kind();subtotal();
 row.addEventListener("input",subtotal);
 row.addEventListener("change",event=>{
  if(event.target.matches('[data-purchase-kind]')){if(event.target.value==="catalog"&&$('[data-purchase-product]').value===legacyMaster?.id){$('[data-purchase-product]').value="";fillCatalog();}kind();}
  if(event.target.matches('[data-purchase-product]')){fillCatalog();$('[data-purchase-quantity]').value=1;$('[data-purchase-price]').value=0;}
  if(event.target.matches('[data-purchase-personal]')){
   const choice=choices.find(c=>c.key===event.target.value);row.receiptPersonalSnapshot=choice?.snapshot||null;
   if(choice)$('[data-purchase-quantity]').value=Number(choice.snapshot.quantity||1);
   $('[data-purchase-personal-info]').textContent=choice?.label||"";kind();
  }
  if(event.target.matches('[data-purchase-cost]')){
   const c=(data.costScenarios||[]).find(c=>c.id===event.target.value&&c.product_master_id===$('[data-purchase-product]').value);
   if(c){$('[data-purchase-quantity]').value=c.quantity;if(data.currency==="JPY")$('[data-purchase-price]').value=c.purchase_price_jpy;}
  }
  subtotal();
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