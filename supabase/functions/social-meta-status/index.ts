import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
// Read-only connection diagnostic. Never return upstream payloads or credentials.
const origins=new Set(['https://www.thefrea.com','https://thefrea.com','https://fullray2026-bit.github.io']);
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS',...(origin&&origins.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return out({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return out({error:'Method not allowed'},405);
 try{
  const authorization=req.headers.get('authorization')||'';
  if(!authorization.startsWith('Bearer '))return out({error:'請先登入管理後台。'},401);
  const key=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')||'';
  const client=createClient(Deno.env.get('SUPABASE_URL')!,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data,error}=await client.auth.getUser();
  if(error||!data.user)return out({error:'登入已失效。'},401);
  if(data.user.app_metadata?.role!=='admin')return out({error:'僅限管理員。'},403);
  const token=Deno.env.get('META_USER_ACCESS_TOKEN')?.trim();
  if(!token)return out({ok:false,message:'尚未找到 Meta 權杖，請確認密鑰名稱。'});
  const response=await fetch('https://graph.facebook.com/v26.0/477844252406455?fields=id,name,instagram_business_account',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(!response.ok)return out({ok:false,message:'Meta 帳號讀取未通過，請檢查權杖效期與授權。'});
  const page=await response.json();
  const ok=page.id==='477844252406455'&&page.instagram_business_account?.id==='17841426984648877';
  return out({ok,message:ok?'FB／IG 帳號讀取通過，與指定帳號一致。發布與每日排程尚未啟用。':'讀取結果與指定的 FB／IG 帳號不一致，請重新檢查授權。',checked_at:new Date().toISOString()});
 }catch{return out({ok:false,message:'連線檢查暫時未完成，請稍後再試。'},502)}
});

