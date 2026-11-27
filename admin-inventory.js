(function(){
"use strict";
const C=window.FreaInventoryCore;
let client,data={},skus=[],bindings=[],adjustments=[],history=[],result,loaded=false,busy=false,refreshParent;
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const num=v=>Number(v).toLocaleString("zh-TW",{maximumFractionDigits:3});
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo"}).format(new Date());
const msg=(s,error=false)=>{ $("inventoryMessage").hidden=!error;$("inventoryMessage").textContent=s;$("inventoryMessage").style.color=error?"#a22":""; };
async function pages(table){
 let all=[];for(let from=0;;from+=1000){const r=await client.from(table).select("*").order("id").range(from,from+999);if(r.error)throw r.error;all.push(...r.data);if(r.data.length<1000)return all;}
}
async function refresh(){
 if(busy)return;busy=true;msg("正在載入庫存對應…");
 try{[skus,bindings,adjustments,history]=await Promise.all(["inventory_skus","inventory_bindings","inventory_adjustments","inventory_history"].map(pages));loaded=true;render();msg("資料已載入。未確認到貨及未對應規格不會當作現貨。");}
 catch(e){loaded=false;$("inventorySummary").textContent="庫存資料未載入，無法計算。";msg(e.message,true);}
 finally{busy=false;}
}
function master(id){return (data.masterProducts||[]).find(m=>m.id===id);}
function skuText(s){if(!s)return "規格待確認";const m=master(s.product_master_id),p=(data.personalRequests||[]).find(p=>p.id===s.personal_request_id);return (m?.product_code||"單次代購")+" "+(m?.name||s.product_name||"")+" ｜"+s.specification+"（"+s.unit+"）"+(p?" ｜"+p.request_number:"");}
function render(){
 if(!loaded)return;
 result=C.calculate(data,skus,bindings,adjustments,{scope:"regular"});
 const term=$("inventorySearch").value.trim().toLowerCase(),filter=$("inventoryFilter").value;
 $("inventorySummary").textContent="常態規格 "+result.rows.length+" ｜待對應／來源變更 "+result.unresolved+" 筆 ｜試喝／費用 "+result.excluded+" 筆"+(result.orphaned.length?" ｜來源已刪除 "+result.orphaned.length+" 筆":"");
 $("inventoryWarning").hidden=!(result.unresolved||result.orphaned.length);$("inventoryWarning").textContent="尚有 "+result.unresolved+" 筆常態商品來源待對應"+(result.orphaned.length?"，另有 "+result.orphaned.length+" 筆來源異動待核對":"")+"，餘量尚未完整。";
 const rows=result.rows.filter(r=>(skuText(r)+" "+r.sources.map(s=>s.number).join(" ")).toLowerCase().includes(term)&&(!filter||filter==="shortage"&&r.shortage>0||filter==="surplus"&&r.balance>0||filter==="pending"&&r.pending>0));
 $("inventoryRows").innerHTML=rows.length?rows.map(r=>{
 const m=master(r.product_master_id);
 return '<tr><td>'+esc(m?.product_code||"待確認")+'</td><td><details><summary>'+esc(m?.name||r.product_name)+'</summary><p>已購買 '+num(r.purchased)+'｜已到貨 '+num(r.received)+'｜已出貨 '+num(r.shipped)+'｜待到貨 '+num(r.pending)+'</p>'+r.sources.map(s=>'<p>'+esc(s.number)+' ｜'+esc(s.date)+' ｜'+(s.type==="purchase"?"進貨":"訂單")+' '+num(s.stockQuantity)+'</p>').join("")+'</details></td><td>'+esc(r.specification)+'</td>'+["onhand","reserved","available","shortage"].map(k=>'<td class="'+(r[k]<0||k==="shortage"&&r[k]>0?"inventory-negative":"")+'">'+num(r[k])+'</td>').join("")+'</tr>';
 }).join(""):'<tr><td colspan="7">沒有符合的常態商品。</td></tr>';
 const sourceFilter=$("inventorySourceFilter").value;
 const src=result.sources.filter(s=>!s.cancelled&&(s.number+" "+s.name+" "+(s.spec||"")).toLowerCase().includes(term)&&(!sourceFilter||sourceFilter==="unmapped"&&!s.valid||sourceFilter===s.type));
 $("inventorySources").innerHTML=src.map(s=>'<article><strong>'+esc(s.number)+' ｜'+esc(s.date)+' ｜'+({purchase:"進貨",order:"一般訂單",personal:"代購訂單"}[s.type])+'</strong><p>'+esc(s.name)+' ｜'+esc(s.spec||"依主檔／待確認規格")+' × '+num(s.quantity)+'</p><p>'+(!s.valid?"待對應／來源已變更":s.binding.purpose!=="sale"?"已排除："+({sample:"試喝／公司用途",expense:"運費／包材／費用"}[s.binding.purpose]):esc(skuText(skus.find(k=>k.id===s.binding.sku_id)))+' ｜換算 '+num(s.binding.quantity_factor)+(s.type==="purchase"?' ｜已到貨 '+num(s.receivedQuantity??s.binding.received_quantity)+'／'+num(s.quantity):""))+'</p><button type="button" data-inventory-map="'+esc(s.type+":"+s.key)+'">'+(s.valid?"編輯對應／到貨":"設定規格對應")+'</button><details><summary>來源備註</summary><p>'+esc(s.notes)+'</p></details></article>').join("")||"<p>沒有符合條件的來源。</p>";
 $("inventoryAdjustmentSku").innerHTML='<option value="">選擇規格</option>'+result.rows.map(s=>'<option value="'+s.id+'">'+esc(skuText(s))+'</option>').join("");
 $("inventoryHistory").innerHTML=history.slice(-100).reverse().map(h=>'<tr><td>'+esc(new Date(h.created_at).toLocaleString("zh-TW",{timeZone:"Asia/Tokyo"}))+'</td><td>'+esc(({inventory_bindings:"對應／到貨",inventory_adjustments:"庫存調整",inventory_skus:"新增規格",purchase_orders:"購買收據正式登錄",purchase_order_items:"進貨明細／到貨"})[h.entity]||h.entity)+'</td><td><details><summary>查看變更</summary><pre>'+esc(JSON.stringify({之前:h.before_value,之後:h.after_value},null,2))+'</pre></details></td></tr>').join("");
}
function openMap(key){
 const s=result.sources.find(x=>x.type+":"+x.key===key);if(!s)return;
 const b=s.binding,form=$("inventoryMapForm");
 form.dataset.source=key;form.dataset.binding=b?.id||"";form.dataset.version=b?.updated_at||"";
 $("inventoryMapTitle").textContent=s.number+" ｜"+s.name+" ｜"+(s.spec||"")+" × "+s.quantity;
 const direct=false,personal=false;
 form.dataset.personalKey=direct?s.personalId+":"+s.personalIndex:s.type==="personal"?s.key:"";
 form.receiptExpected=s.type==="purchase"?{quantity:s.receivedQuantity??0,received_on:s.receivedOn??null}:null;
 form.personalSnapshot=direct?s.personalSnapshot:s.snapshot;
 const existing=skus.find(k=>k.id===b?.sku_id||k.id===s.directSku);
 const masters=(data.masterProducts||[]).filter(m=>m.catalog_type!=="personal"&&(s.type!=="purchase"||m.id===s.master||direct&&m.id===existing?.product_master_id));
 $("inventoryMapMaster").innerHTML=(personal?'<option value="__personal">單次代購原明細（不建立 FR 編號）</option>':"")+masters.map(m=>'<option value="'+m.id+'">'+esc(m.product_code+" "+m.name)+'</option>').join("");
 $("inventoryMapMaster").disabled=direct;
 $("inventoryMapSku").disabled=direct;
 $("inventoryNewSpec").readOnly=direct;
 if(existing)$("inventoryMapMaster").value=existing.product_master_id||"__personal";
 else if(personal)$("inventoryMapMaster").value="__personal";
 else if(s.master)$("inventoryMapMaster").value=s.master;
 else {const matches=masters.filter(m=>m.name===s.name);if(matches.length===1)$("inventoryMapMaster").value=matches[0].id;}
 updateSkuOptions(existing?.id);
 if(direct)$("inventoryNewSpec").readOnly=true;
 $("inventoryPurpose").value=b?.purpose||"sale";$("inventoryFactor").value=b?.quantity_factor||1;
 $("inventoryReceived").value=s.receivedQuantity??b?.received_quantity??0;$("inventoryReceived").max=s.quantity;
 $("inventoryReceiptFields").hidden=s.type!=="purchase";
 $("inventoryReceivedOn").value=s.receivedOn||b?.received_on||today();$("inventoryMapNote").value=b?.note||"";
 $("inventoryNewSpec").value=personal&&!existing?(s.spec||"標準規格"):"";$("inventoryMapError").textContent="";
 $("inventoryMapDialog").showModal();
}
function updateSkuOptions(selected){
 const form=$("inventoryMapForm"),personal=$("inventoryMapMaster").value==="__personal";
 const [id,index]=(form.dataset.personalKey||"").split(":").map(Number);
 const options=skus.filter(s=>personal?s.personal_request_id===id&&s.personal_item_index===index&&C.stable(s.personal_snapshot)===C.stable(form.personalSnapshot):s.product_master_id===$("inventoryMapMaster").value);
 $("inventoryMapSku").innerHTML='<option value="">選擇規格，或輸入新規格</option>'+options.map(s=>'<option value="'+s.id+'">'+esc(s.specification+"（"+s.unit+"）")+'</option>').join("");
 if(selected)$("inventoryMapSku").value=selected;
 const source=result?.sources.find(s=>s.type+":"+s.key===form.dataset.source);
 $("inventoryNewSpec").readOnly=personal;
 if(personal)$("inventoryNewSpec").value=options.length?"":source?.spec||"標準規格";
}
async function saveMap(e){
 e.preventDefault();const button=$("inventoryMapSave");if(button.disabled)return;button.disabled=true;
 try{
  const form=e.currentTarget,s=result.sources.find(x=>x.type+":"+x.key===form.dataset.source);
  if(!s)throw Error("來源已變更，請重新載入");
  let sku=$("inventoryMapSku").value||null,purpose=$("inventoryPurpose").value;
  const personal=$("inventoryMapMaster").value==="__personal",spec=$("inventoryNewSpec").value.trim();
  if(purpose==="sale"&&spec){
   const [id,index]=(form.dataset.personalKey||"").split(":").map(Number);
   const existing=skus.find(x=>personal?x.personal_request_id===id&&x.personal_item_index===index&&C.stable(x.personal_snapshot)===C.stable(form.personalSnapshot):x.product_master_id===$("inventoryMapMaster").value&&x.specification===spec);
   if(existing)sku=existing.id;
   else{
    const payload=personal?{personal_request_id:id,personal_item_index:index,personal_snapshot:form.personalSnapshot,product_name:s.name,specification:s.spec||"標準規格",unit:"件"}:{product_master_id:$("inventoryMapMaster").value,specification:spec,unit:$("inventoryNewUnit").value.trim()||"個"};
    const q=await client.from("inventory_skus").insert(payload).select().single();if(q.error)throw q.error;sku=q.data.id;
   }
  }
  if(purpose==="sale"&&!sku)throw Error("請選擇或新增明確規格；無款式商品可填『標準規格』。");
  const value={source_type:s.type,source_key:s.key,source_snapshot:s.snapshot,sku_id:purpose==="sale"?sku:null,purpose,
   quantity_factor:Number($("inventoryFactor").value),received_quantity:s.type==="purchase"?Number($("inventoryReceived").value):0,
   received_on:s.type==="purchase"&&Number($("inventoryReceived").value)>0?$("inventoryReceivedOn").value:null,note:$("inventoryMapNote").value.trim()};
  const q=await client.rpc("save_inventory_receipt_binding",{p_value:value,p_binding_id:form.dataset.binding||null,p_expected_updated_at:form.dataset.version||null,p_expected_receipt:form.receiptExpected});
  if(q.error)throw q.error;
  $("inventoryMapDialog").close();if(refreshParent)await refreshParent();await refresh();
 }catch(e){$("inventoryMapError").textContent=e.message;}
 finally{button.disabled=false;}
}
function exportCsv(){
 if(!result)return;
 const cell=x=>{let v=String(x??"");if(typeof x!=="number"&&/^[\s\uFEFF]*[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
 const content=[["商品／規格","已購買","已到貨","已出貨","在手","未出貨需求","可用","待到貨","尚缺採購","採購減需求"],...result.rows.map(r=>[skuText(r),r.purchased,r.received,r.shipped,r.onhand,r.reserved,r.available,r.pending,r.shortage,r.balance])].map(row=>row.map(cell).join(",")).join("\r\n");
 const url=URL.createObjectURL(new Blob(["\uFEFF"+content],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="庫存查詢-"+today()+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
window.FreaInventory={
 init(c){
  client=c;
  $("inventoryRefresh").addEventListener("click",async ()=>{try{if(refreshParent)await refreshParent();await refresh();}catch(e){msg(e.message,true);}});
  ["inventorySearch","inventoryFilter","inventorySourceFilter"].forEach(id=>$(id).addEventListener("input",render));
  $("inventorySources").addEventListener("click",e=>{const b=e.target.closest("[data-inventory-map]");if(b)openMap(b.dataset.inventoryMap);});
  $("inventoryMapMaster").addEventListener("change",()=>updateSkuOptions());
  $("inventoryMapForm").addEventListener("submit",saveMap);
  $("inventoryMapClose").addEventListener("click",()=>$("inventoryMapDialog").close());
  $("inventoryExport").addEventListener("click",exportCsv);
  $("inventoryAdjustmentDate").value=today();
  $("inventoryAdjustmentForm").addEventListener("submit",async e=>{
   e.preventDefault();const b=$("inventoryAdjustmentSave");if(b.disabled)return;b.disabled=true;
   try{const q=await client.from("inventory_adjustments").insert({id:($("inventoryAdjustmentForm").dataset.requestId ||= crypto.randomUUID()),sku_id:$("inventoryAdjustmentSku").value,quantity:Number($("inventoryAdjustmentQuantity").value),occurred_on:$("inventoryAdjustmentDate").value,reason:$("inventoryAdjustmentReason").value.trim()});if(q.error){if(q.error.code==="23505"){await refresh();throw Error("此調整已登記，請先核對操作紀錄，避免重複調整。");}throw q.error;}delete e.target.dataset.requestId;e.target.reset();$("inventoryAdjustmentDate").value=today();await refresh();}
   catch(e){msg(e.message,true);}finally{b.disabled=false;}
  });
 },
 editorData(){return {get skus(){return skus;},get bindings(){return bindings;}};},
 setData(d,reload){data=d;refreshParent=reload;if(loaded)render();return refresh();}
};
})();