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
async function open(client,id,userId,trigger){
 setup();const token=++sequence;controller?.abort();controller=new AbortController();opener=trigger;
 if(!dialog.open){previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";dialog.showModal();}
 body.innerHTML="<p>正在讀取訂單明細…</p>";
 let timer;
 try{
 const result=await Promise.race([
 client.from("orders").select("id,order_number,status,total_amount,currency,created_at,recipient_name,recipient_phone,postal_code,shipping_address,tracking_number,order_items(product_name,specification,quantity,unit_price,line_total)").eq("id",id).eq("user_id",userId).abortSignal(controller.signal).maybeSingle(),
 new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("timeout"));},15000);})
 ]);
 if(token!==sequence||!dialog.open)return;
 if(result.error||!result.data)throw new Error("unavailable");
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
window.freaOrderDetails={open,close:()=>{if(dialog?.open)dialog.close();}};
})();