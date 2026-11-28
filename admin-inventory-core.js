/* Shared inventory calculation; no storefront stock mutation. */
(function(root){
"use strict";
const withReceiptSpec=(i,s)=>i.receipt_specification==null?s:{...s,receipt_specification:i.receipt_specification};
const stable=x=>JSON.stringify(x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const personalShipped=o=>["shipped","shipped_unpaid","completed"].includes(o.status)||(o.status==="payment_received"&&o.quote_details?.fulfillment_shipped===true);
function sources(data){
 const rows=[];
 for(const p of data.purchaseOrders||[]) for(const i of p.purchase_order_items||[]) rows.push({
 type:"purchase",key:String(i.id),number:p.order_number,date:p.ordered_at,status:p.status,
 name:i.personal_snapshot?.name||i.product_master?.name||"",spec:i.receipt_specification??i.personal_snapshot?.specification??"",master:i.product_master_id,quantity:Number(i.quantity),
 personalId:i.personal_request_id,personalIndex:i.personal_item_index,personalSnapshot:i.personal_snapshot,directSku:i.inventory_sku_id,
 receivedQuantity:i.received_quantity,receivedOn:i.received_on,
 snapshot:withReceiptSpec(i,i.personal_request_id==null?{master:i.product_master_id,quantity:i.quantity}:{master:null,quantity:i.quantity,personal_id:i.personal_request_id,personal_index:i.personal_item_index,personal_snapshot:i.personal_snapshot,sku:i.inventory_sku_id}),notes:p.notes||""
 });
 for(const o of data.orders||[]) for(const i of o.order_items||[]) rows.push({
 type:"order",key:String(i.id),number:o.order_number,date:o.created_at?.slice(0,10),status:o.status,
 name:i.product_name,spec:i.specification||"",quantity:Number(i.quantity),itemType:i.item_type||"product",
 snapshot:{name:i.product_name,specification:i.specification,quantity:i.quantity},notes:o.admin_note||""
 });
 for(const o of data.personalRequests||[]) (Array.isArray(o.items)?o.items:[]).forEach((i,n)=>rows.push({
 type:"personal",key:o.id+":"+n,number:o.request_number,date:o.created_at?.slice(0,10),status:o.status,shipped:personalShipped(o),
 name:i.name||"",spec:i.specification||"",quantity:Number(i.quantity||1),
 snapshot:{name:i.name??null,specification:i.specification??null,quantity:i.quantity??null},notes:o.admin_note||""
 }));
 return rows;
}
function potentialRegular(source,master){
 if(master.catalog_type==="personal")return false;
 const name=x=>String(x||"").normalize("NFKC").toLowerCase().replace(/\d+(?:\.\d+)?\s*(?:kg|g|ml|l)\b/gi,"").replace(/[^\p{L}\p{N}]/gu,"");
 if(name(source.name)!==name(master.name))return false;
 const capacity=x=>{const a=String(x||"").match(/(\d+(?:\.\d+)?)\s*(kg|ml|g|l)\b/i);return a?Number(a[1])*(/^(kg|l)$/i.test(a[2])?1000:1)+(/^(kg|g)$/i.test(a[2])?"g":"ml"):null;};
 const a=capacity(source.name+" "+source.spec),b=capacity(master.name+" "+master.specification);
 return !a||!b||a===b;
}
function calculate(data,skus,bindings,adjustments,options={}){
 const all=sources(data), index=new Map(bindings.map(b=>[b.source_type+":"+b.source_key,b]));
 const masterById=new Map((data.masterProducts||[]).map(m=>[m.id,m]));
 const regular=s=>!!s.product_master_id&&masterById.get(s.product_master_id)?.catalog_type!=="personal";
 const visibleSkus=options.scope==="regular"?skus.filter(regular):skus;
 const rows=new Map(visibleSkus.map(s=>[s.id,{...s,purchased:0,received:0,demand:0,shipped:0,adjusted:0,reservedConfirmed:0,reservedUnpaid:0,sources:[]}]));
 let unresolved=0,excluded=0;
 const visibleSources=[];
 for(const source of all){
  if(source.type==="personal"&&!["confirmed","purchased","shipped","shipped_unpaid","payment_received","completed","cancelled"].includes(source.status))continue;
  if(source.status==="cancelled"){source.cancelled=true;continue;}
  const b=index.get(source.type+":"+source.key);
  if(options.scope==="regular"){
   const target=skus.find(s=>s.id===b?.sku_id);
   if(source.type==="purchase"&&(source.personalId!=null||masterById.get(source.master)?.catalog_type==="personal"))continue;
   if(target&&!regular(target))continue;
   if(source.type==="personal"&&!target&&!(data.masterProducts||[]).some(m=>potentialRegular(source,m)))continue;
  }
  visibleSources.push(source);
  if(source.itemType==="expense"){source.binding={...b,purpose:"expense"};source.valid=true;excluded++;continue;}
  source.binding=b;source.valid=!!b&&stable(b.source_snapshot)===stable(source.snapshot);
  if(!source.valid){unresolved++;continue;}
  if(b.purpose!=="sale"){excluded++;continue;}
  const r=rows.get(b.sku_id);
  if(!r){source.valid=false;unresolved++;continue;}
  const q=source.quantity*Number(b.quantity_factor);
  if(!Number.isFinite(q)||q<=0){source.valid=false;unresolved++;continue;}
  r.sources.push({...source,stockQuantity:q});
  if(source.type==="purchase"){
   r.purchased+=q;r.received+=Math.min(source.quantity,Number(source.receivedQuantity??b.received_quantity))*Number(b.quantity_factor);
  } else {r.demand+=q;if(source.shipped||["shipped","completed"].includes(source.status))r.shipped+=q;else if(source.type==="order"&&["pending_payment","payment_review"].includes(source.status))r.reservedUnpaid+=q;else r.reservedConfirmed+=q;}
 }
 for(const a of adjustments){const r=rows.get(a.sku_id);if(r)r.adjusted+=Number(a.quantity);}
 for(const r of rows.values()){
  r.pending=r.purchased-r.received;r.reserved=r.demand-r.shipped;
  r.onhand=r.received+r.adjusted-r.shipped;r.available=r.onhand-r.reserved;
  r.balance=r.purchased+r.adjusted-r.demand;r.shortage=Math.max(0,-r.balance);
 }
 const keys=new Set(all.map(s=>s.type+":"+s.key));
 const orphaned=bindings.filter(b=>!keys.has(b.source_type+":"+b.source_key)&&(options.scope!=="regular"||rows.has(b.sku_id)));
 return {rows:[...rows.values()],sources:visibleSources,unresolved,excluded,orphaned};
}
const api={sources,calculate,stable,personalShipped};root.FreaInventoryCore=api;
if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
