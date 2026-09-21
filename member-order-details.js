(function(){
"use strict";
let dialog,body,controller,sequence=0,opener,previousOverflow;
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=(v,c)=>new Intl.NumberFormat("zh-TW",{style:"currency",currency:c||"TWD",maximumFractionDigits:2}).format(Number(v)||0);
const statuses={pending_payment:"待付款",payment_review:"對帳中",paid:"已收款",processing:"備貨中",shipped:"已出貨",completed:"已完成",cancelled:"已取消"};
function setup(){
 if(dialog)return;
 dialog=document.createElement("dialog");dialog.className="frea-order-dialog";dialog.setAttribute("aria-labelledby","frea-order-title");
 dialog.innerHTML='<header class="frea-order-dialog-head"><div><small>ORDER DETAILS</small><h2 id="frea-order-title">訂單明細</h2></div><button type="button" aria-label="關閉訂單明細" autofocus>×</button></header><div class="frea-order-dialog-body" aria-live="polite"></div>';
 document.body.appendChild(dialog);body=dialog.querySelector(".frea-order-dialog-body");
 dialog.querySelector("button").onclick=()=>dialog.close();
 dialog.addEventListener("click",e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener("close",()=>{sequence++;controller?.abort();body.replaceChildren();document.body.style.overflow=previousOverflow;opener?.focus();});
}
async function open(client,id,userId,trigger,kind){
 setup();const token=++sequence;controller?.abort();controller=new AbortController();opener=trigger;
 if(!dialog.open){previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";dialog.showModal();}
 body.innerHTML="<p>正在讀取訂單明細…</p>";
 let timer;
 try{
 const result=await Promise.race([
 (kind==="personal" ? client.from("personal_shopping_requests").select("id,request_number,status,quote_amount,quote_currency,service_direction,created_at,items,quote_details,delivery_address,customer_name,phone,note") : client.from("orders").select("id,order_number,status,total_amount,currency,created_at,recipient_name,recipient_phone,postal_code,shipping_address,tracking_number,order_items(product_name,specification,quantity,unit_price,line_total)")).eq("id",id).eq("user_id",userId).abortSignal(controller.signal).maybeSingle(),
 new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("timeout"));},15000);})
 ]);
 if(token!==sequence||!dialog.open)return;
 if(result.error||!result.data)throw new Error("unavailable");
 if(kind==="personal"){body.innerHTML=renderPersonal(result.data);return;}
 const o=result.data,c=o.currency||"TWD",items=o.order_items||[],sum=items.reduce((v,i)=>v+Number(i.line_total||0),0);
 const rows=items.map(i=>'<tr><td><strong>'+esc(i.product_name)+'</strong><small>'+esc(i.specification||"")+'</small></td><td>'+esc(i.quantity)+'</td><td>'+esc(money(i.unit_price,c))+'</td><td>'+esc(money(i.line_total,c))+'</td></tr>').join("");
 const delta=Math.round((Number(o.total_amount)-sum)*100)/100;
 body.innerHTML='<div class="frea-order-dialog-meta"><strong>'+esc(o.order_number)+'</strong><p>'+esc(new Intl.DateTimeFormat("zh-TW",{dateStyle:"medium"}).format(new Date(o.created_at)))+' · '+esc(statuses[o.status]||o.status)+'</p></div>'+
 '<div class="frea-order-table-wrap"><table><caption>訂購商品與費用明細</caption><thead><tr><th>商品／費用項目</th><th>數量</th><th>單價</th><th>小計</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="4">此訂單尚無可顯示的商品明細。</td></tr>')+'</tbody></table></div>'+
 '<div class="frea-order-totals">'+(items.length?'<p><span>明細合計（含已列費用）</span><span>'+esc(money(sum,c))+'</span></p>'+ (delta?'<p><span>訂單金額差額</span><span>'+esc(money(delta,c))+'</span></p>':''):'')+'<p><strong>訂單總額</strong><strong>'+esc(money(o.total_amount,c))+'</strong></p></div>'+
 '<section class="frea-order-recipient"><h3>收件資訊</h3><p>'+esc(o.recipient_name||"未提供")+'<br>'+esc(o.recipient_phone||"")+'<br>'+esc([o.postal_code,o.shipping_address].filter(Boolean).join(" "))+'</p>'+ (o.tracking_number?'<p>出貨單號：'+esc(o.tracking_number)+'</p>':'')+'</section>';
 }catch(e){if(token===sequence&&dialog.open)body.innerHTML='<p>暫時無法讀取這筆訂單，請關閉後再試。</p>';}
 finally{clearTimeout(timer);}
}

function renderPersonal(o){
 const japan=o.service_direction==="tw_to_jp",c=japan?"JPY":"TWD",source=japan?"TWD":"JPY",q=o.quote_details||{},quoted=o.quote_amount!=null;
 const states={new:"新需求",reviewing:"確認中",quoted:"已報價",confirmed:"已確認購買",purchased:japan?"台灣已下單":"日本已下單",shipped:"已寄出",completed:"已完成",cancelled:"已取消"};
 const items=Array.isArray(o.items)?o.items:[],units=Array.isArray(q.unit_prices)?q.unit_prices:[];
 const valid=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v));
 const rows=items.map((i,n)=>{const priced=quoted&&valid(units[n]);return '<tr><td><strong>'+esc(i.name)+'</strong><small>'+esc(i.specification||i.spec||"")+'</small></td><td>'+esc(i.quantity)+'</td><td>'+esc(priced?money(units[n],source):"待報價")+'</td><td>'+esc(priced?money(Number(units[n])*Number(i.quantity||1),source):"待報價")+'</td></tr>';}).join("");
 const fee=(label,key,currency)=>valid(q[key])?'<p><span>'+esc(label)+'</span><span>'+esc(money(q[key],currency))+'</span></p>':"";
 const addr=o.delivery_address||{};
 return '<div class="frea-order-dialog-meta"><strong>'+esc(o.request_number)+'</strong><p>'+esc(new Intl.DateTimeFormat("zh-TW",{dateStyle:"medium"}).format(new Date(o.created_at)))+' · '+esc(states[o.status]||o.status)+'</p><p>自選代購 · '+(japan?"台灣商品 → 寄送日本":"日本商品 → 寄送台灣")+'</p></div>'+
 '<div class="frea-order-table-wrap"><table><caption>代購商品明細（'+source+'）</caption><thead><tr><th>商品／規格</th><th>數量</th><th>單價</th><th>小計</th></tr></thead><tbody>'+(rows||'<tr><td colspan="4">尚無商品明細。</td></tr>')+'</tbody></table></div>'+
 '<div class="frea-order-totals">'+(quoted?fee(japan?"台灣國內運費":"日本國內運費",japan?"domestic_shipping_twd":"domestic_shipping_jpy",source)+(valid(q.exchange_rate)?'<p><span>匯率（'+source+' → '+c+'）</span><span>'+esc(q.exchange_rate)+'</span></p>':"")+fee("關稅及手續費",japan?"duties_and_fees_jpy":"duties_and_fees_twd",c)+fee("國際運費",japan?"international_shipping_jpy":"international_shipping_twd",c)+fee(japan?"日本國內運費":"台灣國內運費",japan?"japan_shipping_jpy":"taiwan_shipping_twd",c)+fee("其他",japan?"other_fees_jpy":"other_fees_twd",c):"")+
 '<p><strong>報價總額</strong><strong>'+esc(quoted?money(o.quote_amount,o.quote_currency||c):"尚未報價")+'</strong></p></div>'+
 '<section class="frea-order-recipient"><h3>收件資訊</h3><p>'+esc(addr.recipient||o.customer_name||"未提供")+'<br>'+esc(o.phone||"")+'<br>'+esc([addr.postal_code,addr.region,addr.city,addr.address_line].filter(Boolean).join(" ")||"尚未提供收件地址")+'</p></section>'+
 (o.note?'<section class="frea-order-recipient"><h3>您的備註</h3><p>'+esc(o.note)+'</p></section>':"");
}

window.freaOrderDetails={open,close:()=>{if(dialog?.open)dialog.close();}};
})();