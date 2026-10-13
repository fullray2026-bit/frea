// Admin-only test drafts. No LINE, Meta, or publishing calls.
import {createClient} from 'npm:@supabase/supabase-js@2.112.3';
import {db,ok,eligible,writeCopy,asset,signed,put,request,env} from '../_shared/pipeline.ts';
import {slots,imagePrompt} from '../_shared/three-images.ts';
import {productInformation} from '../_shared/product-information.ts';
const origins=new Set(['https://www.thefrea.com','https://thefrea.com','https://fullray2026-bit.github.io']);
const uuid=(v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
async function generate(d:any,slot:number,lock:string){
 try{
  let path:string;
  if(slot===1){path=await productInformation(d,lock);}else{
  const original=await asset(d.product_snapshot.image_url),form=new FormData();
  form.set('model',Deno.env.get('SOCIAL_IMAGE_MODEL')||'gpt-image-1.5');form.set('size','1024x1024');form.set('quality','medium');form.set('input_fidelity','high');form.set('output_format','jpeg');form.set('output_compression','90');form.set('n','1');
  form.append('image[]',new Blob([original.bytes],{type:original.type}),'product.'+original.type.split('/')[1]);
  if(d.style_snapshot.reference_path){const mood=await asset(await signed(d.style_snapshot.reference_path));form.append('image[]',new Blob([mood.bytes],{type:mood.type}),'mood.'+mood.type.split('/')[1]);}
  form.set('prompt',imagePrompt(slot,d.product_snapshot,d.style_snapshot,d.image_generation.product_type));
  const result=await (await request('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+env('OPENAI_API_KEY')},body:form},130000)).json();
  if(result.data?.length!==1||!result.data[0].b64_json)throw Error('圖片回應不完整');
  const bytes=Uint8Array.from(atob(result.data[0].b64_json),c=>c.charCodeAt(0));
  path=await put('three-images/'+d.id+'/'+slots[slot].key+'-'+lock+'.jpg',bytes);
  }
  const paths=[...d.image_paths];paths[slot]=path;
  const progress={...d.image_generation,state:paths.filter(Boolean).length===3?'complete':'ready',lock:null,error:null};
  const saved=ok(await db.from('social_drafts').update({image_paths:paths,image_path:paths[0]||null,image_generation:progress}).eq('id',d.id).eq('revision',d.revision).eq('is_test',true).select());
  if(!saved.length)throw Error('草稿版本已變更，未覆寫新版本');
 }catch(e){
  console.error('Three image test failed:',e instanceof Error?e.message:'unknown');
  await db.from('social_drafts').update({image_generation:{...d.image_generation,state:'failed',lock:null,error:'第'+(slot+1)+'張製作未完成，請重試；已完成圖片會保留。'}}).eq('id',d.id).eq('revision',d.revision).eq('is_test',true);
 }
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers={'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const out=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return out({error:'Origin not allowed'},403);if(req.method==='OPTIONS')return new Response(null,{headers});if(req.method!=='POST')return out({error:'Method not allowed'},405);
 try{
  const auth=req.headers.get('authorization')||'';if(!auth.startsWith('Bearer '))return out({error:'請登入後台'},401);
  const key=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')||'';
  const userClient=createClient(env('SUPABASE_URL'),key,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
  const {data,error}=await userClient.auth.getUser();if(error||!data.user)return out({error:'登入已失效'},401);if(data.user.app_metadata?.role!=='admin')return out({error:'僅限管理員'},403);
  const raw=await req.text();if(raw.length>3000)return out({error:'請求過長'},400);const body=JSON.parse(raw);
  if(body.action==='start'){
   if(!uuid(body.product_id)||!uuid(body.style_id)||!['food','object','package'].includes(body.product_type))return out({error:'請選擇商品、風格與類型'},400);
   const product=ok(await userClient.from('products').select('*,product_variants(is_active,stock_quantity)').eq('id',body.product_id).single());
   const style=ok(await userClient.from('social_styles').select('*').eq('id',body.style_id).eq('kind','product').single());
   if(!eligible(product))return out({error:'商品缺貨、未上架或缺少照片'},400);
   const recent=ok(await db.from('social_drafts').select('id').eq('is_test',true).eq('created_by',data.user.id).gte('created_at',new Date(Date.now()-60000).toISOString()));if(recent.length)return out({error:'剛剛已建立測試草稿，請從清單繼續'},409);
   const copy=await writeCopy('product',product,style);
   const d=ok(await db.from('social_drafts').insert({kind:'product',product_id:product.id,product_snapshot:product,...copy,style_snapshot:style,generation_mode:'ai',created_by:data.user.id,is_test:true,status:'draft',image_paths:[],image_generation:{state:'ready',product_type:body.product_type}}).select().single());
   return out({draft_id:d.id});
  }
  if(!uuid(body.draft_id))return out({error:'請選擇測試草稿'},400);
  const d=ok(await userClient.from('social_drafts').select('*').eq('id',body.draft_id).eq('is_test',true).eq('kind','product').single());
  if(body.action==='status'){const urls=await Promise.all([0,1,2].map(async i=>d.image_paths[i]?await signed(d.image_paths[i]):null));return out({draft:d,urls,slots:slots.map(s=>s.label)});}
  if(body.action!=='next')return out({error:'不支援的操作'},400);
  const slot=[0,1,2].find(i=>!d.image_paths[i]);if(slot===undefined)return out({complete:true});
  if(d.image_generation.state==='generating'&&Date.now()-Date.parse(d.image_generation.started_at)<240000)return out({running:true});
  const product=ok(await userClient.from('products').select('*,product_variants(is_active,stock_quantity)').eq('id',d.product_id).single());
  if(!eligible(product)||['name','image_url','specification','description','usage_flavor'].some(k=>String(product[k]??'')!==String(d.product_snapshot[k]??'')))return out({error:'商品資料已變更，請重新建立測試草稿'},409);
  const lock=crypto.randomUUID(),claimed=ok(await db.from('social_drafts').update({image_generation:{...d.image_generation,state:'generating',slot,lock,started_at:new Date().toISOString(),error:null}}).eq('id',d.id).eq('revision',d.revision).eq('is_test',true).select());
  if(!claimed.length)return out({running:true});
  EdgeRuntime.waitUntil(generate(claimed[0],slot,lock));return out({running:true,slot});
 }catch(e){console.error('Three images request:',e instanceof Error?e.message:'unknown');return out({error:'測試製作服務未完成，請重新登入或稍後重試'},400);}
});
