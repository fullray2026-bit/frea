(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const day=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const labels={pending_payment:'待匯款',payment_review:'待核款',paid:'已收款',processing:'備貨中',shipped:'已出貨',completed:'已完成',cancelled:'已取消'};
  function summarize(orders,masters,products){
    const groups=new Map();let missing=0;
    for(const order of orders){
      if(!order.order_items?.length)missing++;
      for(const item of order.order_items||[]){
        const matches=products.filter(p=>p.name===item.product_name);
        const master=matches.length===1?masters.find(m=>m.id===matches[0].product_master_id):null;
        const spec=String(item.specification||'').trim();
        const hasVariants=matches.length===1&&matches[0].product_variants?.length>0;
        const uncertain=matches.length!==1||!spec||(hasVariants&&!/(?:顏色|規格\/款式|款式)\s*[:：]/.test(spec));
        // Incomplete snapshots stay separate, even if their names match.
        const key=JSON.stringify([item.product_name,spec,uncertain?order.id:null,uncertain?item.id:null]);
        if(!groups.has(key))groups.set(key,{name:item.product_name||'未記錄商品名稱',spec:spec||'未記錄規格',code:master?.product_code||'待確認',brand:master?.brand_name||'待確認',note:uncertain?'款式待確認':master?'':'商品對應待確認',quantity:0,lines:[]});
        const group=groups.get(key);group.quantity+=Number(item.quantity)||0;
        group.lines.push({number:order.order_number,date:day(order.created_at),status:labels[order.status]||order.status,quantity:Number(item.quantity)||0});
      }
    }
    return {groups:[...groups.values()],missing};
  }
  function init({client,getMasters,getProducts}){
    const target=document.querySelector('[data-admin-panel="orders"]');if(!target)return;
    const area=document.createElement('section');area.className='admin-card procurement';
    area.innerHTML='<button type="button" class="product-cancel" id="procToggle" aria-expanded="false" aria-controls="procBody">採購彙整</button><div id="procBody" hidden><h2>訂購需求彙總</h2><p>依下單日期（台灣時間，包含結束當天）統計。此為訂購數量，尚未扣除庫存或已採購數量；重疊期間會重複納入相同訂單。</p><div class="proc-controls"><label>開始日期<input type="date" id="procStart"></label><label>結束日期<input type="date" id="procEnd"></label><button type="button" data-period="week">本週</button><button type="button" data-period="month">本月</button></div><fieldset><legend>納入的訂單狀態</legend>'+Object.entries(labels).map(([value,label])=>'<label><input type="checkbox" value="'+value+'" '+(value==='paid'?'checked':'')+'> '+label+'</label>').join('')+'</fieldset><div class="proc-controls"><button type="button" id="procRun" class="admin-primary">產生彙整</button><input type="search" id="procSearch" placeholder="搜尋商品、品牌、編號或規格" aria-label="搜尋彙整商品"><label><input type="checkbox" id="procBrand">依品牌排列</label><button type="button" id="procExport" disabled title="Excel 可開啟的 XML 工作簿，含商品彙總與訂單明細">下載 Excel（XML）</button></div><p id="procMessage" role="status"></p><div id="procResults"></div></div>';
    target.prepend(area);
    const $=id=>area.querySelector('#'+id);let report=null,busy=false;
    function period(type){const today=day(new Date()),date=new Date(today+'T00:00:00Z');$('procEnd').value=today;if(type==='month')date.setUTCDate(1);else date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7));$('procStart').value=date.toISOString().slice(0,10)}period('month');
    function invalidate(){report=null;$('procResults').innerHTML='';$('procExport').disabled=true;$('procMessage').textContent='條件已變更，請按「產生彙整」。'}
    area.querySelectorAll('input[type=date],fieldset input').forEach(e=>e.addEventListener('change',invalidate));
    area.querySelectorAll('[data-period]').forEach(e=>e.onclick=()=>{period(e.dataset.period);invalidate()});
    $('procToggle').onclick=()=>{const open=$('procBody').hidden;$('procBody').hidden=!open;$('procToggle').setAttribute('aria-expanded',String(open))};
    function shown(){if(!report)return [];const terms=$('procSearch').value.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean);return report.groups.filter(g=>terms.every(t=>[g.name,g.spec,g.brand,g.code].join(' ').normalize('NFKC').toLowerCase().includes(t))).sort((a,b)=>($('procBrand').checked?a.brand.localeCompare(b.brand,'zh-Hant'):0)||a.name.localeCompare(b.name,'zh-Hant')||a.spec.localeCompare(b.spec,'zh-Hant'))}
    function render(){if(!report)return;const groups=shown();$('procMessage').textContent=report.start+' ～ '+report.end+'｜'+report.statuses.map(s=>labels[s]).join('、')+'｜'+report.count+' 筆訂單｜顯示 '+groups.length+' 組商品規格、'+groups.reduce((s,g)=>s+g.quantity,0)+' 件｜產生時間：'+report.generated+(report.missing?'｜注意：'+report.missing+' 筆訂單沒有商品明細，請核對。':'');$('procExport').disabled=!groups.length;$('procResults').innerHTML=groups.length?'<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>品牌／商品編號</th><th>商品</th><th>規格／款式（訂單原文）</th><th>訂購數量</th><th>涉及訂單</th></tr></thead><tbody>'+groups.map(g=>'<tr><td>'+esc(g.brand)+'<br>'+esc(g.code)+'</td><td>'+esc(g.name)+(g.note?'<br><strong>'+esc(g.note)+'</strong>':'')+'</td><td>'+esc(g.spec)+'</td><td>'+g.quantity+'</td><td><details><summary>'+new Set(g.lines.map(l=>l.number)).size+' 筆</summary>'+g.lines.map(l=>'<p>'+esc(l.number)+'｜'+esc(l.date)+'｜'+esc(l.status)+'｜'+l.quantity+' 件</p>').join('')+'</details></td></tr>').join('')+'</tbody></table></div>':'<p>沒有符合條件的商品。</p>'}
    $('procSearch').oninput=render;$('procBrand').onchange=render;
    $('procRun').onclick=async()=>{
      if(busy)return;const start=$('procStart').value,end=$('procEnd').value,statuses=[...area.querySelectorAll('fieldset input:checked')].map(e=>e.value);
      if(!start||!end||start>end||!statuses.length){invalidate();$('procMessage').textContent='請選擇有效的起訖日期及至少一種訂單狀態。';return}
      busy=true;report=null;$('procResults').innerHTML='';$('procExport').disabled=true;$('procRun').disabled=true;$('procMessage').textContent='正在整理訂單…';
      area.querySelectorAll('input[type=date],fieldset input,[data-period]').forEach(e=>e.disabled=true);
      try{const next=new Date(end+'T00:00:00+08:00');next.setUTCDate(next.getUTCDate()+1);const orders=[];
        for(let offset=0;;offset+=500){const {data,error}=await client.from('orders').select('id,order_number,created_at,status,order_items(id,product_name,specification,quantity)').gte('created_at',start+'T00:00:00+08:00').lt('created_at',next.toISOString()).in('status',statuses).order('id').range(offset,offset+499);if(error)throw error;orders.push(...data);if(data.length<500)break}
        report={...summarize(orders,getMasters(),getProducts()),start,end,statuses,count:orders.length,generated:new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})};render();
      }catch(e){$('procMessage').textContent='無法完成彙整，請重新整理後再試。';}finally{busy=false;$('procRun').disabled=false;area.querySelectorAll('input[type=date],fieldset input,[data-period]').forEach(e=>e.disabled=false)}
    };
    $('procExport').onclick=()=>{
      if(!report)return;const groups=shown();const meta=[['統計期間（台灣時間）',report.start+' ～ '+report.end],['日期基準','下單日期；包含結束當天'],['訂單狀態',report.statuses.map(s=>labels[s]).join('、')],['產生時間（台灣時間）',report.generated],['搜尋條件',$('procSearch').value],['注意','訂購需求，未扣庫存或已採購數量；非採購單'],['缺少明細的訂單數',report.missing],[]];
      const summary=[...meta,['品牌','商品編號','商品','規格／款式','訂購數量','訂單筆數','確認事項'],...groups.map(g=>[g.brand,g.code,g.name,g.spec,g.quantity,new Set(g.lines.map(l=>l.number)).size,g.note])];
      const detail=[...meta,['訂單編號','下單日期','狀態','品牌','商品編號','商品','規格／款式','數量','確認事項'],...groups.flatMap(g=>g.lines.map(l=>[l.number,l.date,l.status,g.brand,g.code,g.name,g.spec,l.quantity,g.note]))];
      const sheet=(name,rows)=>'<Worksheet ss:Name="'+name+'"><Table>'+rows.map(row=>'<Row>'+row.map(v=>'<Cell><Data ss:Type="'+(typeof v==='number'?'Number':'String')+'">'+esc(v)+'</Data></Cell>').join('')+'</Row>').join('')+'</Table></Worksheet>';
      const xml='<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'+sheet('商品彙總',summary)+sheet('訂單明細',detail)+'</Workbook>';
      const url=URL.createObjectURL(new Blob([xml],{type:'application/xml;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='frea-採購彙整-'+report.start+'-'+report.end+'.xml';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }
  window.FreaProcurement={init,summarize};
})();
