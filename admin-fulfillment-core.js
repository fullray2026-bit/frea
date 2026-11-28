(function(root){
"use strict";
const EPS=1e-6,normalClosed=new Set(["cancelled","shipped","completed"]),personalActive=new Set(["confirmed","purchased","payment_received"]),wait=new Set(["pending_payment","payment_review"]);
const key=a=>a.order_item_id!=null?"order:"+a.order_item_id:"personal:"+a.personal_request_id+":"+a.personal_item_index;
function calculate(d){
 const I=root.FreaInventoryCore||require("./admin-inventory-core"),P=root.FreaPurchaseLinks||require("./admin-purchase-links-core");
 const sources=I.sources(d),sourceMap=new Map(sources.map(s=>[s.type+":"+s.key,s])),bindings=d.bindings||[],skuMap=new Map((d.skus||[]).map(s=>[s.id,s])),masters=new Map((d.masterProducts||[]).map(m=>[m.id,m]));
 const bmap=new Map(bindings.map(b=>[b.source_type+":"+b.source_key,b])),ledger=I.calculate(d,d.skus||[],bindings,d.adjustments||[]),stock=new Map(ledger.rows.map(r=>[r.id,r]));
 const valid=[],validIds=new Set();
 for(const po of d.purchaseOrders||[]){if(po.status==="cancelled")continue;for(const l of P.inspect(po,d,d.allocations||[],bindings).lines)for(const a of l.links){valid.push({...a,po});validIds.add(a.id);}}
 const stale=new Set((d.allocations||[]).filter(a=>!validIds.has(a.id)).map(key));
 const uncertainSkus=new Set(ledger.sources.filter(s=>!s.valid&&s.binding?.sku_id).map(s=>s.binding.sku_id));
 for(const s of ledger.sources.filter(s=>!s.valid&&s.type==="purchase"&&s.master))for(const sku of d.skus||[])if(sku.product_master_id===s.master)uncertainSkus.add(sku.id);
 const all=[];
 for(const s of sources){if(s.type==="purchase"||s.status==="cancelled")continue;
  const dest=s.type+":"+s.key,b=bmap.get(dest),bindingValid=!!b&&I.stable(b.source_snapshot)===I.stable(s.snapshot);
  if(s.itemType==="expense"||bindingValid&&b.purpose!=="sale")continue;
  const sku=bindingValid&&b.purpose==="sale"?skuMap.get(b.sku_id):null,factor=sku?Number(b.quantity_factor):1;
  const closed=s.shipped||normalClosed.has(s.status),inquiry=s.type==="personal"&&!closed&&!personalActive.has(s.status);
  const parent=s.type==="order"?(d.orders||[]).find(o=>String(o.id)===String(s.key?.split(":")[0])||(o.order_items||[]).some(i=>String(i.id)===s.key)):(d.personalRequests||[]).find(o=>String(o.id)===s.key.split(":")[0]);
  const m=masters.get(sku?.product_master_id);
  all.push({key:dest,type:s.type,number:s.number,date:s.date?.slice(0,10)||"",status:s.status,name:m?.name||s.name,spec:sku?.specification||s.spec||"規格待確認",code:m?.product_code||(sku?.personal_request_id!=null?"單次代購":"待確認"),skuId:sku?.id||null,factor:Number.isFinite(factor)&&factor>0?factor:1,quantity:s.quantity,closed,inquiry,unpaid:s.type==="order"&&wait.has(s.status),assigned:0,assignedReceived:0,assignedPending:0,ready:0,incoming:0,stockSuggested:0,shortage:0,review:stale.has(dest)||sku&&uncertainSkus.has(sku.id)||!!b&&!bindingValid,receipts:[],parentId:parent?.id});
 }
 const map=new Map(all.map(l=>[l.key,l])),priority=l=>l.closed?0:l.unpaid?2:l.inquiry?3:1;
 const compare=(a,b)=>priority(a)-priority(b)||a.date.localeCompare(b.date)||a.key.localeCompare(b.key);
 const purchaseItems=new Map((d.purchaseOrders||[]).flatMap(p=>(p.purchase_order_items||[]).map(i=>[i.id,{i,p}])));
 const receiptPools=new Map();
 valid.sort((a,b)=>compare(map.get(key(a))||{closed:true,date:"",key:""},map.get(key(b))||{closed:true,date:"",key:""}));
 for(const a of valid){
  const l=map.get(key(a)),source=purchaseItems.get(a.purchase_item_id);if(!l||l.inquiry||!source)continue;
  if(!receiptPools.has(a.purchase_item_id)){const b=bmap.get("purchase:"+a.purchase_item_id),received=Math.min(Number(source.i.quantity),Math.max(0,Number(source.i.received_quantity??b?.received_quantity??0)));receiptPools.set(a.purchase_item_id,received);}
  const received=Math.min(Number(a.quantity),receiptPools.get(a.purchase_item_id)),q=Number(a.order_quantity);
  receiptPools.set(a.purchase_item_id,receiptPools.get(a.purchase_item_id)-received);
  l.assigned+=q;l.assignedReceived+=received*q/Number(a.quantity);l.receipts.push(source.p.order_number);
 }
 const lines=all.filter(l=>!l.closed&&!l.inquiry).sort(compare),pools=new Map(ledger.rows.map(r=>[r.id,{ready:Math.max(0,r.onhand),incoming:Math.max(0,r.pending+Math.min(0,r.onhand))}]));
 for(const l of lines){
  l.assignedPending=Math.max(0,l.assigned-l.assignedReceived);
  const p=pools.get(l.skuId);
  if(l.skuId&&p){l.ready=Math.min(l.quantity,l.assignedReceived,p.ready/l.factor);p.ready=Math.max(0,p.ready-l.ready*l.factor);if(l.ready+EPS<Math.min(l.quantity,l.assignedReceived)||stock.get(l.skuId).onhand< -EPS)l.review=true;}
  else{l.ready=Math.min(l.quantity,l.assignedReceived);l.incoming=Math.min(Math.max(0,l.quantity-l.ready),l.assignedPending);if(l.assigned+EPS<l.quantity)l.review=true;}
 }
 for(const l of lines){const p=pools.get(l.skuId);if(!p||l.review)continue;const q=Math.min(Math.max(0,l.quantity-l.ready),p.ready/l.factor);l.ready+=q;l.stockSuggested=q;p.ready=Math.max(0,p.ready-q*l.factor);}
 for(const l of lines){const p=pools.get(l.skuId);if(!p)continue;const q=Math.min(Math.max(0,l.quantity-l.ready),l.assignedPending,p.incoming/l.factor);l.incoming=q;p.incoming=Math.max(0,p.incoming-q*l.factor);}
 for(const l of lines){
  const p=pools.get(l.skuId);if(p&&!l.review){const q=Math.min(Math.max(0,l.quantity-l.ready-l.incoming),p.incoming/l.factor);l.incoming+=q;p.incoming=Math.max(0,p.incoming-q*l.factor);}
  l.shortage=Math.max(0,l.quantity-l.ready-l.incoming);
  l.unassigned=Math.max(0,l.quantity-l.assigned);
  l.state=l.review?"規格／進貨對應待核對":l.unpaid?(l.status==="payment_review"?"待核款，保留量另列":"待匯款，保留量另列"):l.ready+EPS>=l.quantity?(l.stockSuggested>EPS||l.assigned+EPS<l.quantity?"可配現貨，請確認進貨對應":l.type==="personal"?"已備妥，待確認出貨":"已備妥，可安排出貨"):l.incoming>EPS?(l.shortage>EPS?"部分待到貨，仍有缺額":"已購待到貨，勿重複採買"):"尚缺商品";
  if(l.unassigned>EPS)l.state="進貨待對應；"+l.state;
  l.buy=l.review?null:l.unpaid?0:l.shortage;
 }
 const groups=new Map();
 for(const l of lines){const k=l.skuId||l.key;if(!groups.has(k))groups.set(k,{key:k,skuId:l.skuId,code:l.code,name:l.name,spec:l.spec,unit:skuMap.get(l.skuId)?.unit||"件",quantity:0,assigned:0,ready:0,incoming:0,unpaid:0,buy:0,unpaidGap:0,unassigned:0,review:false,lines:[]});const g=groups.get(k),f=l.factor;g.unassigned+=l.unassigned*f;g.quantity+=l.quantity*f;g.assigned+=l.assigned*f;g.ready+=l.ready*f;g.incoming+=l.incoming*f;g.unpaid+=l.unpaid?l.quantity*f:0;g.unpaidGap+=l.unpaid?l.shortage*f:0;g.buy+=Number(l.buy||0)*f;g.review=g.review||l.review;g.lines.push(l);}
 const result=[...groups.values()].sort((a,b)=>a.code.localeCompare(b.code,"en",{numeric:true})||a.spec.localeCompare(b.spec,"zh-TW"));
 for(const g of result)if(g.review)g.buy=null;
 return {lines,groups:result,all,unresolved:ledger.unresolved,stale:stale.size,inquiries:all.filter(l=>l.inquiry).length,ledger};
}
function demand(plan,{from="",to="",statuses=[]}={}){
 const groups=new Map();
 for(const l of plan.all){if(l.status==="cancelled"||from&&l.date<from||to&&l.date>to||statuses.length&&!statuses.includes(l.status))continue;const k=l.skuId||l.key;if(!groups.has(k))groups.set(k,{key:k,code:l.code,name:l.name,spec:l.spec,quantity:0,review:l.review||!l.skuId,lines:[]});const g=groups.get(k);g.quantity+=l.quantity*l.factor;g.lines.push(l);}
 return [...groups.values()].sort((a,b)=>a.code.localeCompare(b.code,"en",{numeric:true})||a.spec.localeCompare(b.spec,"zh-TW"));
}
const api={calculate,demand};root.FreaFulfillmentCore=api;if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);