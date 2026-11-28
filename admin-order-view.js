(function(root){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function mappings(order,purchases,relations){
 const byItem=new Map(),all=new Set(),assignedByItem=new Map();if(!relations?.ready())return {byItem,all,assignedByItem,ready:false};
 for(const p of (purchases||[]).filter(p=>p.status!=="cancelled"))for(const l of relations.summary(p).lines)for(const a of l.links){
  if(a.destination.type!=="order"||String(a.destination.parentId)!==String(order.id))continue;
  all.add(p.order_number);const id=String(a.destination.key);if(!byItem.has(id))byItem.set(id,new Set());byItem.get(id).add(p.order_number);assignedByItem.set(id,(assignedByItem.get(id)||0)+Number(a.order_quantity||0));
 }
 return {byItem,all,assignedByItem,ready:true};
}
const codes=(values,fallback)=>values.size?[...values].sort((a,b)=>a.localeCompare(b,"en",{numeric:true})).map(v=>'<span class="order-receipt-code">'+esc(v)+'</span>').join(""):'<span class="order-muted">'+fallback+'</span>';

function editRow(i={},fresh=false){
 const kind=i.item_type||"expense",locked=!fresh&&kind==="product";
 return '<tr data-order-edit-line'+(fresh?' data-new-order-line':"")+'><td><select data-order-item-type aria-label="明細類型"><option value="product"'+(kind==="product"?" selected":"")+'>商品</option><option value="expense"'+(kind==="expense"?" selected":"")+'>費用</option></select></td>'+
 '<td><input data-order-item-name aria-label="明細名稱" maxlength="500" required value="'+esc(i.product_name||"")+'"'+(locked?" readonly":"")+'></td>'+
 '<td><input data-order-item-spec aria-label="規格或費用說明" maxlength="500" value="'+esc(i.specification||"")+'"'+(locked?" readonly":"")+'></td>'+
 '<td><input data-order-quantity'+(i.id!=null?' data-item-id="'+esc(i.id)+'"':"")+' aria-label="數量" type="number" min="1" max="99999" step="1" required value="'+esc(i.quantity??1)+'"></td>'+
 '<td><input data-order-item-price aria-label="單價" type="number" min="0" max="999999999" step="1" required value="'+esc(i.unit_price??0)+'"'+(locked?" readonly":"")+'></td>'+
 '<td>'+(fresh?'<button type="button" data-remove-order-line>移除</button>':"")+'</td></tr>';
}
function syncLine(line){const locked=!line.hasAttribute("data-new-order-line")&&line.querySelector("[data-order-item-type]").value==="product";for(const el of line.querySelectorAll("[data-order-item-name],[data-order-item-spec],[data-order-item-price]"))el.readOnly=locked;}

function card(o,ctx){
 const member=ctx.profiles.find(p=>p.id===o.user_id),items=o.order_items||[],m=mappings(o,ctx.purchaseOrders,ctx.relations),money=v=>esc(ctx.money(v,o.currency)),day=ctx.day(o.created_at),status=ctx.labels[o.status]||o.status;
 const nonStock=i=>i.item_type==="expense"||ctx.inventory?.bindings?.some(b=>b.source_type==="order"&&b.source_key===String(i.id)&&b.purpose!=="sale"&&root.FreaPurchaseLinks?.stable(b.source_snapshot)===root.FreaPurchaseLinks?.stable({name:i.product_name,specification:i.specification,quantity:i.quantity}));
 const pending=i=>!nonStock(i)&&(m.assignedByItem.get(String(i.id))||0)+0.000001<Number(i.quantity);
 const pendingLabel='<span class="order-muted">待對應</span>';
 const summaryCodes=codes(m.all,m.ready?(items.length&&items.every(nonStock)?(items.every(i=>i.item_type==="expense")?"費用（不計庫存）":"試喝／公司用途"):"待對應"):"載入中")+(m.ready&&m.all.size&&items.some(pending)?pendingLabel:"");
 const itemCode=i=>{if(i.item_type==="expense")return "—";const b=ctx.inventory?.bindings?.find(b=>b.source_type==="order"&&b.source_key===String(i.id));if(!b||root.FreaPurchaseLinks?.stable(b.source_snapshot)!==root.FreaPurchaseLinks?.stable({name:i.product_name,specification:i.specification,quantity:i.quantity}))return "—";const sku=ctx.inventory.skus.find(s=>s.id===b.sku_id);return ctx.masters?.find(m=>m.id===sku?.product_master_id)?.product_code||"—";};
 const detail=items.map(i=>'<tr><td>'+(i.item_type==="expense"?"費用":"商品")+'</td><td>'+esc(itemCode(i))+'</td><td>'+esc(i.product_name)+'</td><td>'+esc(i.specification||"—")+'</td><td>'+esc(i.quantity)+'</td><td>'+money(i.unit_price)+'</td><td>'+money(i.line_total)+'</td><td>'+(i.item_type==="expense"?'<span class="order-muted">費用（不計庫存）</span>':codes(m.byItem.get(String(i.id))||new Set(),m.ready?(nonStock(i)?"試喝／公司用途":"待對應") : "載入中")+(m.ready&&m.byItem.get(String(i.id))?.size&&pending(i)?pendingLabel:""))+'</td></tr>').join("");
 const quantities=items.map(i=>editRow({...i,item_type:i.item_type||"product"})).join("");
 return '<tbody class="admin-order compact-order" data-order-id="'+esc(o.id)+'" data-original-status="'+esc(o.status)+'"><tr class="order-summary-row"><td><strong class="order-full-number">'+esc(o.order_number)+'</strong></td><td>'+esc(day)+'</td><td>'+esc(member?.full_name||o.recipient_name||"未填姓名")+'</td><td>'+esc(status)+'</td><td class="order-money">'+money(o.total_amount)+'</td><td>'+summaryCodes+'</td><td><div class="order-row-actions"><button type="button" data-order-detail aria-expanded="false">明細</button><button type="button" data-order-edit aria-expanded="false">編輯</button></div></td></tr>'+
 '<tr data-order-expanded hidden><td colspan="7"><section data-order-read hidden><table class="order-item-table"><colgroup><col style="width:65px"><col style="width:105px"><col style="width:25%"><col><col style="width:60px"><col style="width:100px"><col style="width:110px"><col style="width:150px"></colgroup><thead><tr><th>類型</th><th>商品編號</th><th>商品</th><th>規格</th><th>數量</th><th>單價</th><th>小計</th><th>對應進貨單</th></tr></thead><tbody>'+detail+'</tbody></table>'+
 '<div class="order-read-sections"><details><summary>收件資料</summary><p>'+esc(o.recipient_name)+' ｜ '+esc(o.recipient_phone)+'</p><p>'+esc(o.postal_code)+' '+esc(o.shipping_address)+'</p>'+(o.tracking_number?'<p>出貨單號：'+esc(o.tracking_number)+'</p>':"")+'</details><details><summary>付款憑證</summary><p>'+esc(o.payment_proof_name||"未上傳")+'</p>'+(o.payment_proof_path?'<button type="button" data-view-payment-proof>查看匯款證明</button>':"")+'</details><details><summary>後台備註</summary><p>'+esc(o.admin_note||"無")+'</p></details></div></section>'+
 '<section data-order-editor hidden><h3>編輯訂單</h3><table class="order-item-table order-edit-items"><colgroup><col style="width:90px"><col style="width:25%"><col><col style="width:80px"><col style="width:100px"><col style="width:60px"></colgroup><thead><tr><th>類型</th><th>名稱</th><th>規格／說明</th><th>數量</th><th>單價</th><th></th></tr></thead><tbody>'+quantities+'</tbody></table><button type="button" data-add-order-line>＋新增明細</button><p class="order-muted">運費或作業費請選「費用」；金額計入訂單，不計庫存。</p>'+
 '<div class="order-recipient-editor"><label>本次收件人<input data-recipient-name maxlength="100" required value="'+esc(o.recipient_name||"")+'"></label><label>聯絡電話<input data-recipient-phone type="tel" maxlength="40" required value="'+esc(o.recipient_phone||"")+'"></label><label>郵遞區號<input data-recipient-postal maxlength="20" value="'+esc(o.postal_code||"")+'"></label><label class="order-recipient-address">完整收件地址<textarea data-recipient-address rows="2" maxlength="500" required>'+esc(o.shipping_address||"")+'</textarea></label></div>'+
 '<div class="order-edit-meta"><label>訂單狀態<select data-order-status>'+ctx.statusOptions(o.status)+'</select></label><label>下單日期（台灣時間）<input type="date" data-order-date min="2000-01-01" max="2099-12-31" required value="'+esc(day)+'"></label><label data-tracking-wrap'+(o.status==="shipped"?"":" hidden")+'>出貨單號<input data-tracking-number value="'+esc(o.tracking_number||"")+'" '+(o.status==="shipped"?"required":"")+'></label></div>'+
 '<label class="order-edit-note">後台備註<textarea data-order-note rows="2">'+esc(o.admin_note||"")+'</textarea></label><details class="order-edit-payment"><summary>付款憑證與上傳</summary><p>匯款證明：'+esc(o.payment_proof_name||"未上傳")+'</p>'+(o.payment_proof_path?'<button type="button" data-view-payment-proof>查看匯款證明</button>':"")+'</details>'+
 '<div class="order-edit-actions"><button class="admin-save" type="button" data-save-order>儲存</button><button type="button" data-order-cancel>取消</button><button class="danger" type="button" data-delete-order>刪除訂單</button></div></section></td></tr></tbody>';
}
function render(orders,ctx){return '<div class="order-table-scroll"><table class="order-list-table"><colgroup><col style="width:21%"><col style="width:10%"><col style="width:15%"><col style="width:9%"><col style="width:12%"><col style="width:21%"><col style="width:12%"></colgroup><thead><tr><th>訂單號碼</th><th>日期</th><th>會員／客戶</th><th>狀態</th><th class="order-money">金額</th><th>對應進貨單</th><th>操作</th></tr></thead>'+orders.map(o=>card(o,ctx)).join("")+'</table></div>';}
function toggle(card,kind){
 const section=card.querySelector(kind==="detail"?"[data-order-read]":"[data-order-editor]"),button=card.querySelector(kind==="detail"?"[data-order-detail]":"[data-order-edit]");
 section.hidden=!section.hidden;button.setAttribute("aria-expanded",String(!section.hidden));
 card.querySelector("[data-order-expanded]").hidden=card.querySelector("[data-order-read]").hidden&&card.querySelector("[data-order-editor]").hidden;
}
function cancel(card){
 const editor=card.querySelector("[data-order-editor]");
 for(const row of editor.querySelectorAll("[data-new-order-line]"))row.remove();
 for(const el of editor.querySelectorAll("input,textarea,select")){if(el.tagName==="SELECT")el.value=[...el.options].find(o=>o.defaultSelected)?.value||el.options[0]?.value||"";else el.value=el.type==="file"?"":el.defaultValue;}
 for(const row of editor.querySelectorAll("[data-order-edit-line]"))syncLine(row);
 const shipped=card.dataset.originalStatus==="shipped";card.querySelector("[data-tracking-wrap]").hidden=!shipped;card.querySelector("[data-tracking-number]").required=shipped;
 editor.hidden=true;card.querySelector("[data-order-edit]").setAttribute("aria-expanded","false");card.querySelector("[data-order-expanded]").hidden=card.querySelector("[data-order-read]").hidden;
}
root.FreaOrderView={render,toggle,cancel,mappings,editRow,syncLine};if(typeof module!=="undefined")module.exports=root.FreaOrderView;
})(typeof window!=="undefined"?window:globalThis);