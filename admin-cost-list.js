(function(root){
"use strict";
const x=v=>String(v??"").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
const stable=o=>JSON.stringify(Object.fromEntries(Object.keys(o||{}).sort().map(k=>[k,o[k]])));
const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
function build(d){
 const masters=(d.masters||[]).filter(m=>m.catalog_type==="regular").slice().sort((a,b)=>String(a.product_code||"").localeCompare(String(b.product_code||""),"en",{numeric:true}));
 const rows=[];
 for(const m of masters){
  const cs=(d.scenarios||[]).filter(c=>c.product_master_id===m.id).sort((a,b)=>String(b.updated_at||b.created_at||"").localeCompare(String(a.updated_at||a.created_at||"")));
  const c=cs.find(c=>c.is_selected)||cs[0]||null;
  const variants=(d.variants||[]).filter(v=>v.product_master_id===m.id).sort((a,b)=>a.specification.localeCompare(b.specification,"zh-TW",{numeric:true}));
  for(const v of variants.length?variants:[null]){
   const notes=[],poss=(d.purchases||[]).filter(p=>p.item.product_master_id===m.id&&p.currency==="JPY"&&p.status!=="cancelled").filter(p=>{
    const i=p.item,b=(d.bindings||[]).find(b=>b.source_type==="purchase"&&b.source_key===i.id);
    if(b&&b.purpose!=="sale")return false;
    const snap={master:i.product_master_id,quantity:i.quantity,...(i.receipt_specification!=null?{receipt_specification:i.receipt_specification}:{})};
    const sku=i.inventory_sku_id||(b&&stable(b.source_snapshot)===stable(snap)?b.sku_id:null);
    return v?sku===v.id:!sku;
   }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
   const latest=poss.filter(p=>p.date===poss[0]?.date),prices=[...new Set(latest.map(p=>Number(p.item.unit_cost)))];
   let price="未登錄",basis="無收據／有效試算價";
   if(prices.length===1){price=prices[0];basis=[...new Set(latest.map(p=>p.po))].join("、")+"｜"+latest[0].date;}
   else if(prices.length>1){price=prices.map(n=>"¥"+n).join("／");basis=latest[0].po+"｜"+latest[0].date;notes.push("同日不同單價，未自行平均");}
   else if(c&&Number(c.purchase_price_jpy)>0){price=Number(c.purchase_price_jpy);basis="成本試算價（非收據）";}
   const weight=Number(m.weight_g)>0?Number(m.weight_g):Number(c?.product_weight_g)>0?Number(c.product_weight_g):"未填寫";
   if(!Number(m.weight_g)&&typeof weight==="number")notes.push("重量採成本試算");
   if(c&&!c.is_selected)notes.push("尚未選定成本方案，費用採最新試算");
   if(cs.length>1){notes.push("有"+cs.length+"個成本方案，詳見試算來源");if(c?.is_selected&&c.id!==cs[0].id)notes.push("已選方案非最新，費用可能待更新");}
   if(c&&Number(c.purchase_price_jpy)===0)notes.push("採用方案進貨價記錄為0，請確認");
   if(!c)notes.push("尚無成本方案");
   const labels={pending_review:"待確認",costed:"已試算",ready_to_publish:"待上架"};
   if(labels[m.status])notes.push("主檔狀態："+labels[m.status]);
   rows.push({code:m.product_code,name:m.name,price,spec:v?.specification||m.specification||"未填寫",weight,fee:c&&c.platform_fee_unit_twd!=null?round(c.platform_fee_unit_twd):"未設定",commission:c&&c.group_commission_amount_twd!=null?round(c.group_commission_amount_twd):"未設定",basis,scenario:c?(c.is_selected?"已選：":"未選／最新：")+c.scenario_name:"未設定",notes:notes.join("；")});
  }
 }
 const ids=new Set(masters.map(m=>m.id));
 const costs=(d.scenarios||[]).filter(c=>ids.has(c.product_master_id)).map(c=>({...c,master:masters.find(m=>m.id===c.product_master_id)})).sort((a,b)=>a.master.product_code.localeCompare(b.master.product_code,"en",{numeric:true})||String(b.updated_at||"").localeCompare(String(a.updated_at||"")));
 return {rows,costs,masterCount:masters.length};
}
function col(n){let s="";for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function cell(v,r,c,s=0){const ref=col(c)+r;if(typeof v==="number"&&Number.isFinite(v))return '<c r="'+ref+'" s="'+s+'"><v>'+v+'</v></c>';return '<c r="'+ref+'" s="'+s+'" t="inlineStr"><is><t xml:space="preserve">'+x(v)+'</t></is></c>';}
const weighted=s=>[...String(s||"")].reduce((n,c)=>n+(c.charCodeAt(0)>255?2:1),0);
function sheetXml(title,notes,headers,values,widths,kind){
 const end=values.length+7,last=col(headers.length-1),parts=['<row r="2" ht="30" customHeight="1">'+cell(title,2,0,5)+'</row>'];
 notes.forEach((n,i)=>parts.push('<row r="'+(i+3)+'" ht="18" customHeight="1">'+cell(n,i+3,0,6)+'</row>'));
 parts.push('<row r="7" ht="44" customHeight="1">'+headers.map((h,c)=>cell(h,7,c,4)).join("")+'</row>');
 values.forEach((row,i)=>{
  const r=i+8,alt=i%2===0,lines=kind==="main"?Math.max(1,Math.ceil(weighted(row[1])/49),Math.ceil(weighted(row[3])/66),Math.ceil(weighted(row[9])/90),Math.ceil(weighted(row[8])/44)):Math.max(2,Math.ceil(weighted(row[1])/45));
  parts.push('<row r="'+r+'" ht="'+Math.max(34,lines*16+8)+'" customHeight="1">'+row.map((v,c)=>{
   const missing=kind==="main"&&[2,4,5,6].includes(c)&&typeof v!=="number";
   let style=alt?10:0;
   if(kind==="main"){
    if([1,3,7,8,9].includes(c))style=alt?7:1;
    if([2,5,6].includes(c))style=alt?8:2;
    if(c===4)style=alt?9:3;
   }else{if([1,2,11].includes(c))style=alt?7:1;if([5,6,7,9,10].includes(c))style=alt?8:2;if(c===8)style=12;}
   return cell(v,r,c,missing?11:style);
  }).join("")+'</row>');
 });
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><dimension ref="A1:'+last+end+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A8" sqref="A8"/></sheetView></sheetViews><cols>'+widths.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join("")+'</cols><sheetData>'+parts.join("")+'</sheetData><tableParts count="1"><tablePart r:id="rId1"/></tableParts></worksheet>';
}
function tableXml(id,name,headers,count){return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="'+id+'" name="'+name+'" displayName="'+name+'" ref="A7:'+col(headers.length-1)+(count+7)+'" totalsRowShown="0"><autoFilter ref="A7:'+col(headers.length-1)+(count+7)+'"/><tableColumns count="'+headers.length+'">'+headers.map((h,i)=>'<tableColumn id="'+(i+1)+'" name="'+x(h)+'"/>').join("")+'</tableColumns><tableStyleInfo name="TableStyleLight1" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>';}
function styles(){
 const font=(size,color,bold=false)=>'<font><sz val="'+size+'"/><color rgb="FF'+color+'"/><name val="Microsoft JhengHei"/>'+(bold?'<b/>':"")+'</font>';
 const fill=c=>'<fill><patternFill patternType="solid"><fgColor rgb="FF'+c+'"/><bgColor indexed="64"/></patternFill></fill>';
 const xf=(f=0,fillId=0,fmt=0,wrap=false,center=false)=>'<xf numFmtId="'+fmt+'" fontId="'+f+'" fillId="'+fillId+'" borderId="0" xfId="0" applyAlignment="1" applyFont="1" applyFill="1" applyNumberFormat="1"><alignment vertical="center"'+(wrap?' wrapText="1"':"")+(center?' horizontal="center"':"")+'/></xf>';
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.0"/></numFmts><fonts count="5">'+font(11,"493C32")+font(11,"493C32",true)+font(21,"493C32",true)+font(10,"806F5E")+font(11,"9B5B23")+'</fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+fill("F3EDE5")+fill("FAF7F2")+fill("FFF0CF")+'</fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1">'+xf()+'</cellStyleXfs><cellXfs count="13">'+[xf(),xf(0,0,0,true),xf(0,0,164,false,true),xf(0,0,165,false,true),xf(1,2,0,true,true),xf(2),xf(3),xf(0,3,0,true),xf(0,3,164,false,true),xf(0,3,165,false,true),xf(0,3),xf(4,4,0,true,true),xf(0,0,10,false,true)].join("")+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="0"/><tableStyles count="0" defaultTableStyle="TableStyleLight1" defaultPivotStyle="PivotStyleLight16"/></styleSheet>';
}
let crcTable;
function crc(bytes){if(!crcTable)crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zip(files){
 const enc=new TextEncoder(),local=[],central=[];let offset=0,centralSize=0;
 for(const [name,text] of Object.entries(files)){
  const n=enc.encode(name),b=enc.encode(text),sum=crc(b),h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,0x21,true);v.setUint32(14,sum,true);v.setUint32(18,b.length,true);v.setUint32(22,b.length,true);v.setUint16(26,n.length,true);h.set(n,30);local.push(h,b);
  const ch=new Uint8Array(46+n.length),cv=new DataView(ch.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,0x21,true);cv.setUint32(16,sum,true);cv.setUint32(20,b.length,true);cv.setUint32(24,b.length,true);cv.setUint16(28,n.length,true);cv.setUint32(42,offset,true);ch.set(n,46);central.push(ch);centralSize+=ch.length;offset+=h.length+b.length;
 }
 const e=new Uint8Array(22),v=new DataView(e.buffer),count=Object.keys(files).length;v.setUint32(0,0x06054b50,true);v.setUint16(8,count,true);v.setUint16(10,count,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
 const out=new Uint8Array(offset+centralSize+22);let p=0;for(const b of [...local,...central,e]){out.set(b,p);p+=b.length;}return out;
}
function workbook(d,date){
 const report=build(d);if(!report.rows.length)throw Error("沒有常態商品資料，未產生空白清單。");
 const h=["商品編號","品名","進貨價格（日幣／件）","規格","重量（g／件）","平台金流費（台幣／件）","團購主抽成（台幣／件）","價格依據","費用採用的成本方案","備註／待確認"];
 const sh=["商品編號","品名","方案名稱","已選用","方案更新日","試算進貨價（日幣）","試算重量（g）","試算售價（台幣）","平台金流費率","平台金流費（台幣／件）","團購主抽成（台幣／件）","來源說明"];
 const rows=report.rows.map(r=>[r.code,r.name,r.price,r.spec,r.weight,r.fee,r.commission,r.basis,r.scenario,r.notes]);
 const number=v=>v==null?"未設定":Number(v);
 const raw=report.costs.map(c=>[c.master.product_code,c.master.name,c.scenario_name,c.is_selected?"是":"否",c.updated_at?.slice(0,10)||"",number(c.purchase_price_jpy),number(c.product_weight_g),number(c.actual_sale_price_twd),number(c.platform_rate),number(c.platform_fee_unit_twd),number(c.group_commission_amount_twd),"fréa 後台／成本試算（已儲存值）"]);
 const files={};
 files["[Content_Types].xml"]='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+[1,2].map(i=>'<Override PartName="/xl/worksheets/sheet'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>').join("")+'</Types>';
 files["_rels/.rels"]='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 files["xl/workbook.xml"]='<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="常態商品清單" sheetId="1" r:id="rId1"/><sheet name="成本試算來源" sheetId="2" r:id="rId2"/></sheets></workbook>';
 files["xl/_rels/workbook.xml.rels"]='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 files["xl/styles.xml"]=styles();
 files["xl/worksheets/sheet1.xml"]=sheetXml("常態商品清單",["截至 "+date+"｜"+report.masterCount+"個常態主檔，依規格分列 "+rows.length+" 列｜按商品編號排列","進貨價格優先採實際日幣收據；無收據時採成本試算價，均於「價格依據」註明。","金流費與抽成為台幣／件；0代表記錄為0，未設定不等於0。重量不另推算包裝或體積重。"],h,rows,[17,47,19,63,17,23,26,34,38,78],"main");
 files["xl/worksheets/sheet2.xml"]=sheetXml("成本試算來源",["來源：fréa 後台商品主檔、進貨管理及成本試算；擷取日 "+date+"。","費用優先採已選方案；未選時採最新更新者並註明。後台記錄的費率不代表已核定的實際金流費率。","保留歷史未選方案供核對；主檔參考定價未冒充進貨價格。"],sh,raw,[17,43,28,10,15,19,18,18,15,23,25,46],"source");
 [h,sh].forEach((headers,i)=>{files["xl/tables/table"+(i+1)+".xml"]=tableXml(i+1,i?"CostScenarioSource":"RegularProductList",headers,i?raw.length:rows.length);files["xl/worksheets/_rels/sheet"+(i+1)+".xml.rels"]='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="../tables/table'+(i+1)+'.xml"/></Relationships>';});
 return {bytes:zip(files),report};
}
async function pages(client,table,select="*",filter){
 let data=[];for(let start=0;;start+=1000){let q=client.from(table).select(select).order("id").range(start,start+999);if(filter)q=filter(q);const r=await q;if(r.error)throw r.error;if(!Array.isArray(r.data))throw Error("清單資料未完整載入，請重新整理。");data.push(...r.data);if(r.data.length<1000)return data;}
}
async function load(client){
 const [masters,scenarios,orders,variants,bindings]=await Promise.all([pages(client,"product_master","*",q=>q.eq("catalog_type","regular")),pages(client,"cost_scenarios"),pages(client,"purchase_orders","id,order_number,ordered_at,currency,status,purchase_order_items(*)",q=>q.neq("status","cancelled")),pages(client,"inventory_skus"),pages(client,"inventory_bindings","*",q=>q.eq("source_type","purchase"))]);
 return {masters,scenarios,variants,bindings,purchases:orders.flatMap(p=>(p.purchase_order_items||[]).map(item=>({item,po:p.order_number,date:p.ordered_at,currency:p.currency,status:p.status})))};
}
function init(client){
 const button=document.getElementById("costListDownload"),message=document.getElementById("costListMessage");if(!button)return;
 button.addEventListener("click",async()=>{if(button.disabled)return;button.disabled=true;button.textContent="產生中…";message.hidden=false;message.className="admin-muted";message.textContent="正在讀取最新常態商品、進貨與成本試算資料…";
  try{const data=await load(client),date=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),{bytes,report}=workbook(data,date);
   const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"})),a=document.createElement("a");a.href=url;a.download="常態商品清單_"+date.replaceAll("-","")+".xlsx";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
   message.textContent="已產生 "+report.masterCount+" 個常態商品／"+report.rows.length+" 列規格明細，含成本試算來源。";
  }catch(e){message.className="error";message.textContent="未能產生成本清單："+(e.message||"請稍後重試");}finally{button.disabled=false;button.textContent="成本清單";}
 });
}
root.FreaCostList={build,workbook,load,init};if(typeof module!=="undefined")module.exports=root.FreaCostList;
})(typeof window!=="undefined"?window:globalThis);
