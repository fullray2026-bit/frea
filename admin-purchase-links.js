(function(){
"use strict";
const C=window.FreaPurchaseLinks,esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let client,data={},handlers={},allocations=[],bindings=[],loaded=false,error="",pending=null,currentOrder=null,editing=null;
const $=id=>document.getElementById(id),num=x=>Number(x).toLocaleString("zh-TW",{maximumFractionDigits:6});
const binding=(type,key)=>bindings.find(b=>b.source_type===type&&b.source_key===String(key));
async function pages(table){let rows=[];for(let n=0;;n+=1000){const r=await client.from(table).select("*").order("id").range(n,n+999);if(r.error)throw r.error;rows.push(...r.data);if(r.data.length<1000)return rows;}}
function refresh(){
 if(pending)return pending;
 pending=(async()=>{try{[allocations,bindings]=await Promise.all([pages("purchase_order_allocations"),pages("inventory_bindings")]);loaded=true;error="";}catch(e){loaded=false;error=e.message;}finally{pending=null;handlers.onChange?.();}})();return pending;
}
function summary(order){return C.inspect(order,data,allocations,bindings,loaded);}
function link(d){return '<button type="button" class="receipt-order-link" data-open-linked-order="'+d.type+':'+d.parentId+'">'+esc(d.number)+'</button>';}
function cell(order){
 if(!loaded)return '<span class="receipt-link-muted">'+esc(error?"對應資料未載入":"載入中")+'</span>';
 const s=summary(order);
 const extra=(s.pending?'<small class="receipt-link-pending">待對應 '+s.pending+' 筆</small>':"")+(s.stale?'<small class="receipt-link-pending">待核對 '+s.stale+' 筆</small>':"");
 if(s.numbers.length)return '<div class="receipt-order-numbers">'+link(s.numbers[0])+(s.numbers.length>1?'<details class="receipt-more-orders"><summary>＋'+(s.numbers.length-1)+' 筆</summary><div>'+s.numbers.slice(1).map(link).join("")+'</div></details>':"")+'</div>'+extra+(s.stock?'<small class="receipt-link-muted">另有補庫存</small>':"");
 return (s.stock?'<span>補庫存</span>':s.pending||s.stale?"":'<span class="receipt-link-muted">試喝／費用</span>')+extra;
}
function lineText(item,order){
 const s=summary({...order,purchase_order_items:[item]});
 if(!loaded)return "載入中";
 return s.numbers.map(d=>d.number).join("；")+(s.stock?(s.numbers.length?"；另有補庫存":"補庫存"):"")+(s.pending?(s.numbers.length||s.stock?"；":"")+"待對應":"")+(s.stale?"；待核對":"")||"試喝／費用";
}
function selectedLine(){return (data.purchaseOrders||[]).find(o=>o.id===currentOrder)?.purchase_order_items.find(i=>i.id===$("purchaseLinkLine").value);}
function currentTarget(){return C.sources(data).get($("purchaseLinkTarget").value);}
function targetFor(a){return C.sources(data).get(C.destinationKey(a));}
function alertMessage(s,isError=false){$("purchaseLinkMessage").textContent=s;$("purchaseLinkMessage").className=isError?"error":"";}
function renderLine(){
 const i=selectedLine();if(!i)return;const o=(data.purchaseOrders||[]).find(o=>o.id===currentOrder),s=summary({...o,purchase_order_items:[i]}).lines[0];
 const key=$("purchaseLinkTarget").value,pb=binding("purchase",i.id),all=C.sources(data);
 $("purchaseLinkInfo").textContent=(i.personal_snapshot?.name||i.product_master?.name||"商品")+" ｜"+(i.receipt_specification??i.personal_snapshot?.specification??i.product_master?.specification??"規格待確認")+" ｜進貨 "+num(i.quantity)+"，尚未分配 "+num(s.remaining);
 $("purchaseLinkRows").innerHTML=allocations.filter(a=>a.purchase_item_id===i.id).map(a=>{
  const d=targetFor(a),valid=s.links.some(l=>l.id===a.id);
  return '<tr><td><span class="receipt-full-order">'+esc(d?.number||"來源已移除")+'</span><small>'+esc(d?.name||"")+'｜'+esc(d?.specification||"")+'</small></td><td>'+num(a.quantity)+'</td><td>'+num(a.order_quantity)+'</td><td>'+(valid?"已對應":"待核對")+'</td><td><button type="button" data-edit-allocation="'+a.id+'">編輯</button><button type="button" data-remove-allocation="'+a.id+'">移除</button></td></tr>';
 }).join("")||'<tr><td colspan="5">此商品尚未建立訂單對應。</td></tr>';
 const isPersonal=i.personal_request_id!=null||(data.masterProducts||[]).find(m=>m.id===i.product_master_id)?.catalog_type==="personal";
 $("purchaseLinkStock").disabled=isPersonal||!!s.expense||(s.remaining<0.00001&&i.allocation_purpose!=="stock");
 $("purchaseLinkStock").textContent=i.allocation_purpose==="stock"?"取消補庫存標記":"未分配部分標為補庫存";
 $("purchaseLinkTarget").innerHTML='<option value="">選擇訂單商品明細</option>'+[...all.values()].filter(d=>{
  if(d.status==="cancelled")return false;
  if(i.personal_request_id!=null&&(d.type!=="personal"||d.parentId!==i.personal_request_id||d.index!==i.personal_item_index))return false;
  const db=binding(d.type,d.key);return !(pb?.sku_id&&db?.sku_id&&pb.sku_id!==db.sku_id);
 }).sort((a,b)=>a.number.localeCompare(b.number)).map(d=>'<option value="'+esc(d.type+":"+d.key)+'">'+esc(d.number+"｜"+d.name+"｜"+d.specification)+'</option>').join("");
 if(all.has(key))$("purchaseLinkTarget").value=key;
 $("purchaseLinkSave").disabled=!!s.expense;
 if(s.expense)alertMessage("此行為試喝／費用，保留成本紀錄，不對應客戶商品。");
}
function defaults(){
 const i=selectedLine(),d=currentTarget();if(!i||!d)return;
 const used=allocations.filter(a=>a.id!==editing?.id);
 const pRemain=Math.max(0,Number(i.quantity)-used.filter(a=>a.purchase_item_id===i.id).reduce((n,a)=>n+Number(a.quantity),0));
 const oRemain=Math.max(0,d.quantity-used.filter(a=>C.destinationKey(a)===d.type+":"+d.key).reduce((n,a)=>n+Number(a.order_quantity),0));
 const pb=binding("purchase",i.id),db=binding(d.type,d.key);
 const ratio=pb?.sku_id&&pb.sku_id===db?.sku_id?Number(pb.quantity_factor)/Number(db.quantity_factor):1;
 const q=Math.min(pRemain,oRemain/ratio);
 $("purchaseLinkQuantity").value=Number(q.toFixed(6));$("purchaseLinkOrderQuantity").value=Number((q*ratio).toFixed(6));
 $("purchaseLinkTargetInfo").textContent=d.number+" ｜"+d.name+" ｜"+d.specification+" ｜訂購 "+num(d.quantity)+"，尚待對應 "+num(oRemain);
 $("purchaseLinkTarget").title=$("purchaseLinkTargetInfo").textContent;
}
async function open(po,item){
 if(!loaded){await refresh();if(!loaded){$("adminGlobalMessage").textContent=error||"訂單對應資料未載入，請重新整理";return;}}
 const o=(data.purchaseOrders||[]).find(o=>o.id===po);if(!o)return;
 currentOrder=po;editing=null;
 $("purchaseLinkTitle").textContent=o.order_number+"｜對應訂單";
 $("purchaseLinkForm").reset();$("purchaseLinkForm").dataset.id="";
 $("purchaseLinkLine").innerHTML=o.purchase_order_items.map(i=>'<option value="'+i.id+'">'+esc(i.personal_snapshot?.name||i.product_master?.name||"商品")+' × '+num(i.quantity)+'</option>').join("");
 if(item)$("purchaseLinkLine").value=item;
 renderLine();alertMessage("選擇訂單商品後，確認兩側規格與數量再儲存。");$("purchaseLinkDialog").showModal();
}
async function reload(){await handlers.refresh?.();await refresh();if($("purchaseLinkDialog").open){renderLine();defaults();}}
window.FreaPurchaseRelations={
 init(c){
  client=c;
  $("purchaseLinkClose").addEventListener("click",()=>$("purchaseLinkDialog").close());
  $("purchaseLinkLine").addEventListener("change",()=>{editing=null;$("purchaseLinkForm").dataset.id="";renderLine();defaults();});
  $("purchaseLinkTarget").addEventListener("change",defaults);
  $("purchaseLinkQuantity").addEventListener("input",()=>{
   const i=selectedLine(),d=currentTarget();if(!i||!d)return;
   const pb=binding("purchase",i.id),db=binding(d.type,d.key);
   if(pb?.sku_id&&pb.sku_id===db?.sku_id)$("purchaseLinkOrderQuantity").value=Number((Number($("purchaseLinkQuantity").value)*Number(pb.quantity_factor)/Number(db.quantity_factor)).toFixed(6));
  });
  $("purchaseRows").addEventListener("click",e=>{
   const target=e.target.closest("[data-open-linked-order]"),po=e.target.closest("[data-allocate-purchase]"),line=e.target.closest("[data-allocate-item]");
   if(target){const [type,id]=target.dataset.openLinkedOrder.split(":");handlers.openOrder?.(type,Number(id));}
   if(po)open(po.dataset.allocatePurchase);
   if(line){const o=(data.purchaseOrders||[]).find(o=>o.purchase_order_items.some(i=>i.id===line.dataset.allocateItem));if(o)open(o.id,line.dataset.allocateItem);}
  });
  $("purchaseLinkRows").addEventListener("click",async e=>{
   const edit=e.target.closest("[data-edit-allocation]"),remove=e.target.closest("[data-remove-allocation]");
   const a=allocations.find(a=>a.id===(edit?.dataset.editAllocation||remove?.dataset.removeAllocation));if(!a)return;
   if(edit){editing=a;$("purchaseLinkForm").dataset.id=a.id;$("purchaseLinkTarget").value=C.destinationKey(a);defaults();$("purchaseLinkQuantity").value=a.quantity;$("purchaseLinkOrderQuantity").value=a.order_quantity;alertMessage("編輯既有對應，儲存後保留修改紀錄。");}
   if(remove&&confirm("移除此商品的訂單對應？進貨及訂單數量不會改動。")){
    try{const r=await client.rpc("remove_purchase_allocation",{p_id:a.id,p_expected_updated_at:a.updated_at});if(r.error)throw r.error;editing=null;await reload();alertMessage("已移除對應。");}catch(e){alertMessage(e.message,true);}
   }
  });
  $("purchaseLinkStock").addEventListener("click",async()=>{
   const i=selectedLine();if(!i)return;const b=$("purchaseLinkStock");b.disabled=true;
   try{const r=await client.rpc("set_purchase_allocation_purpose",{p_item_id:i.id,p_value:i.allocation_purpose==="stock"?"review":"stock",p_expected_snapshot:C.purchaseSnapshot(i)});if(r.error)throw r.error;await reload();alertMessage("用途已儲存。");}catch(e){alertMessage(e.message,true);}finally{renderLine();}
  });
  $("purchaseLinkForm").addEventListener("submit",async e=>{
   e.preventDefault();const b=$("purchaseLinkSave");if(b.disabled)return;
   const i=selectedLine(),d=currentTarget();if(!i||!d)return alertMessage("請選擇進貨與訂單明細。",true);
   b.disabled=true;
   const value={id:($("purchaseLinkForm").dataset.id ||= crypto.randomUUID()),purchase_item_id:i.id,order_item_id:d.type==="order"?Number(d.key):null,personal_request_id:d.type==="personal"?d.parentId:null,personal_item_index:d.type==="personal"?d.index:null,quantity:Number($("purchaseLinkQuantity").value),order_quantity:Number($("purchaseLinkOrderQuantity").value),purchase_snapshot:C.purchaseSnapshot(i),order_snapshot:d.snapshot,note:"管理員逐項確認訂單對應"};
   try{const r=await client.rpc("save_purchase_allocation",{p_value:value,p_expected_updated_at:editing?.updated_at||null});if(r.error)throw r.error;editing=null;$("purchaseLinkForm").reset();$("purchaseLinkTargetInfo").textContent="";$("purchaseLinkForm").dataset.id="";await reload();alertMessage("對應已儲存。");}
   catch(e){alertMessage(e.message,true);}finally{b.disabled=false;}
  });
 },
 setData(d,h){data=d;handlers=h;loaded=false;return refresh();},
 ready(){return loaded;},
 cell,summary,lineText,open
};
})();