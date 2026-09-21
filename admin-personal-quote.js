(function () {
  'use strict';
  const money=(n,c='TWD')=>(c==='JPY'?'¥':'NT$')+Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2});
  function read(card){
    const num=(key,round=true)=>{const n=Number(card.querySelector('[data-quote-'+key+']')?.value);return Number.isFinite(n)?Math.max(0,round?Math.round(n):n):0;};
    const units=[...card.querySelectorAll('[data-quote-unit]')].map(i=>Math.max(0,Math.round(Number(i.value)||0)));
    const quantities=[...card.querySelectorAll('[data-quote-unit]')].map(i=>Math.max(1,Math.round(Number(i.dataset.quantity)||1)));
    const lines=units.map((v,i)=>v*quantities[i]);const subtotal=lines.reduce((a,b)=>a+b,0);
    const rate=num('rate',false),domestic=num('domestic'),fees=num('fees'),international=num('international'),taiwan=num('taiwan'),other=num('other');
    const japan=card.dataset.serviceDirection==='tw_to_jp';
    return {japan,currency:japan?'JPY':'TWD',sourceCurrency:japan?'TWD':'JPY',units,quantities,lines,subtotal,rate,domestic,fees,international,taiwan,other,total:Math.round((subtotal+domestic)*rate+fees+international+taiwan+other)};
  }
  function validate(card,allowIncomplete=false){
    for(const input of card.querySelectorAll('.personal-quote-sheet input')){
      if(!input.checkValidity()){input.reportValidity();return false;}
      if(!Number.isFinite(Number(input.value))){input.focus();return false;}
    }
    if(!allowIncomplete && (!card.querySelector('[data-quote-unit]') || [...card.querySelectorAll('[data-quote-unit]')].some(i=>i.value==='') || read(card).rate<=0)){
      window.alert('請先填寫所有商品單價及大於 0 的匯率，再產生報價單。');return false;
    }
    if(read(card).total>2147483647){window.alert('報價金額超出可儲存範圍，請確認輸入數值。');return false;}
    return true;
  }

  async function render(request,q){
    await document.fonts.ready;
    const japan=request.service_direction==='tw_to_jp', ja=request.contact_language==='ja';
    const source=japan?'TWD':'JPY', currency=japan?'JPY':'TWD';
    const translations={'代購報價單':'購入代行お見積書','報價編號：':'見積番号：','報價日期：':'見積日：','報價方：':'発行元：','客戶姓名：':'お客様名：','電話：':'電話：','收件地址：':'お届け先：','商品名稱／規格':'商品名／仕様','數量':'数量','單價 ':'単価 ','小計 ':'小計 ','規格：':'仕様：','費用明細':'費用明細','商品小計':'商品小計','日本國內運費':'日本国内送料','台灣國內運費':'台湾国内送料','匯率':'換算レート','商品與運費換算':'商品・送料の換算額','商品與日本運費換算':'商品・日本送料の換算額','關稅及手續費':'関税および手数料','國際運費':'国際送料','其他':'その他','報價總金額':'お見積もり合計','計算方式：':'計算方法：','商品與台灣運費換算':'商品・台湾送料の換算額','總金額以新台幣計算，四捨五入至整元。':'合計は台湾ドルで、小数点以下を四捨五入します。','總金額以日圓計算，四捨五入至整元。':'合計は日本円で、小数点以下を四捨五入します。','付款方式：福岡銀行 ATM 日圓匯款。報價確認後提供帳戶資訊，確認入帳後安排採購。':'お支払い：福岡銀行への日本円ATM振込。口座情報はお見積もり確認後にご案内し、入金確認後に購入を手配します。','請確認報價內容並同意購買後再匯款。':'見積内容をご確認・ご承諾のうえ、お振り込みください。'};
    const tr=value=>{let valueText=String(value??'');if(!ja)return valueText;for(const [a,b] of Object.entries(translations).sort((a,b)=>b[0].length-a[0].length))valueText=valueText.replaceAll(a,b);return valueText;};
    const pages=[];let canvas,ctx,y;
    const W=1240,H=1754,L=64,R=1176,bottom=1630;
    const ink='#4b3d32',muted='#958475',line='#dfd4c8';
    const font=(size=23,bold=false)=>{ctx.font=(bold?'600 ':'400 ')+size+'px "Microsoft JhengHei", "Noto Sans TC", sans-serif';};
    const text=(str,x,yy,size=23,color=ink,align='left')=>{font(size);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(tr(str),x,yy);ctx.textAlign='left';};
    const wrap=(str,width,size=23)=>{font(size);const lines=[];let current='';for(const ch of tr(str??'—')){if(ch==='\n'){lines.push(current);current='';continue;}if(ctx.measureText(current+ch).width>width&&current){lines.push(current);current='';}current+=ch;}lines.push(current);return lines;};
    const rule=()=>{ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(R,y);ctx.stroke();};
    const newPage=()=>{canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;ctx=canvas.getContext('2d');ctx.fillStyle='#fffdf9';ctx.fillRect(0,0,W,H);ctx.font='64px Georgia, serif';ctx.fillStyle=ink;ctx.fillText('fréa',L,102);text('代購報價單',R,78,32,ink,'right');text('PERSONAL SHOPPING QUOTATION',R,110,16,muted,'right');y=140;rule();y=174;text('報價編號：'+request.request_number,L,y,21);y+=36;pages.push(canvas);};
    const ensure=h=>{if(y+h>bottom)newPage();};
    const paragraph=(str,size=22,color=ink)=>{for(const ln of wrap(str,R-L,size)){ensure(34);text(ln,L,y,size,color);y+=34;}};
    const tableHead=()=>{ensure(60);ctx.fillStyle=ink;ctx.fillRect(L,y-24,R-L,46);text('商品名稱／規格',L+14,y+7,21,'#fff');text('數量',735,y+7,21,'#fff','right');text('單價 '+source,940,y+7,21,'#fff','right');text('小計 '+source,R-14,y+7,21,'#fff','right');y+=54;};
    newPage();
    paragraph('報價日期：'+new Date().toLocaleDateString(ja?'ja-JP':'zh-TW',{timeZone:'Asia/Taipei'}));
    paragraph('報價方：fréa　｜　frea.global@gmail.com');y+=10;
    paragraph('客戶姓名：'+(request.customer_name||'—'));
    paragraph('電話：'+(request.phone||'—'));
    paragraph('Email：'+(request.email||'—'));
    if(request.delivery_address?.address_line)paragraph('收件地址：'+[request.delivery_address.recipient,request.delivery_address.postal_code,request.delivery_address.region,request.delivery_address.city,request.delivery_address.address_line].filter(Boolean).join(' '));y+=20;
    tableHead();
    (request.items||[]).forEach((item,index)=>{
      const names=wrap((index+1)+'. '+(item.name||'未填商品名稱')+(item.specification?'\n規格：'+item.specification:''),570,22);
      let first=true;
      while(names.length){if(y+70>bottom){newPage();tableHead();}const count=Math.max(1,Math.min(names.length,Math.floor((bottom-y-30)/32)));const chunk=names.splice(0,count);
        chunk.forEach((ln,j)=>text(ln,L+14,y+j*32,22));
        if(first){text(q.quantities[index],735,y,22,ink,'right');text(money(q.units[index],source),940,y,22,ink,'right');text(money(q.lines[index],source),R-14,y,22,ink,'right');first=false;}
        y+=chunk.length*32+22;rule();y+=28;
      }
    });
    ensure(520);y+=8;text('費用明細',L,y,27);y+=44;
    const origin=japan?'台灣':'日本',destination=japan?'日本':'台灣';
    const costs=[['商品小計（'+source+'）',money(q.subtotal,source)],[origin+'國內運費（'+source+'）',money(q.domestic,source)],['匯率（'+source+' → '+currency+'）',String(q.rate)],['商品與運費換算（'+currency+'）',money((q.subtotal+q.domestic)*q.rate,currency)],['關稅及手續費（'+currency+'）',money(q.fees,currency)],['國際運費（'+currency+'）',money(q.international,currency)],[destination+'國內運費（'+currency+'）',money(q.taiwan,currency)],['其他（'+currency+'）',money(q.other,currency)]];
    for(const [label,value] of costs){text(label,L+14,y,22);text(value,R-14,y,22,ink,'right');y+=40;}
    y+=10;ctx.fillStyle=ink;ctx.fillRect(L,y-24,R-L,64);text('報價總金額（'+currency+'）',L+18,y+17,26,'#fff');text(money(q.total,q.currency),R-18,y+17,32,'#fff','right');y+=80;
    paragraph('計算方式：（商品小計＋'+origin+'國內運費）× 匯率＋關稅及手續費＋國際運費＋'+destination+'國內運費＋其他',19,muted);
    paragraph(japan?'總金額以日圓計算，四捨五入至整元。':'總金額以新台幣計算，四捨五入至整元。',19,muted);
    if(japan){paragraph('付款方式：福岡銀行 ATM 日圓匯款。報價確認後提供帳戶資訊，確認入帳後安排採購。',19,muted);paragraph('請確認報價內容並同意購買後再匯款。',19,muted);}
    pages.forEach((p,i)=>{ctx=p.getContext('2d');y=1672;rule();text('fréa  |  www.thefrea.com',L,1704,18,muted);text((i+1)+' / '+pages.length,R,1704,18,muted,'right');});
    return pages;
  }

  // Embed the exact preview pages in an A4 PDF; Chinese glyphs remain identical on every device.
  function pdf(pages){
    const enc=new TextEncoder(),objects=[];const str=s=>enc.encode(s);
    const join=parts=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;};
    const kids=pages.map((_,i)=>(3+i*3)+' 0 R').join(' ');
    objects.push(str('<< /Type /Catalog /Pages 2 0 R >>'),str('<< /Type /Pages /Kids ['+kids+'] /Count '+pages.length+' >>'));
    pages.forEach((canvas,i)=>{const id=3+i*3;const jpeg=Uint8Array.from(atob(canvas.toDataURL('image/jpeg',0.95).split(',')[1]),c=>c.charCodeAt(0));const commands='q 595.28 0 0 841.89 0 0 cm /Im0 Do Q';
      objects.push(str('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 '+(id+1)+' 0 R >> >> /Contents '+(id+2)+' 0 R >>'));
      objects.push(join([str('<< /Type /XObject /Subtype /Image /Width '+canvas.width+' /Height '+canvas.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'),jpeg,str('\nendstream')]));
      objects.push(str('<< /Length '+commands.length+' >>\nstream\n'+commands+'\nendstream'));
    });
    const parts=[str('%PDF-1.4\n')],offsets=[0];let offset=parts[0].length;
    objects.forEach((o,i)=>{offsets.push(offset);const part=join([str((i+1)+' 0 obj\n'),o,str('\nendobj\n')]);parts.push(part);offset+=part.length;});
    parts.push(str('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF'));
    return new Blob(parts,{type:'application/pdf'});
  }
  function download(pages,number){const url=URL.createObjectURL(pdf(pages));const a=document.createElement('a');a.href=url;a.download='frea-報價單-'+String(number).replace(/[^a-zA-Z0-9_-]/g,'_')+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  async function open(request,q,direct){
    const pages=await render(request,q);if(direct){download(pages,request.request_number);return;}
    document.getElementById('personalQuotePreview')?.close();document.getElementById('personalQuotePreview')?.remove();
    const dialog=document.createElement('dialog');dialog.id='personalQuotePreview';dialog.className='personal-quote-preview';dialog.setAttribute('aria-label','代購報價單預覽');
    const toolbar=document.createElement('div');toolbar.className='personal-preview-toolbar';
    const title=document.createElement('span');title.textContent='報價單預覽｜依目前輸入內容產生，請另按「儲存變更」保存訂單。';toolbar.append(title);
    const dl=document.createElement('button');dl.type='button';dl.textContent='下載 PDF';dl.onclick=()=>download(pages,request.request_number);toolbar.append(dl);
    const close=document.createElement('button');close.type='button';close.textContent='關閉';close.onclick=()=>dialog.close();toolbar.append(close);dialog.append(toolbar);
    for(const [i,canvas] of pages.entries()){canvas.setAttribute('role','img');canvas.setAttribute('aria-label','報價單 '+request.request_number+' 第 '+(i+1)+' 頁，總金額 '+money(q.total,q.currency));dialog.append(canvas);}
    const active=document.activeElement;dialog.addEventListener('close',()=>{dialog.remove();active?.focus();},{once:true});document.body.append(dialog);dialog.showModal();close.focus();
  }
  window.FreaPersonalQuote={read,validate,open};
})();
