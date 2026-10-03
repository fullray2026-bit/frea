import { translateProduct } from './translate.mjs';
import { sourceURL, parseProduct } from './parser.mjs';
const origins=new Set(['https://www.thefrea.com','https://thefrea.com','https://fullray2026-bit.github.io']);
Deno.serve(async req=>{
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
  const out=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers});
  if(origin&&!origins.has(origin))return out({error:'Origin not allowed'},403);
  if(req.method==='OPTIONS')return new Response(null,{headers});
  if(req.method!=='POST')return out({error:'Method not allowed'},405);
  try {
    const authorization=req.headers.get('authorization');
    if(!authorization?.startsWith('Bearer '))return out({error:'請先登入管理員帳號。'},401);
    const key=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')||'';
    const auth=await fetch(Deno.env.get('SUPABASE_URL')+'/auth/v1/user',{headers:{authorization,apikey:key},signal:AbortSignal.timeout(10000)});
    if(!auth.ok)return out({error:'登入已失效，請重新登入。'},401);
    const user=await auth.json();if(user.app_metadata?.role!=='admin')return out({error:'僅限管理員使用。'},403);
    const body=await req.text();if(body.length>4096)throw new Error('網址過長。');
    let url=sourceURL(JSON.parse(body).url);let response:Response|undefined;
    const signal=AbortSignal.timeout(18000);
    for(let i=0;i<4;i++) {
      response=await fetch(url,{redirect:'manual',signal,headers:{Accept:'text/html','User-Agent':'FreaProductImport/1.0'}});
      if([301,302,303,307,308].includes(response.status)){const target=response.headers.get('location');await response.body?.cancel();if(!target)throw new Error('來源轉址失敗。');url=sourceURL(new URL(target,url).href);continue;}break;
    }
    if(!response?.ok)throw new Error('來源網站暫時無法讀取或限制擷取，請手動填寫。');
    if(!response.headers.get('content-type')?.includes('text/html')){await response.body?.cancel();throw new Error('請提供商品網頁網址。');}
    const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>3_000_000){await reader.cancel();throw new Error('來源網頁過大，請手動填寫。');}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
    const charset=response.headers.get('content-type')?.match(/charset=([^;\s]+)/i)?.[1]||'utf-8';
    const result=parseProduct(new TextDecoder(charset).decode(bytes),url.href);
    return out(await translateProduct(result,Deno.env.get('OPENAI_API_KEY'),Deno.env.get('OPENAI_TRANSLATION_MODEL')||'gpt-4o-mini'));
  }catch(error){return out({error:error instanceof Error && !['TimeoutError','AbortError'].includes(error.name)?error.message:'擷取逾時，請稍後再試或手動填寫。'},400);}
});
