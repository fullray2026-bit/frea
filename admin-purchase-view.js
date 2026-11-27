(function(root){
"use strict";
function kind(item,masters=[]){if(item.personal_request_id!=null)return "personal";const m=masters.find(m=>m.id===item.product_master_id);return m?.catalog_type==="personal"?"personal":"regular";}
function filter(orders,masters,{from="",to="",type="",search="",getOrderText=()=>""}={}){
 if(from&&to&&from>to)return null;
 const term=search.trim().toLowerCase();
 return orders.filter(o=>(!from&&!to)||o.ordered_at&&(!from||o.ordered_at>=from)&&(!to||o.ordered_at<=to))
 .map(o=>({...o,purchase_order_items:(o.purchase_order_items||[]).filter(i=>(!type||kind(i,masters)===type)&&(!term||[o.order_number,o.suppliers?.name,i.personal_snapshot?.name,i.product_master?.name,masters.find(m=>m.id===i.product_master_id)?.name,i.personal_snapshot?.specification,getOrderText(i,o)].join(" ").toLowerCase().includes(term)))}))
 .filter(o=>o.purchase_order_items.length).sort((a,b)=>String(a.ordered_at||"9999").localeCompare(String(b.ordered_at||"9999"))||String(a.order_number).localeCompare(String(b.order_number)));
}
const amount=items=>items.reduce((n,i)=>n+Number(i.quantity)*Number(i.unit_cost),0);
const api={kind,filter,amount};root.FreaPurchaseView=api;if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);