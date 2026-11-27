(function(root){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const codes=(s,ready)=>s.size?[...s].sort((a,b)=>a.localeCompare(b,"en",{numeric:true})).map(n=>'<span class="order-receipt-code">'+esc(n)+'</span>').join(""):'<span class="order-muted">'+(ready?"待對應":"載入中")+'</span>';
function mapping(r,ctx){const all=new Set(),lines=new Map(),ready=ctx.relations?.ready();if(ready)for(const p of ctx.purchaseOrders||[])for(const l of ctx.relations.summary(p).lines)for(const a of l.links){const d=a.destination;if(d.type!=="personal"||String(d.parentId)!==String(r.id))continue;all.add(p.order_number);if(!lines.has(d.index))lines.set(d.index,new Set());lines.get(d.index).add(p.order_number);}return {all,lines,ready};}
function readMarkup(r,ctx,m){
 const q=r.quote_details||{},items=Array.isArray(r.items)?r.items:[],j=r.service_direction==="tw_to_jp",source=j?"TWD":"JPY",currency=j?"JPY":"TWD",a=r.delivery_address||{};
 const prices=q.unit_prices||[];
 const rows=items.map((i,n)=>{const c=q.unit_currencies?.[n]||source,url=ctx.safeUrl(i.url),price=prices[n],priced=price!==null&&price!==undefined&&price!=="";
 return '<tr><td>'+esc(i.name||"未填商品名稱")+(url?'<a class="personal-product-link" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">商品連結</a>':"")+'</td><td>'+esc(i.specification||"—")+'</td><td>'+esc(i.quantity||1)+'</td><td>'+esc(priced?ctx.money(price,c):"未報價")+'</td><td>'+esc(priced?ctx.money(Number(price)*Number(i.quantity||1),c):"未報價")+'</td><td>'+codes(m.lines.get(n)||new Set(),m.ready)+'</td></tr>';}).join("");
 const fees=[[j?"台灣國內運費":"日本國內運費",q[j?"domestic_shipping_twd":"domestic_shipping_jpy"],source],["關稅及手續費",q[j?"duties_and_fees_jpy":"duties_and_fees_twd"],currency],["國際運費",q[j?"international_shipping_jpy":"international_shipping_twd"],currency],[j?"日本國內運費":"台灣國內運費",q[j?"japan_shipping_jpy":"taiwan_shipping_twd"],currency],["其他",q[j?"other_fees_jpy":"other_fees_twd"],currency],[q.deduction_label||"減項",q.deduction_amount? -q.deduction_amount:0,q.deduction_currency||currency]];
 return '<table class="personal-read-table"><colgroup><col style="width:28%"><col><col style="width:60px"><col style="width:115px"><col style="width:115px"><col style="width:150px"></colgroup><thead><tr><th>商品</th><th>規格</th><th>數量</th><th>單價／幣別</th><th>小計</th><th>對應進貨單</th></tr></thead><tbody>'+rows+'</tbody></table>'+
 '<div class="order-read-sections"><details><summary>顧客與收件資料</summary><p>'+esc(r.customer_name)+' ｜ '+esc(r.email)+' ｜ '+esc(r.phone)+'</p><p>LINE ID：'+esc(r.line_id||"—")+'</p><p>'+esc([a.recipient,a.recipient_phone,a.postal_code,a.region,a.city,a.address_line].filter(Boolean).join(" "))+'</p><p>聯絡語言：'+(r.contact_language==="ja"?"日本語":"繁體中文")+'</p></details>'+
 '<details><summary>顧客備註</summary><p>'+esc(r.note||"無")+'</p></details><details><summary>報價與運費</summary><p>匯率：'+esc(q.exchange_rate??"未設定")+'（'+source+' → '+currency+'）</p>'+fees.filter(f=>Number(f[1])).map(f=>'<p>'+esc(f[0])+'：'+esc(ctx.money(f[1],f[2]))+'</p>').join("")+'</details><details><summary>後台備註</summary><p>'+esc(r.admin_note||"無")+'</p></details></div>';
}
function compact(target,requests,ctx){
 const originals=[...target.querySelectorAll("[data-personal-id]")],wrap=document.createElement("div");wrap.className="order-table-scroll";
 wrap.innerHTML='<table class="order-list-table personal-list-table"><colgroup><col style="width:23%"><col style="width:9%"><col style="width:12%"><col style="width:10%"><col style="width:8%"><col style="width:10%"><col style="width:18%"><col style="width:10%"></colgroup><thead><tr><th>代購訂單號碼</th><th>日期</th><th>客戶</th><th>代購方向</th><th>狀態</th><th class="order-money">金額</th><th>對應進貨單</th><th>操作</th></tr></thead></table>';
 const table=wrap.firstElementChild;
 for(const old of originals){
  const r=requests.find(r=>String(r.id)===old.dataset.personalId);if(!r)continue;
  const j=r.service_direction==="tw_to_jp",currency=j?"JPY":"TWD",m=mapping(r,ctx),body=document.createElement("tbody");body.className="admin-order compact-order compact-personal";body.dataset.personalId=r.id;body.dataset.serviceDirection=j?"tw_to_jp":"jp_to_tw";
  body.innerHTML='<tr class="order-summary-row"><td><strong class="order-full-number">'+esc(r.request_number)+'</strong></td><td>'+esc(ctx.day(r.created_at))+'</td><td>'+esc(r.customer_name||"未填姓名")+'</td><td>'+(j?"台灣 → 日本":"日本 → 台灣")+'</td><td>'+esc(j&&r.status==="purchased"?"台灣已下單":ctx.labels[r.status]||r.status)+'</td><td class="order-money">'+esc(r.quote_amount==null?"尚未報價":ctx.money(r.quote_amount,currency))+'</td><td>'+codes(m.all,m.ready)+'</td><td><div class="order-row-actions"><button type="button" data-personal-detail aria-expanded="false">明細</button><button type="button" data-personal-edit aria-expanded="false">編輯</button></div></td></tr><tr data-personal-expanded hidden><td colspan="8"><section data-personal-read hidden>'+readMarkup(r,ctx,m)+'</section><section data-personal-editor hidden><div class="personal-editor-heading"><h3>報價試算／編輯</h3></div></section></td></tr>';
  const editor=body.querySelector("[data-personal-editor]"),display=old.querySelector("[data-quote-display]");
  if(display)editor.querySelector(".personal-editor-heading").appendChild(display);
  editor.appendChild(old.querySelector(".personal-quote-sheet"));const controls=old.querySelector(".personal-order-controls");editor.appendChild(controls);
  const cancel=document.createElement("button");cancel.type="button";cancel.dataset.personalCancel="";cancel.textContent="取消";controls.appendChild(cancel);
  body.personalEditorSnapshot=editor.innerHTML;table.appendChild(body);
 }
 target.replaceChildren(wrap);
}
function toggle(card,edit){
 const panel=card.querySelector(edit?"[data-personal-editor]":"[data-personal-read]"),button=card.querySelector(edit?"[data-personal-edit]":"[data-personal-detail]");
 panel.hidden=!panel.hidden;button.setAttribute("aria-expanded",String(!panel.hidden));card.querySelector("[data-personal-expanded]").hidden=card.querySelector("[data-personal-read]").hidden&&card.querySelector("[data-personal-editor]").hidden;
}
function cancel(card){const e=card.querySelector("[data-personal-editor]");e.innerHTML=card.personalEditorSnapshot;e.hidden=true;card.querySelector("[data-personal-edit]").setAttribute("aria-expanded","false");card.querySelector("[data-personal-expanded]").hidden=card.querySelector("[data-personal-read]").hidden;}
root.FreaPersonalView={compact,toggle,cancel,readMarkup,mapping};
})(typeof window!=="undefined"?window:globalThis);