/* Shared inventory calculation; no storefront stock mutation. */
(function(root){
"use strict";
const stable=x=>JSON.stringify(x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function sources(data){
 const rows=[];
 for(const p of data.purchaseOrders||[]) for(const i of p.purchase_order_items||[]) rows.push({
 type:"purchase",key:String(i.id),number:p.order_number,date:p.ordered_at,status:p.status,
 name:i.personal_snapshot?.name||i.product_master?.name||"",spec:i.personal_snapshot?.specification||"",master:i.product_master_id,quantity:Number(i.quantity),
 personalId:i.personal_request_id,personalIndex:i.personal_item_index,personalSnapshot:i.personal_snapshot,directSku:i.inventory_sku_id,
 receivedQuantity:i.received_quantity,receivedOn:i.received_on,
 snapshot:i.personal_request_id==null?{master:i.product_master_id,quantity:i.quantity}:{master:null,quantity:i.quantity,personal_id:i.personal_request_id,personal_index:i.personal_item_index,personal_snapshot:i.personal_snapshot,sku:i.inventory_sku_id},notes:p.notes||""
 });
 for(const o of data.orders||[]) for(const i of o.order_items||[]) rows.push({
 type:"order",key:String(i.id),number:o.order_number,date:o.created_at?.slice(0,10),status:o.status,
 name:i.product_name,spec:i.specification||"",quantity:Number(i.quantity),
 snapshot:{name:i.product_name,specification:i.specification,quantity:i.quantity},notes:o.admin_note||""
 });
 for(const o of data.personalRequests||[]) (Array.isArray(o.items)?o.items:[]).forEach((i,n)=>rows.push({
 type:"personal",key:o.id+":"+n,number:o.request_number,date:o.created_at?.slice(0,10),status:o.status,
 name:i.name||"",spec:i.specification||"",quantity:Number(i.quantity||1),
 snapshot:{name:i.name??null,specification:i.specification??null,quantity:i.quantity??null},notes:o.admin_note||""
 }));
 return rows;
}
function calculate(data,skus,bindings,adjustments){
 const all=sources(data), index=new Map(bindings.map(b=>[b.source_type+":"+b.source_key,b]));
 const rows=new Map(skus.map(s=>[s.id,{...s,purchased:0,received:0,demand:0,shipped:0,adjusted:0,sources:[]}]));
 let unresolved=0,excluded=0;
 for(const source of all){
  if(source.status==="cancelled"){source.cancelled=true;continue;}
  const b=index.get(source.type+":"+source.key);
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
  } else {r.demand+=q;if(["shipped","completed"].includes(source.status))r.shipped+=q;}
 }
 for(const a of adjustments){const r=rows.get(a.sku_id);if(r)r.adjusted+=Number(a.quantity);}
 for(const r of rows.values()){
  r.pending=r.purchased-r.received;r.reserved=r.demand-r.shipped;
  r.onhand=r.received+r.adjusted-r.shipped;r.available=r.onhand-r.reserved;
  r.balance=r.purchased+r.adjusted-r.demand;r.shortage=Math.max(0,-r.balance);
 }
 const keys=new Set(all.map(s=>s.type+":"+s.key));
 const orphaned=bindings.filter(b=>!keys.has(b.source_type+":"+b.source_key));
 return {rows:[...rows.values()],sources:all,unresolved,excluded,orphaned};
}
const api={sources,calculate,stable};root.FreaInventoryCore=api;
if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
