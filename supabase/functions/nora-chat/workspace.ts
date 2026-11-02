import { BRAND_CONTEXT, TEAM, UUID, imageSignature } from '../../../nora-core.mjs';

export class WorkspaceError extends Error {
 publicMessage: string;
 constructor(message: string) { super(message); this.publicMessage=message; }
}
const requireValue=(condition: unknown,message: string)=>{if(!condition)throw new WorkspaceError(message);};
const check=(result: any)=>{if(result.error)throw new WorkspaceError('儲存或讀取未完成，請重新整理再試。');return result.data;};
const text=(value: unknown,max: number)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export async function ownedAssets(db: any,userId: string,ids: string[]) {
 if(!ids.length)return [];
 const rows=check(await db.from('nora_assets').select('*').eq('user_id',userId).in('id',ids));
 requireValue(rows.length===new Set(ids).size,'找不到附件，或附件不屬於你。');
 return ids.map(id=>rows.find((a: any)=>a.id===id));
}
export async function signedAssets(db: any,assets: any[]) {
 return await Promise.all(assets.map(async a=>({...a,url:check(await db.storage.from('nora-media').createSignedUrl(a.path,600)).signedUrl})));
}
export async function brandContext(db: any) {
 const result=await db.from('nora_brand_state').select('context,revision').eq('brand_id','frea').maybeSingle();
 if(result.error)throw new WorkspaceError('品牌資料尚未設定完成。');
 return result.data||{context:BRAND_CONTEXT,revision:0};
}

export async function workspaceAction({body,db,caller,userId,env,fetcher}: any) {
 switch(body.action) {
  case 'brand_get':return await brandContext(db);
  case 'brand_save': {
   requireValue(text(body.context,18000)&&Number.isInteger(body.revision),'請填寫品牌資料。');
   const payload={context:body.context,updated_at:new Date().toISOString()};
   if(body.revision===0) {
    const result=await db.from('nora_brand_state').insert({brand_id:'frea',...payload}).select('revision');
    requireValue(!result.error,'品牌資料已有新版，請重新載入。');return {revision:1};
   }
   const rows=check(await db.from('nora_brand_state').update({...payload,revision:body.revision+1}).eq('brand_id','frea').eq('revision',body.revision).select('revision'));
   requireValue(rows.length===1,'品牌資料已有新版，請重新載入。');return rows[0];
  }
  case 'asset_register': {
   requireValue(UUID.test(body.id||'')&&text(body.name,160)&&['image/jpeg','image/png','image/webp'].includes(body.mime_type),'照片格式不正確。');
   const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[body.mime_type];
   const path=`${userId}/${body.id}.${ext}`;
   const blob=check(await db.storage.from('nora-media').download(path));
   requireValue(blob.size>0&&blob.size<=5242880,'照片上限為 5 MB。');
   requireValue(imageSignature(new Uint8Array(await blob.slice(0,16).arrayBuffer()),body.mime_type),'檔案內容不符合照片格式。');
   requireValue(['real','illustration'].includes(body.source_type),'請標明照片是實拍或示意。');
   const row={id:body.id,user_id:userId,path,name:body.name,mime_type:body.mime_type,source_type:body.source_type};
   check(await db.from('nora_assets').insert(row));
   return {asset:(await signedAssets(db,[row]))[0]};
  }
  case 'asset_list': {
   const rows=check(await db.from('nora_assets').select('*').eq('user_id',userId).order('created_at',{ascending:false}).limit(100));
   return {assets:await signedAssets(db,rows)};
  }
  case 'artifact_list': return {artifacts:check(await db.from('nora_artifacts').select('*').eq('user_id',userId).order('updated_at',{ascending:false}).limit(100))};
  case 'artifact_save': {
   requireValue(text(body.title,120)&&text(body.content,30000)&&['social','email','seo','ads','visual','research','plan'].includes(body.kind),'請填寫作品標題與內容。');
   const payload={title:body.title.trim(),content:body.content,kind:body.kind,status:'draft',approved_at:null,approved_revision:null,updated_at:new Date().toISOString()};
   if(!body.id)return {artifact:check(await db.from('nora_artifacts').insert({...payload,user_id:userId}).select('*').single())};
   requireValue(UUID.test(body.id)&&Number.isInteger(body.revision),'作品版本不正確。');
   const rows=check(await db.from('nora_artifacts').update({...payload,revision:body.revision+1}).eq('id',body.id).eq('user_id',userId).eq('revision',body.revision).select('*'));
   requireValue(rows.length===1,'作品已有新版，請重新載入再編輯。');return {artifact:rows[0]};
  }
  case 'artifact_approve': {
   requireValue(UUID.test(body.id||'')&&Number.isInteger(body.revision),'請先儲存作品。');
   const rows=check(await db.from('nora_artifacts').update({status:'approved',approved_revision:body.revision,approved_at:new Date().toISOString()}).eq('id',body.id).eq('user_id',userId).eq('revision',body.revision).select('*'));
   requireValue(rows.length===1,'作品已有新版，請重新載入再確認。');return {artifact:rows[0]};
  }
  case 'task_list':return {tasks:check(await db.from('nora_tasks').select('*').eq('user_id',userId).order('due_date',{ascending:true,nullsFirst:false}).limit(200))};
  case 'task_save': {
   requireValue(text(body.title,160)&&Object.hasOwn(TEAM,body.owner_role)&&['todo','doing','done'].includes(body.status),'請確認待辦內容。');
   requireValue(!body.due_date||(/^\d{4}-\d{2}-\d{2}$/.test(body.due_date)&&!Number.isNaN(Date.parse(body.due_date))&&new Date(body.due_date).toISOString().slice(0,10)===body.due_date),'請確認日期。');
   requireValue(typeof body.notes==='string'&&body.notes.length<=5000,'備註上限為 5000 字。');
   const payload={title:body.title.trim(),owner_role:body.owner_role,status:body.status,due_date:body.due_date||null,notes:body.notes};
   if(!body.id)return {task:check(await db.from('nora_tasks').insert({...payload,user_id:userId}).select('*').single())};
   requireValue(UUID.test(body.id),'待辦格式不正確。');
   return {task:check(await db.from('nora_tasks').update(payload).eq('id',body.id).eq('user_id',userId).select('*').single())};
  }
  case 'meta_report': {
   const token=env('META_AD_ACCESS_TOKEN')||env('META_USER_ACCESS_TOKEN'),account=(env('META_AD_ACCOUNT_ID')||'').replace(/^act_/,'');
   requireValue(token&&/^\d{5,30}$/.test(account),'尚未設定廣告帳號與讀取授權；可以先匯入 Meta 匯出的 CSV 報表。');
   const query=new URLSearchParams({fields:'campaign_name,spend,impressions,clicks,ctr,cpc,cpm,actions,action_values,purchase_roas,date_start,date_stop,account_currency',date_preset:'last_7d',level:'campaign',limit:'100'});
   const response=await fetcher(`https://graph.facebook.com/v26.0/act_${account}/insights?${query}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
   requireValue(response.ok,'廣告報表讀取未通過，請檢查帳號與 ads_read 授權，或先匯入 CSV。');
   const result=await response.json();
   return {report:result.data||[],has_more:!!result.paging?.next,period:'最近七天；日期與幣別以各列回傳值為準',fetched_at:new Date().toISOString()};
  }
  case 'social_prepare': {
   requireValue(UUID.test(body.request_id||'')&&UUID.test(body.artifact_id||'')&&UUID.test(body.asset_id||''),'請先選擇作品與照片。');
   requireValue(text(body.title,24)&&text(body.facebook_text,5000)&&text(body.instagram_text,2200),'請完成標題與 FB／IG 文案。');
   const artifact=check(await db.from('nora_artifacts').select('id,revision,content').eq('id',body.artifact_id).eq('user_id',userId).maybeSingle());
   requireValue(artifact&&artifact.revision===body.revision,'作品版本已變更，請重新載入。');
   const existing=await caller.from('social_drafts').select('id').eq('id',body.request_id).maybeSingle();
   if(existing.data)return {draft_id:existing.data.id};
   const asset=(await ownedAssets(db,userId,[body.asset_id]))[0],blob=check(await db.storage.from('nora-media').download(asset.path));
   const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[asset.mime_type],path=`${userId}/nora-${body.request_id}.${ext}`;
   const upload=await db.storage.from('social-drafts').upload(path,blob,{contentType:asset.mime_type,upsert:false});
   requireValue(!upload.error||upload.error.message==='The resource already exists','交接照片未完成，請重試。');
   const material=check(await caller.from('social_materials').insert({title:body.title,notes:artifact.content.slice(0,10000),photo_paths:[path],source_type:asset.source_type,status:'ready'}).select('id').single());
   const draft=check(await caller.from('social_drafts').insert({id:body.request_id,kind:'life',material_id:material.id,product_id:null,product_snapshot:{name:body.title,location:'',notes:artifact.content.slice(0,10000),source_type:asset.source_type},title:body.title,facebook_text:body.facebook_text,instagram_text:body.instagram_text,image_path:path,background_path:path,generation_mode:'manual',style_snapshot:{},created_by:userId}).select('id').single());
   return {draft_id:draft.id};
  }
 }
 return null;
}

export async function generateVisual({db,userId,turn,body,assets,env,fetcher,context=''}: any) {
 let approvedCopy='',approvedRevision: number|null=null;
 if(body.no_text!==true) {
  const artifact=check(await db.from('nora_artifacts').select('*').eq('id',body.artifact_id).eq('user_id',userId).maybeSingle());
  requireValue(artifact?.status==='approved'&&artifact.approved_revision===artifact.revision,'請先確認目前版本的文案，再製作圖片。');
  approvedCopy=artifact.content;
  requireValue(approvedCopy.length<=6000,'圖片文案過長，請另存一份 6000 字以內的上版文案並確認。');
  approvedRevision=artifact.revision;
 }
 const prompt=`Create a visual for fréa, a Japanese lifestyle curation brand based in Fukuoka. Calm everyday scenes, natural light and restrained composition. Current brand data for visual context only: ${String(context).slice(0,18000)}\nUser direction: ${turn.user_text}\n${body.no_text===true?'NO added text, logos, captions or watermarks. Pure illustrative mood visual.':'Use ONLY this approved copy without rewriting its claims or adding claims: '+approvedCopy}\n${assets.length?'Reference images are provided; preserve identifiable product geometry, branding, color and proportions. Do not invent ingredients or packaging.':'This is an AI illustration, never evidence of a real visit, product, shop, endorsement, or manufacturing process.'}`;
 const model=env('NORA_IMAGE_MODEL')||'gpt-image-2.5-flare';
 let endpoint='https://api.openai.com/v1/images/generations',requestBody: any,headers: any={Authorization:`Bearer ${env('OPENAI_API_KEY')}`};
 if(assets.length) {
  endpoint='https://api.openai.com/v1/images/edits';const form=new FormData();
  for(const a of assets){const blob=check(await db.storage.from('nora-media').download(a.path));form.append('image[]',blob,a.name);}
  for(const [key,value] of Object.entries({model,prompt,n:'1',size:'1024x1536',quality:'medium',output_format:'png'}))form.set(key,String(value));requestBody=form;
 } else {headers['Content-Type']='application/json';requestBody=JSON.stringify({model,prompt,n:1,size:'1024x1536',quality:'medium',output_format:'png'});}
 const response=await fetcher(endpoint,{method:'POST',headers,body:requestBody,signal:AbortSignal.timeout(110000)});
 requireValue(response.ok,'圖片服務尚未完成，請檢查圖片模型權限或稍後再試。');
 const result=await response.json(),base64=result.data?.[0]?.b64_json;
 requireValue(typeof base64==='string'&&base64.length<12000000,'圖片回傳不完整，請重試。');
 const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 requireValue(bytes.length<=5242880&&imageSignature(bytes,'image/png'),'圖片超過儲存限制或格式不符，請重試。');
 if(approvedRevision!==null){const current=check(await db.from('nora_artifacts').select('revision,status').eq('id',body.artifact_id).eq('user_id',userId).single());requireValue(current.revision===approvedRevision&&current.status==='approved','製圖期間文案已變更，請重新確認文案再製圖。');}
 const id=crypto.randomUUID(),path=`${userId}/${id}.png`;
 check(await db.storage.from('nora-media').upload(path,bytes,{contentType:'image/png',upsert:false}));
 const asset={id,user_id:userId,path,name:'fréa-AI-視覺.png',mime_type:'image/png',source_type:'illustration'};
 check(await db.from('nora_assets').insert(asset));
 return {answer:approvedCopy?'圖片已製作並存入素材庫，使用的是已確認文案。請核對文字與商品細節後再使用；此圖為 AI 製作。':'無文字情境圖已製作並存入素材庫。此圖為 AI 示意，不能當作真實到訪或商品實拍。',assets:await signedAssets(db,[asset])};
}
