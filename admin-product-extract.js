(() => {
  let client, generation=0;
  const el=id=>document.getElementById(id);
  const fields={name:['masterName','商品名稱'],brand_name:['masterBrandName','品牌名稱'],specification:['masterSpecification','規格'],usage_flavor:['masterUsage','用途／風味（建議）'],description:['masterDescription','簡短介紹'],model:['masterModel','型號'],barcode:['masterBarcode','JAN／條碼'],reference_price_jpy:['masterReferencePrice','參考售價（JPY）'],weight_g:['masterWeight','商品重量（g）']};
  function reset(){generation++;el('masterExtractResult').replaceChildren();el('masterExtractMessage').textContent='';el('masterExtract').disabled=false;}
  function preview(data){
    const box=el('masterExtractResult');box.replaceChildren();const heading=document.createElement('p');heading.textContent='勾選要帶入的資料。已有內容的欄位預設不勾選；勾選後會取代原內容。';box.append(heading);
    if(data.original_fields){const details=document.createElement('details'),summary=document.createElement('summary'),original=document.createElement('pre');summary.textContent='查看來源原文';original.textContent=Object.entries(data.original_fields).filter(([k])=>fields[k]).map(([k,v])=>fields[k][1]+'：'+v).join('\n\n');original.style.whiteSpace='pre-wrap';original.style.overflowWrap='anywhere';details.append(summary,original);box.append(details);}
    const choices=[];
    for(const [key,[id,title]] of Object.entries(fields)){
      if(data.fields?.[key]===undefined)continue;
      const row=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span'),value=document.createElement('textarea');check.type='checkbox';check.checked=!el(id).value.trim()||(['reference_price_jpy','weight_g'].includes(key)&&Number(el(id).value)===0);text.textContent=title;value.value=String(data.fields[key]);value.rows=key==='description'?3:1;row.className='extract-field';row.append(check,text,value);box.append(row);choices.push({check,value,id,key});
    }
    let imageSelect;
    if(data.images?.length){const label=document.createElement('label');label.textContent='商品圖片（選擇後才取代目前圖片）';imageSelect=document.createElement('select');imageSelect.add(new Option('保留目前圖片',''));for(const [i,url] of data.images.entries())imageSelect.add(new Option('來源圖片 '+(i+1),url));const img=document.createElement('img');img.hidden=true;img.referrerPolicy='no-referrer';imageSelect.addEventListener('change',()=>{img.hidden=!imageSelect.value;if(imageSelect.value)img.src=imageSelect.value;else img.removeAttribute('src');});label.append(imageSelect,img);box.append(label);}
    const note=document.createElement('p');note.textContent=(data.warnings||[]).join(' ');box.append(note);
    const apply=document.createElement('button');apply.type='button';apply.textContent='帶入勾選資料';apply.addEventListener('click',()=>{
      for(const c of choices.filter(c=>c.check.checked)){if(['reference_price_jpy','weight_g'].includes(c.key)&&(!c.value.value.trim()||!Number.isFinite(Number(c.value.value))||Number(c.value.value)<0)){el('masterExtractMessage').textContent='價格與重量請填寫有效的非負數字。';return;}}
      for(const c of choices.filter(c=>c.check.checked))el(c.id).value=c.value.value.trim();
      if(imageSelect?.value){el('masterImage').value='';el('masterExistingImage').value=imageSelect.value;el('masterStoragePath').value='';el('masterImagePreview').src=imageSelect.value;el('masterImagePreview').hidden=false;el('masterPreviewEmpty').hidden=true;}
      box.replaceChildren();el('masterExtractMessage').textContent='已帶入表單，可繼續修改。確認後請按原本的儲存按鈕。';
    });box.append(apply);
  }
  window.FreaProductExtract={reset,init(c){client=c;
    el('masterSourceUrl').addEventListener('input',reset);el('masterCancel').addEventListener('click',reset);
    el('masterExtract').addEventListener('click',async()=>{
      reset();const source=el('masterSourceUrl').value.trim();try{if(new URL(source).protocol!=='https:')throw 0;}catch{el('masterExtractMessage').textContent='請先輸入完整的 https:// 商品網址。';return;}
      const current=generation;el('masterExtract').disabled=true;el('masterExtractMessage').textContent='正在擷取、翻譯商品資料及整理用途／風味…';
      try{const {data,error}=await client.functions.invoke('extract-product',{body:{url:source}});if(current!==generation)return;if(error){let message='擷取失敗，請稍後再試或手動填寫。';try{message=(await error.context.json()).error||message;}catch{}throw new Error(message);}if(data.error)throw new Error(data.error);preview(data);el('masterExtractMessage').textContent=data.translation_status==='translated'?'擷取及繁體中文翻譯完成，請核對下方資料。':data.translation_status==='unavailable'?'已擷取原文，翻譯尚未完成，請查看下方說明。':'擷取完成，請核對下方資料。';}
      catch(error){if(current===generation)el('masterExtractMessage').textContent=error.message;}
      finally{if(current===generation)el('masterExtract').disabled=false;}
    });
  }};
})();
