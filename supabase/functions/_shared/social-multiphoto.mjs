export const imagePaths = job => job.payload?.image_paths?.length ? job.payload.image_paths : [job.payload?.image_path];
export function validateImages(job){const paths=imagePaths(job);if(paths.some(p=>!p)||new Set(paths).size!==paths.length||![1,3].includes(paths.length))throw Error('圖片組不完整');return paths;}
export function facebookBody(caption,ids){if(!ids.length)throw Error('缺少 Facebook 圖片');return {message:caption,...Object.fromEntries(ids.map((id,i)=>['attached_media['+i+']',JSON.stringify({media_fbid:id})]))};}
export function instagramBody(caption,ids){if(ids.length!==3)throw Error('Instagram 三圖尚未完成');return {media_type:'CAROUSEL',children:ids.join(','),caption};}
export function lineReview(job,urls){
 if(![1,3].includes(urls.length)||urls.some(u=>!u))throw Error('LINE 圖片組不完整');
 const labels=['生活情境圖','乾淨商品資訊圖','細節／使用感特寫圖'];
 const photo=urls.length===1?{type:'image',originalContentUrl:urls[0],previewImageUrl:urls[0]}:{type:'flex',altText:'fréa 三圖審核：'+job.payload.title,contents:{type:'carousel',contents:urls.map((url,i)=>({type:'bubble',hero:{type:'image',url,size:'full',aspectRatio:'1:1',aspectMode:'fit',action:{type:'uri',uri:url}},body:{type:'box',layout:'vertical',contents:[{type:'text',text:(i+1)+'. '+labels[i],weight:'bold',size:'md',wrap:true}]}}))}};
 const text=(job.is_dry_run?'【fréa 流程測試・不發布】':'【fréa 待審核】')+job.payload.title+'\n第 '+job.draft_revision+' 版\n\nFacebook\n'+job.payload.facebook_text+'\n\nInstagram\n'+job.payload.instagram_text;
 const chunks=[];for(let n=0;n<text.length;n+=4500)chunks.push({type:'text',text:text.slice(n,n+4500)});
 const button={type:'template',altText:'審核 '+job.payload.title,template:{type:'buttons',text:job.is_dry_run?'這是完整流程測試。確認只記錄測試通過，不會發布 FB／IG。':'請核對三張圖片與文案。確認後發布此版本，七天內有效。',actions:[{type:'postback',label:job.is_dry_run?'確認測試（不發布）':'確認發布 FB＋IG',data:'social:approve:'+job.review_token,displayText:job.is_dry_run?'確認三圖流程測試（不發布）':'確認發布：'+job.payload.title},{type:'postback',label:'略過這篇',data:'social:skip:'+job.review_token},{type:'uri',label:'開啟後台查看',uri:'https://www.thefrea.com/admin-social.html?draft='+job.draft_id}]}};
 const messages=[photo,...chunks,button];if(messages.length>5)throw Error('LINE 訊息過長');return messages;
}
