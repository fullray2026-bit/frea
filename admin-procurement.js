(function(){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c])),num=n=>Number(n||0).toLocaleString("zh-TW",{maximumFractionDigits:4});
const labels={pending_payment:"待匯款",payment_review:"待核款",paid:"已收款",processing:"備貨中",new:"新需求（未確認）",reviewing:"確認中（未確認）",quoted:"已報價（未確認）",confirmed:"顧客已確認",purchased:"已購買",shipped:"已出貨",completed:"已完成",cancelled:"已取消"};
async function pages(client,table,columns){let rows=[];for(let start=0;;start+=1000){const r=await client.from(table).select(columns||"*").order("id").range(start,start+999);if(r.error)throw r.error;if(!Array.isArray(r.data))throw Error("資料未完整載入");rows.push(...r.data);if(r.data.length<1000)return rows;}}
async function load(client){
 const [orders,personalRequests,purchaseOrders,masterProducts,skus,bindings,adjustments,allocations]=await Promise.all([pages(client,"orders","id,order_number,created_at,status,order_items(id,product_name,specification,quantity,item_type)"),pages(client,"personal_shopping_requests","id,request_number,created_at,status,items"),pages(client,"purchase_orders","id,order_number,ordered_at,status,purchase_order_items(*)"),pages(client,"product_master","id,product_code,name,specification,catalog_type"),pages(client,"inventory_skus"),pages(client,"inventory_bindings"),pages(client,"inventory_adjustments"),pages(client,"purchase_order_allocations")]);
 for(const p of purchaseOrders)for(const i of p.purchase_order_items||[])i.product_master=masterProducts.find(m=>m.id===i.product_master_id);
 return {orders,personalRequests,purchaseOrders,masterProducts,skus,bindings,adjustments,allocations};
}
function init({client}){
 const target=document.querySelector('[data-admin-panel="orders"]');if(!target)return;
 const toolbar=target.querySelector(".admin-toolbar");if(!toolbar)return;
 const trigger=document.createElement("button");trigger.type="button";trigger.id="procToggle";trigger.textContent="備貨／採購清單";trigger.setAttribute("aria-haspopup","dialog");trigger.setAttribute("aria-controls","procDialog");trigger.setAttribute("aria-expanded","false");toolbar.insertBefore(trigger,toolbar.querySelector("#orderCount"));
 const area=document.createElement("dialog");area.id="procDialog";area.className="procurement fulfillment fulfillment-dialog";area.setAttribute("aria-labelledby","procDialogTitle");
 const defaults=new Set(["pending_payment","payment_review","paid","processing","confirmed","purchased","shipped","completed"]);
 area.innerHTML='<div class="fulfillment-dialog-heading"><h2 id="procDialogTitle">備貨／採購清單</h2><button type="button" id="procClose" aria-label="關閉備貨採購清單">關閉</button></div><div id="procBody"><div class="fulfillment-tools"><label>查詢內容<select id="procMode"><option value="fulfillment">待備貨清單</option><option value="buy">待採購清單</option><option value="demand">訂購需求彙整</option></select></label><label>訂單類型<select id="procType"><option value="">一般＋代購</option><option value="order">一般訂單</option><option value="personal">代購訂單</option></select></label><label class="fulfillment-check"><input type="checkbox" id="procUnpaid" checked>顯示待付款保留</label><input type="search" id="procSearch" placeholder="搜尋商品、規格或訂單" aria-label="搜尋清單"><button type="button" id="procRun" class="admin-primary" aria-label="更新清單">更新清單</button><button type="button" id="procExport" disabled>匯出 Excel（XML）</button></div>'+
 '<div id="procHistoryControls" hidden><div class="proc-controls"><label>起日（台灣時間）<input type="date" id="procStart"></label><label>迄日<input type="date" id="procEnd"></label><button type="button" data-period="all">全部日期</button><button type="button" data-period="month">本月</button></div><fieldset><legend>歷史需求納入狀態</legend>'+Object.entries(labels).filter(([k])=>k!=="cancelled").map(([k,v])=>'<label><input type="checkbox" value="'+k+'"'+(defaults.has(k)?" checked":"")+'> '+v+'</label>').join("")+'</fieldset></div>'+
 '<p id="procExplanation"></p><p id="procMessage" role="status"></p><div id="procResults"></div></div>';
 document.body.append(area);const $=id=>area.querySelector("#"+id);let plan=null,busy=false,generated="",exportRows=[],detailRows=[];
 function explain(){const mode=$("procMode").value;$("procHistoryControls").hidden=mode!=="demand";$("procUnpaid").closest("label").hidden=mode==="demand";$("procExplanation").textContent=mode==="demand"?"依日期與狀態查閱歷史訂購量；不是待採買數量。費用不列入商品，規格依正式對應分組。":"涵蓋所有尚未出貨的已確認需求，不按下單日期截斷。待付款保留另列；詢價、確認中、僅報價的代購不占庫存。採購清單以全站同規格缺額彙總，搜尋與訂單類型只篩選顯示商品，不重算全站總量。現貨或在途可供是全單檢查後的分配建議，不會自動寫入進貨對應。尚未完成進貨對應的商品會保留顯示，不論是否有現貨可供。";}
 function invalidate(){plan=null;exportRows=[];detailRows=[];$("procResults").innerHTML="";$("procExport").disabled=true;$("procMessage").textContent="查詢條件已改變，請更新清單。";explain();}
 trigger.onclick=()=>{if(!area.open){area.showModal();trigger.setAttribute("aria-expanded","true");}};
 const closeDialog=()=>{area.close();trigger.setAttribute("aria-expanded","false");trigger.focus();};
 $("procClose").onclick=closeDialog;
 area.addEventListener("cancel",e=>{e.preventDefault();closeDialog();});
 area.addEventListener("close",()=>{trigger.setAttribute("aria-expanded",String(area.open));if(!area.open)trigger.focus();});
 area.addEventListener("click",e=>{if(e.target!==area)return;const r=area.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();});
 function period(which){const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());$("procStart").value=which==="all"?"":today.slice(0,7)+"-01";$("procEnd").value=which==="all"?"":today;invalidate();}
 area.querySelectorAll("[data-period]").forEach(b=>b.onclick=()=>period(b.dataset.period));period("month");
 $("procMode").onchange=invalidate;area.querySelectorAll('#procHistoryControls input').forEach(i=>i.onchange=invalidate);
 function match(l){const term=$("procSearch").value.normalize("NFKC").toLowerCase().trim();return (!$("procType").value||l.type===$("procType").value)&&(!$("procUnpaid").checked? !l.unpaid:true)&&[l.code,l.name,l.spec,l.number].join(" ").normalize("NFKC").toLowerCase().includes(term);}
 function table(headers,rows){return '<div class="admin-table-wrap"><table class="admin-table fulfillment-table"><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';}
 const cells=values=>'<tr>'+values.map((v,i)=>'<td>'+(i===0&&/^(FR|PS)\d{8}-/.test(String(v))?'<span class="fulfillment-order">'+esc(String(v).split("｜")[0])+'</span><small>'+esc(String(v).split("｜").slice(1).join("｜"))+'</small>':esc(v))+'</td>').join("")+'</tr>';
 const orderText=l=>l.number+"｜"+(labels[l.status]||l.status)+"｜"+l.date;
 function render(){
  if(!plan)return;const mode=$("procMode").value;area.dataset.mode=mode;detailRows=[];exportRows=[];
  const header=mode==="fulfillment"?["訂單／狀態","商品／編號","規格","訂購量","正式已分配","待對應","現貨可備","待到貨可供","尚缺","備貨判斷"]:mode==="buy"?["商品／編號","規格","需求量（庫存單位）","現貨可備","待到貨可供","確定需採購","待付款保留","待付款缺額（暫不採買）","待對應（庫存單位）","確認事項","涉及訂單"]:["商品／編號","規格","訂購量（庫存單位）","訂單筆數","涉及訂單"];
  if(mode==="fulfillment"){
   const lines=plan.lines.filter(match);
   exportRows=lines.map(l=>[orderText(l),l.code+"｜"+l.name,l.spec,l.quantity,l.assigned,l.unassigned,l.ready,l.incoming,l.review?"待核對":l.shortage,l.state]);
   $("procResults").innerHTML=lines.length?table(header,exportRows.map(cells)):'<p>沒有符合條件的待備貨商品。</p>';
  }else if(mode==="buy"){
   // Supply is allocated globally before any display filters, so hiding another order cannot reuse its stock.
   const groups=plan.groups.filter(g=>g.lines.some(match)&&(g.unassigned>0||g.review||Number(g.buy)>0||$("procUnpaid").checked&&g.unpaidGap>0));
   exportRows=groups.map(g=>[g.code+"｜"+g.name,g.spec,g.quantity,g.ready,g.incoming,g.review?"待核對":g.buy,g.unpaid,g.unpaidGap,g.unassigned,g.review?"資料待核對，不自動建議採買":(g.unassigned>0?"進貨待對應 "+num(g.unassigned)+"；":"")+"僅已確認需求缺額列入確定採購；待付款缺額另列",g.lines.map(orderText).join("；")]);
   detailRows=groups.flatMap(g=>g.lines.map(l=>[orderText(l),l.code+"｜"+l.name,l.spec,l.quantity,l.assigned,l.unassigned,l.ready,l.incoming,l.review?"待核對":l.shortage,l.state]));
   $("procResults").innerHTML=groups.length?table(header,exportRows.map((r,i)=>{const t=cells(r.slice(0,-1));return t.slice(0,-5)+'<td><details><summary>訂單明細</summary>'+groups[i].lines.map(l=>'<p>'+esc(orderText(l))+'｜需求 '+num(l.quantity)+'｜'+esc(l.state)+'</p>').join("")+'</details></td></tr>';})):'<p>目前沒有需新增採購、待對應或待核對的商品；已購待到貨不會重複列為採購缺額。</p>';
  }else{
   const statuses=[...area.querySelectorAll("fieldset input:checked")].map(i=>i.value);
   const groups=root.FreaFulfillmentCore.demand(plan,{from:$("procStart").value,to:$("procEnd").value,statuses}).map(g=>({...g,lines:g.lines.filter(l=>(!$("procType").value||l.type===$("procType").value)&&[l.code,l.name,l.spec,l.number].join(" ").normalize("NFKC").toLowerCase().includes($("procSearch").value.normalize("NFKC").toLowerCase().trim()))})).filter(g=>g.lines.length);
   exportRows=groups.map(g=>[g.code+"｜"+g.name,g.spec,g.lines.reduce((n,l)=>n+l.quantity*l.factor,0),new Set(g.lines.map(l=>l.number)).size,g.lines.map(orderText).join("；")]);
   detailRows=groups.flatMap(g=>g.lines.map(l=>[orderText(l),l.code+"｜"+l.name,l.spec,l.quantity,"歷史訂購量，不是採購缺額"]));
   $("procResults").innerHTML=groups.length?table(header,exportRows.map(cells)):'<p>沒有符合日期與狀態的訂購商品。</p>';
  }
  $("procExport").disabled=!exportRows.length;$("procMessage").textContent="產生時間："+generated+"｜顯示 "+exportRows.length+" 筆｜全站進貨待對應 "+plan.lines.filter(l=>l.unassigned>0).length+" 項"+(plan.unresolved||plan.stale?"｜有 "+plan.unresolved+" 筆來源待對應、"+plan.stale+" 筆對應待核對，相關缺額不提供自動採買建議":"")+"｜未確認代購 "+plan.inquiries+" 項未列入庫存保留";
  $("procExport").dataset.headers=JSON.stringify(header);
 }
 $("procSearch").oninput=render;$("procType").onchange=render;$("procUnpaid").onchange=render;
 $("procRun").onclick=async()=>{
  if(busy)return;if($("procMode").value==="demand"&&(($("procStart").value&&$("procEnd").value&&$("procStart").value>$("procEnd").value)||!area.querySelector("fieldset input:checked"))){$("procMessage").textContent="請選擇有效日期及至少一種狀態。";return;}
  busy=true;plan=null;$("procRun").disabled=true;$("procExport").disabled=true;$("procResults").innerHTML="";$("procMessage").textContent="正在核對全部訂單、進貨及庫存…";
  const controls=[...area.querySelectorAll("select,input,[data-period]")];controls.forEach(i=>i.disabled=true);
  try{plan=root.FreaFulfillmentCore.calculate(await load(client));generated=new Date().toLocaleString("zh-TW",{timeZone:"Asia/Tokyo"});render();}
  catch(e){$("procMessage").textContent="無法完成比對："+(e.message||"請稍後再試");}finally{busy=false;$("procRun").disabled=false;controls.forEach(i=>i.disabled=false);}
 };
 $("procExport").onclick=()=>{
  if(!plan||!exportRows.length)return;const mode=$("procMode").value,title={fulfillment:"待備貨清單",buy:"待採購清單",demand:"訂購需求彙整"}[mode],headers=JSON.parse($("procExport").dataset.headers);
  const meta=[["清單",title],["產生時間（日本）",generated],["日期範圍",mode==="demand"?($("procStart").value||"不限")+"～"+($("procEnd").value||"不限"):"全部未出貨需求，不限下單日期"],["計算說明",$("procExplanation").textContent],["商品／訂單搜尋",$("procSearch").value],["注意","待核對不等於缺貨；待付款缺額不屬於確定採購數量；現貨／在途分配建議未寫回資料庫"],[]];
  const sheet=(name,rows)=>'<Worksheet ss:Name="'+name+'"><Table>'+rows.map(row=>'<Row>'+row.map(v=>'<Cell><Data ss:Type="'+(typeof v==="number"?"Number":"String")+'">'+esc(v)+'</Data></Cell>').join("")+'</Row>').join("")+'</Table></Worksheet>';
  const details=detailRows.length?detailRows:exportRows;
  const xml='<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+sheet("清單",[...meta,headers,...exportRows])+sheet("訂單明細",[...meta,...(mode==="buy"?[["訂單／狀態","商品／編號","規格","訂購量","正式已分配","待對應","現貨可備","待到貨可供","尚缺","備貨判斷"]]:mode==="demand"?[["訂單／狀態","商品／編號","規格","數量","說明"]]:[headers]),...details])+'</Workbook>';
  const url=URL.createObjectURL(new Blob([xml],{type:"application/xml;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="fréa-"+title+"-"+new Date().toISOString().slice(0,10)+".xml";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 explain();
}
const root=window;root.FreaProcurement={init,load};
})();