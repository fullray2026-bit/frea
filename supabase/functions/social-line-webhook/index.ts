import {verifyLine,reviewDecision} from './core.mjs';
import {db,env,ok} from '../_shared/pipeline.ts';
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{
  const raw=await req.text();if(raw.length>262144)return new Response('Too large',{status:413});if(!await verifyLine(raw,req.headers.get('x-line-signature'),env('LINE_CHANNEL_SECRET')))return new Response('Invalid signature',{status:401});
  const data=JSON.parse(raw);if(!Array.isArray(data.events))return new Response('Invalid payload',{status:400});
  for(const event of data.events){
   if(event.source?.type!=='user'||event.source.userId!==env('LINE_REVIEW_USER_ID'))continue;
   let text='';
   if(event.type==='postback'){
    const decision=reviewDecision(event,env('LINE_REVIEW_USER_ID'));if(!decision)continue;
    text=ok(await db.rpc('social_review',decision));
   }else if(event.type==='message'&&event.message?.type==='text'){
    const command=event.message.text.trim().toLowerCase();if(command==='連線測試')text='fréa LINE 連線正常。排程製作後會傳送圖片與文案；請使用每篇通知下方的「確認發布 FB＋IG」按鈕，只有你確認的版本才會發布。';else if(command==='ok'||command==='可以')text='請點該篇通知下方的「確認發布 FB＋IG」按鈕，確保核准的是正確的圖片與版本。這則文字回覆不會發布。';else continue;
   }else continue;
   if(event.replyToken&&!event.deliveryContext?.isRedelivery)await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{Authorization:'Bearer '+env('LINE_CHANNEL_ACCESS_TOKEN'),'Content-Type':'application/json'},body:JSON.stringify({replyToken:event.replyToken,messages:[{type:'text',text}]}),signal:AbortSignal.timeout(8000)}).catch(()=>{});
  }
  return new Response('OK');
 }catch{return new Response('Request failed',{status:500})}
});
