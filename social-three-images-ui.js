(async function(){
 'use strict';
 const $=id=>document.getElementById(id),client=window.supabase.createClient(window.freaSupabaseConfig.url,window.freaSupabaseConfig.publishableKey);
 const check=r=>{if(r.error)throw r.error;return r.data};let draftId=null,busy=false,urlsKey='';
 const say=s=>$('status').textContent=s;
 async function call(body){const r=await client.functions.invoke('social-three-images',{body});if(r.error||r.data?.error)throw Error(r.data?.error||'三圖服務暫時無法使用，請稍後重試。');return r.data;}
 async function loadDrafts(){const rows=check(await client.from('social_drafts').select('id,title,created_at').eq('is_test',true).order('created_at',{ascending:false}).limit(50));$('drafts').replaceChildren(...rows.map(d=>new Option(d.title+' · '+new Date(d.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Tokyo'}),d.id)));if(draftId)$('drafts').value=draftId;}
 async function show(){const data=await call({action:'status',draft_id:draftId}),d=data.draft;$('result').hidden=false;$('title').textContent=d.title+(d.is_test?'（測試・未發布）':d.image_generation.review_only?'（LINE流程測試・不發布）':'（排程三圖草稿）');$('facebook').textContent=d.facebook_text;$('instagram').textContent=d.instagram_text;$('rules').textContent=d.style_snapshot.photo_rules;
  const count=data.urls.filter(Boolean).length,progress=d.image_generation;$('progress').textContent=count===3?'三張已完成並保存。請核對商品外型、包裝文字、資訊與使用方式。':progress.error||('已完成 '+count+'/3 張'+(progress.state==='generating'?'；正在製作第 '+(progress.slot+1)+' 張…':''));
  $('resume').hidden=count===3||busy;
  if(JSON.stringify(data.urls.map(u=>u?.split('?')[0]))!==urlsKey){urlsKey=JSON.stringify(data.urls.map(u=>u?.split('?')[0]));$('images').replaceChildren(...data.slots.map((label,i)=>{const card=document.createElement('article');card.className='card';const heading=document.createElement('h3');heading.textContent=(i+1)+'. '+label;card.append(heading);if(data.urls[i]){const image=new Image();image.alt=label;image.src=data.urls[i];card.append(image);const link=document.createElement('a');link.href=data.urls[i];link.target='_blank';link.rel='noopener';link.textContent='開啟原尺寸圖片';card.append(link);}else{const p=document.createElement('p');p.textContent='等待製作';card.append(p);}return card;}));}
  return d;
 }
 async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){say(e.message||'操作未完成');}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);if(draftId)await show().catch(()=>{});}}
 async function make(){let d=await show();for(let tries=0;tries<180;tries++){if(d.image_paths.filter(Boolean).length===3){say('三張測試商品圖已保存，尚未發布。');await loadDrafts();return;}
   if(d.image_generation.state==='failed')throw Error(d.image_generation.error);
   if(d.image_generation.state!=='generating'){await call({action:'next',draft_id:draftId});}
   else if(Date.now()-Date.parse(d.image_generation.started_at)>240000)throw Error('製作逾時，已完成圖片保留，可按繼續／重試。');
   await new Promise(r=>setTimeout(r,5000));d=await show();
  }throw Error('等待較久，請稍後从測試清單繼續。');
 }
 $('testForm').onsubmit=e=>{e.preventDefault();run(async()=>{say('正在建立測試草稿與文案…');const r=await call({action:'start',product_id:$('product').value,style_id:$('style').value,product_type:$('type').value});draftId=r.draft_id;history.replaceState(null,'','?draft='+draftId);await loadDrafts();say('測試草稿已保存，正在製作三張獨立圖片…');await make();});};
 $('open').onclick=()=>run(async()=>{draftId=$('drafts').value;if(!draftId)throw Error('尚無測試草稿');urlsKey='';history.replaceState(null,'','?draft='+draftId);await show();say('已開啟測試草稿，尚未發布。');});
 $('resume').onclick=()=>run(async()=>{const d=await show();if(d.image_generation.state==='failed')await call({action:'next',draft_id:draftId});say('繼續製作未完成圖片…');await make();});
 try{const auth=check(await client.auth.getUser());if(auth.user?.app_metadata?.role!=='admin')throw Error('請先在管理後台登入管理員帳號。');
  const products=[];for(let n=0;;n+=500){const rows=check(await client.from('products').select('id,name,image_url,is_active,stock_quantity,product_variants(is_active,stock_quantity)').order('name').range(n,n+499));products.push(...rows);if(rows.length<500)break;}
  const eligible=products.filter(p=>p.is_active&&p.image_url&&(p.product_variants?.length?p.product_variants.some(v=>v.is_active&&v.stock_quantity>0):p.stock_quantity>0));$('product').replaceChildren(...eligible.map(p=>new Option(p.name,p.id)));
  const styles=check(await client.from('social_styles').select('id,name').eq('kind','product').order('name'));$('style').replaceChildren(...styles.map(s=>new Option(s.name,s.id)));const saved=styles.find(s=>s.name==='fréa 商品三圖組（測試）');if(saved)$('style').value=saved.id;
  $('app').hidden=false;await loadDrafts();draftId=new URLSearchParams(location.search).get('draft');if(draftId){$('drafts').value=draftId;await show();}say('已登入。請選擇商品並製作測試三圖組。');
 }catch(e){say(e.message||'無法開啟測試製作。');}
})();
