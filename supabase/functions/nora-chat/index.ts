import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { validateRequest, buildModelRequest, extractAnswer, extractSources, routeRole } from '../../../nora-core.mjs';
import { workspaceAction, ownedAssets, signedAssets, brandContext, generateVisual } from './workspace.ts';

const allowedOrigins = new Set(['https://www.thefrea.com', 'https://thefrea.com', 'https://fullray2026-bit.github.io']);

// Dependency injection allows the exact HTTP handler to be tested without API spend.
export function createHandler({ env, clientFactory, fetcher }: any) {
 return async (req: Request) => {
  const origin = req.headers.get('origin');
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
   'Access-Control-Allow-Methods': 'POST, OPTIONS', ...(origin && allowedOrigins.has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) };
  const out = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !allowedOrigins.has(origin)) return out({ error: '不允許此來源。' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return out({ error: '不支援此操作。' }, 405);
  let turn: any = null, db: any = null;
  try {
   const authorization = req.headers.get('authorization') || '';
   if (!authorization.startsWith('Bearer ')) return out({ error: '請先登入管理後台。' }, 401);
   const url = env('SUPABASE_URL');
   const publicKey = JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}').default || env('SUPABASE_ANON_KEY');
   const caller = clientFactory(url, publicKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
   const { data: auth, error: authError } = await caller.auth.getUser();
   if (authError || !auth.user) return out({ error: '登入已失效，請重新登入。' }, 401);
   if (auth.user.app_metadata?.role !== 'admin') return out({ error: '僅限管理員使用。' }, 403);
   const raw = await req.text();
   if (raw.length > 70000) return out({ error: '訊息過長。' }, 400);
   let body;
   try { body = validateRequest(JSON.parse(raw)); } catch { return out({ error: '請確認操作與訊息格式，訊息上限 4000 字。' }, 400); }
   const aiKey = env('OPENAI_API_KEY'), serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
   if (!serviceKey) return out({ error: '對話服務尚未設定完成。' }, 503);
   db = clientFactory(url, serviceKey, { auth: { persistSession: false } });
   const userId = auth.user.id;
   if (body.action === 'status') {
    const { error } = await db.from('nora_conversations').select('id').limit(1);
    const team=await db.from('nora_assets').select('id').limit(1);
    return out({ ready: !!aiKey && !error && !team.error, message: error || team.error ? '團隊工作區尚未設定完成。' : aiKey ? '團隊已就緒；搜尋與製圖會在使用時驗證服務。' : 'AI 服務尚未設定完成。',
     capabilities:{ai_configured:!!aiKey,photos:!team.error,research_configured:!!aiKey,image_configured:!!aiKey,meta_configured:!!((env('META_AD_ACCESS_TOKEN')||env('META_USER_ACCESS_TOKEN'))&&env('META_AD_ACCOUNT_ID')),email_delivery:false} });
   }
   const workspaceResult=await workspaceAction({body,db,caller,userId,env,fetcher});
   if(workspaceResult!==null)return out(workspaceResult);
   if (body.action === 'list') {
    const { data, error } = await db.from('nora_conversations').select('id,title,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    if (error) throw Error('storage');
    return out({ conversations: data });
   }
   if (body.action === 'load') {
    const { data: conversation, error } = await db.from('nora_conversations').select('id,title').eq('user_id', userId).eq('id', body.conversation_id).maybeSingle();
    if (error) throw Error('storage');
    if (!conversation) return out({ error: '找不到這段對話。' }, 404);
    const result = await db.from('nora_turns').select('id,user_text,assistant_text,status,created_at,role,mode,asset_ids,generated_asset_ids,sources,reference_text').eq('conversation_id', conversation.id).eq('user_id', userId).order('created_at', { ascending: true }).limit(100);
    if (result.error) throw Error('storage');
    const ids=[...new Set(result.data.flatMap((t: any)=>[...t.asset_ids,...t.generated_asset_ids]))];
    return out({ conversation, turns: result.data, assets:await signedAssets(db,await ownedAssets(db,userId,ids as string[])) });
   }
   if (!aiKey) return out({ error: 'AI 服務尚未設定完成，請聯絡管理員。' }, 503);
   const attached=await ownedAssets(db,userId,body.asset_ids||[]);
   const background=await brandContext(db);
   const assignedRole=routeRole(body.role||'nora',body.message,body.mode);
   const reservation = await db.rpc('nora_begin_turn', { p_user_id: userId, p_conversation_id: body.conversation_id || null, p_request_id: body.request_id, p_message: body.message.trim() });
   if (reservation.error) {
    const code = reservation.error.message;
    if (/rate_limit|daily_limit|pending_request/.test(code)) return out({ error: /daily_limit/.test(code) ? '今天已達 100 次對話上限，明天再繼續。' : '上一則訊息仍在處理，請稍候再試。' }, 429);
    if (/not_found/.test(code)) return out({ error: '找不到這段對話。' }, 404);
    if (/conversation_limit/.test(code)) return out({ error: '這段對話已達上限，請開始新對話。' }, 400);
    if (/invalid_request/.test(code)) return out({ error: '請開始新的訊息。' }, 400);
    throw Error('storage');
   }
   turn = reservation.data;
   // The RPC returns an existing request for safe recovery. An atomic claim
   // ensures that only one invocation sends that request to the model.
   if (turn.status === 'completed') return out({ conversation_id: turn.conversation_id, answer: turn.assistant_text, role:turn.role||'nora',sources:turn.sources||[], assets:await signedAssets(db,await ownedAssets(db,userId,turn.generated_asset_ids||[])) });
   if (turn.status === 'failed') return out({ conversation_id: turn.conversation_id, error: '此訊息先前未完成，請以新訊息重試。' }, 409);
   const claim = await db.from('nora_turns').update({ assistant_text: '',role:assignedRole,mode:body.mode||'chat',asset_ids:body.asset_ids||[],reference_text:body.reference_text||'' }).eq('id', turn.id).eq('user_id', userId).is('assistant_text', null).eq('status', 'pending').select('id');
   if (claim.error) throw Error('storage');
   if (!claim.data?.length) { turn = null; return out({ error: '訊息正在處理，請稍後重新載入對話。' }, 409); }
   const history = await db.from('nora_turns').select('user_text,assistant_text,status,created_at').eq('conversation_id', turn.conversation_id).eq('user_id', userId).eq('status', 'completed').order('created_at', { ascending: false }).limit(12);
   if (history.error) throw Error('storage');
   let answer, sources: any[]=[], generated: any[]=[];
   if(body.mode==='image') {
    const visual=await generateVisual({db,userId,turn,body,assets:attached,env,fetcher,context:background.context});answer=visual.answer;generated=visual.assets;
   } else {
    const research=body.mode==='research';
    const imageURLs=(await signedAssets(db,attached)).map((a: any)=>a.url);
    const request: any=buildModelRequest(research?(env('NORA_RESEARCH_MODEL')||'gpt-5.5'):(env('NORA_MODEL')||env('SOCIAL_COPY_MODEL')||'gpt-4o-mini'),history.data.reverse(),turn.user_text,{role:assignedRole,mode:body.mode||'chat',images:imageURLs,brandContext:background.context,referenceData:body.reference_text||''});
    if(research){request.tools=[{type:'web_search'}];request.tool_choice='required';request.max_tool_calls=2;request.max_output_tokens=5000;request.reasoning={effort:'low'};}
    const response = await fetcher('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${aiKey}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(research?85000:55000),body:JSON.stringify(request) });
    if (!response.ok) throw Error('upstream');
    const result=await response.json();answer=extractAnswer(result);sources=extractSources(result);
   }
   const saved = await db.from('nora_turns').update({ status: 'completed', assistant_text: answer,sources,generated_asset_ids:generated.map(a=>a.id) }).eq('id', turn.id).eq('user_id', userId).eq('status', 'pending').select('id');
   if (saved.error || !saved.data?.length) throw Error('storage');
   return out({ conversation_id: turn.conversation_id, answer,role:assignedRole,sources,assets:generated });
  } catch (error) {
   if (turn && db) {
    try { await db.from('nora_turns').update({ status: 'failed', assistant_text: null }).eq('id', turn.id).eq('status', 'pending'); }
    catch { /* Return the original error; stale reservations expire after two minutes. */ }
   }
   return out({ error: error instanceof Error && 'publicMessage' in error ? error.publicMessage : '這次操作未完成，請稍後重新載入。', ...(turn ? { conversation_id: turn.conversation_id } : {}) }, 503);
  }
 };
}
Deno.serve(createHandler({ env: (key: string) => Deno.env.get(key), clientFactory: createClient, fetcher: fetch }));
