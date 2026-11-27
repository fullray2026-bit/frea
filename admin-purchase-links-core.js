(function(root){
"use strict";
const stable=x=>JSON.stringify(x&&typeof x==="object"?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function sources(data){
 const map=new Map();
 for(const o of data.orders||[])for(const i of o.order_items||[])map.set("order:"+i.id,{type:"order",key:String(i.id),parentId:o.id,number:o.order_number,status:o.status,name:i.product_name,specification:i.specification||"",quantity:Number(i.quantity),snapshot:{name:i.product_name,specification:i.specification,quantity:i.quantity}});
 for(const o of data.personalRequests||[])(o.items||[]).forEach((i,n)=>map.set("personal:"+o.id+":"+n,{type:"personal",key:o.id+":"+n,parentId:o.id,index:n,number:o.request_number,status:o.status,name:i.name,specification:i.specification||"",quantity:Number(i.quantity||1),snapshot:{name:i.name??null,specification:i.specification??null,quantity:i.quantity??null}}));
 return map;
}
function withReceiptSpec(i,s){return i.receipt_specification==null?s:{...s,receipt_specification:i.receipt_specification};}
function purchaseSnapshot(i){return withReceiptSpec(i,i.personal_request_id==null?{master:i.product_master_id,quantity:i.quantity}:{master:null,quantity:i.quantity,personal_id:i.personal_request_id,personal_index:i.personal_item_index,personal_snapshot:i.personal_snapshot,sku:i.inventory_sku_id});}
function destinationKey(a){return a.order_item_id!=null?"order:"+a.order_item_id:"personal:"+a.personal_request_id+":"+a.personal_item_index;}
function inspect(order,data,allocations,bindings=[],loaded=true){
 const dest=sources(data),bindingIndex=new Map(bindings.map(b=>[b.source_type+":"+b.source_key,b])),numbers=new Map();
 let pending=0,stock=0,stale=0;const lines=[];
 for(const i of order.purchase_order_items||[]){
  const pb=bindingIndex.get("purchase:"+i.id),list=allocations.filter(a=>a.purchase_item_id===i.id);let assigned=0;const links=[];
  for(const a of list){
   const key=destinationKey(a),d=dest.get(key),db=bindingIndex.get(key);
   const valid=!!d&&d.status!=="cancelled"&&stable(a.purchase_snapshot)===stable(purchaseSnapshot(i))&&stable(a.order_snapshot)===stable(d.snapshot)&&(!a.sku_id||pb?.sku_id===a.sku_id&&db?.sku_id===a.sku_id);
   if(!valid){stale++;continue;}
   assigned+=Number(a.quantity);links.push({...a,destination:d});numbers.set(d.type+":"+d.parentId,d);
  }
  const expense=pb&&pb.purpose!=="sale"&&stable(pb.source_snapshot)===stable(purchaseSnapshot(i)),remaining=Math.max(0,Number(i.quantity)-assigned);
  if(!expense&&remaining>0.00001){if(i.allocation_purpose==="stock")stock++;else pending++;}
  lines.push({item:i,links,remaining,expense,stale:list.length-links.length});
 }
 return {numbers:[...numbers.values()].sort((a,b)=>a.number.localeCompare(b.number)),lines,pending,stock,stale,loaded};
}
const api={sources,purchaseSnapshot,destinationKey,inspect,stable};root.FreaPurchaseLinks=api;if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);