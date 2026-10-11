import {verifyLine,ownerCommand} from './core.mjs';
// Public gateway is required by LINE. Every request is authenticated using HMAC before parsing.
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 try{
  const body=await req.text();if(body.length>262144)return new Response('Too large',{status:413});
  const secret=Deno.env.get('LINE_CHANNEL_SECRET');
  if(!secret)return new Response('Not configured',{status:503});
  if(!await verifyLine(body,req.headers.get('x-line-signature'),secret))return new Response('Invalid signature',{status:401});
  const data=JSON.parse(body);if(!Array.isArray(data.events))return new Response('Invalid payload',{status:400});
  const token=Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN'),owner=Deno.env.get('LINE_REVIEW_USER_ID');
  // Empty events are LINE's endpoint verification. No message is sent.
  for(const event of data.events){
   const command=ownerCommand(event,owner);
   if(!command||!event.replyToken||event.deliveryContext?.isRedelivery)continue;
   if(!token)return new Response('Not configured',{status:503});
   const text=command==='test'?'fréa LINE 連線測試成功。已確認這個個人 LINE 可接收審核通知。貼文審核與 FB／IG 自動發布尚未啟用。':'目前尚未開啟 LINE 貼文審核，這則回覆不會發布任何貼文。';
   const r=await fetch('https://api.line.me/v2/bot/message/reply',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({replyToken:event.replyToken,messages:[{type:'text',text}]}),signal:AbortSignal.timeout(8000)});
   if(!r.ok)return new Response('Reply unavailable',{status:502});
  }
  return new Response('OK');
 }catch{return new Response('Request failed',{status:500})}
});
