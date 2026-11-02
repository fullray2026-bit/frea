(function () {
 'use strict';
 if(window.self!==window.top&&new URLSearchParams(location.search).get('embedded')==='1')document.body.classList.add('embedded');
 const $=id=>document.getElementById(id),names={nora:'fréa小芙',maya:'Maya',leon:'Leon',iris:'Iris',jack:'Jack'};
 let client,userId,authenticated=false,ready=false,busy=false,activeId=null,role='nora',turns=[],conversations=[],assets=[],artifacts=[],tasks=[],selected=[],brandRevision=0,capabilities={},artifactDirty=false,referenceText='',socialRequestId=null;
 const say=text=>{$('notice').textContent=text;$('globalNotice').textContent=text;};
 const node=(tag,text,className)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;};
 for(const [id,target]of [['uploadSource',$('photos').parentElement],['librarySource',$('libraryPhotos').parentElement]]){const label=node('label','照片來源'),select=node('select');select.id=id;select.add(new Option('我的實拍照片','real'));select.add(new Option('示意／AI 圖片','illustration'));label.append(select);target.after(label);}
 const handoff=node('button','交接到社群草稿');handoff.id='handoffArtifact';handoff.type='button';$('downloadArtifact').after(handoff);
 const safeURL=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
 function download(name,content,type='text/plain;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 function controls(){document.querySelectorAll('button,input,select,textarea').forEach(e=>{e.disabled=busy;});$('send').disabled=$('message').disabled=!ready||busy;$('export').disabled=busy||!turns.length;$('send').textContent=busy?'團隊處理中…':'傳送給 '+names[role];}
 async function api(body){const {data,error}=await client.functions.invoke('nora-chat',{body});if(!authenticated)throw Error('已登出，請重新登入。');if(error){let detail;try{detail=await error.context?.json();}catch{}if(detail?.conversation_id)activeId=detail.conversation_id;throw Error(detail?.error||'服務暫時無法連線，請稍後再試。');}if(data?.error)throw Error(data.error);return data;}
 async function run(task){if(busy||!authenticated)return;busy=true;say('');controls();try{await task();}catch(e){if(authenticated)say(e.message||'操作未完成。');}finally{busy=false;controls();}}
 async function panel(name){if($('socialDialog').open)$('socialDialog').close();
  document.querySelectorAll('[data-work-panel]').forEach(e=>{e.hidden=e.dataset.workPanel!==name;});document.querySelectorAll('[data-panel]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.panel===name)));
  if(name==='assets')await loadAssets();if(name==='artifacts')await loadArtifacts();if(name==='tasks')await loadTasks();
  if(name==='brand'){const r=await api({action:'brand_get'});brandRevision=r.revision;$('brandContext').value=r.context;$('brandVersion').textContent=' 版本 '+r.revision;}
  if(name==='publishing'&&!$('publishingFrame').getAttribute('src'))$('publishingFrame').src='admin-social.html?embedded=1&v=20261102';
  if(name==='connections')renderConnections();
 }
 function selectRole(value){role=value;if(role==='iris')$('workMode').value='research';else if(role!=='leon')$('workMode').value='chat';$('imageOptions').hidden=$('workMode').value!=='image';document.querySelectorAll('[data-role]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.role===role)));$('composerLabel').textContent='跟 '+names[role]+' 說說你的想法';controls();}
 function attachmentView(){$('attachments').replaceChildren();for(const id of selected){const asset=assets.find(a=>a.id===id);if(!asset)continue;const b=node('button',asset.name+' ×','attachment-tag');b.type='button';b.onclick=()=>{selected=selected.filter(v=>v!==id);attachmentView();};$('attachments').append(b);}}
 function mergeAsset(asset){const old=assets.findIndex(a=>a.id===asset.id);if(old>=0)assets[old]=asset;else assets.unshift(asset);}
 function appendMessage(speaker,text,options={}){
  const article=node('article',null,'message');article.dataset.role=speaker==='Sammi'?'user':'assistant';article.append(node('div',speaker==='fréa小芙'?speaker:speaker.toUpperCase(),'speaker'),node('div',text,'content'));
  for(const id of options.assetIds||[]){const a=assets.find(a=>a.id===id);if(!a||!safeURL(a.url))continue;const link=node('a');link.href=a.url;link.target='_blank';link.rel='noopener';const img=node('img');img.src=a.url;img.alt=a.name+(a.source_type==='illustration'?'（AI 示意）':'');img.className='message-image';link.append(img);article.append(link);if(a.source_type==='illustration')article.append(node('small','AI 示意圖片'));}
  if(options.referenceText){const d=node('details');d.append(node('summary','本次附上的報表／文字'),node('pre',options.referenceText));article.append(d);}
  if(options.sources?.length){const details=node('details');details.append(node('summary','研究來源（'+options.sources.length+'）'));for(const s of options.sources){if(!safeURL(s.url))continue;const a=node('a',s.title||s.url);a.href=s.url;a.target='_blank';a.rel='noopener noreferrer';details.append(a,node('br'));}article.append(details);}
  if(speaker!=='Sammi'&&options.completed){const actions=node('div',null,'button-row'),copy=node('button','複製文字','copy');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='已複製';}catch{say('請選取文字複製。');}};const save=node('button','存成作品','copy');save.type='button';save.onclick=()=>run(async()=>{if(artifactDirty)throw Error('請先儲存作品區目前的修改。');await panel('artifacts');fillArtifact({title:'',kind:options.role==='iris'?'seo':options.role==='jack'?'ads':'social',content:text,status:'draft'});$('artifactTitle').focus();});actions.append(copy,save);article.append(actions);}
  $('messages').append(article);
 }
 function renderMessages(){$('messages').replaceChildren();if(!turns.length){const card=node('div',null,'empty');card.append(node('h2','Sammi，慢慢來就好。'),node('p','選一位夥伴，帶上照片或想法。fréa小芙 會陪你把事情一步一步完成。'));$('messages').append(card);}for(const t of turns){appendMessage('Sammi',t.user_text,{assetIds:t.asset_ids||[],referenceText:t.reference_text});appendMessage(names[t.role]||'fréa小芙',t.status==='completed'?t.assistant_text:t.status==='pending'?'這則訊息仍在處理。稍後重新載入紀錄查看結果。':'這次回覆未完成，可以重新傳送。',{assetIds:t.generated_asset_ids||[],sources:t.sources,completed:t.status==='completed',role:t.role});}$('messages').scrollTop=$('messages').scrollHeight;$('starters').hidden=!!turns.length;controls();}
 async function list(){const r=await api({action:'list'});if(!authenticated)return;conversations=r.conversations||[];$('conversations').replaceChildren();for(const c of conversations){const b=node('button',c.title);b.type='button';b.setAttribute('aria-current',String(c.id===activeId));b.onclick=()=>run(async()=>{await loadConversation(c.id);await list();});$('conversations').append(b);}if(!conversations.length)$('conversations').textContent='第一段故事，從今天開始。';$('conversationTitle').textContent=conversations.find(c=>c.id===activeId)?.title||'今天，從哪個小地方開始？';controls();}
 async function loadConversation(id){const r=await api({action:'load',conversation_id:id});if(!authenticated)return;activeId=r.conversation.id;turns=r.turns||[];for(const a of r.assets||[])mergeAsset(a);renderMessages();}
 async function loadAssets(){const r=await api({action:'asset_list'});if(!authenticated)return;assets=r.assets||[];$('assetGrid').replaceChildren();if(!assets.length)$('assetGrid').append(node('p','還沒有照片。下次散步時拍一個讓你想停下來的片刻，就能從這裡開始。'));for(const a of assets){const card=node('article',null,'asset-card'),img=node('img');img.src=a.url;img.alt=a.name;img.loading='lazy';const b=node('button',selected.includes(a.id)?'已加入對話':'加入對話');b.type='button';b.onclick=()=>{if(selected.includes(a.id))selected=selected.filter(id=>id!==a.id);else if(selected.length<4)selected.push(a.id);else return say('一次最多選四張照片。');attachmentView();b.textContent=selected.includes(a.id)?'已加入對話':'加入對話';say('已選 '+selected.length+' 張；回到團隊對話後傳送。');};card.append(img,node('p',a.name),node('small',a.source_type==='illustration'?'AI 示意':'上傳照片'),b);$('assetGrid').append(card);}attachmentView();}
 async function uploadFiles(files,sourceType){
  if(selected.length+files.length>4)throw Error('一次最多附上四張照片，請先移除已選照片。');
  for(const file of files){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('請使用 JPG、PNG 或 WebP；HEIC 請先轉成 JPG。');if(file.size>20000000)throw Error('原始照片請小於 20 MB。');
   const bitmap=await createImageBitmap(file),scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.9));if(!blob||blob.size>5242880)throw Error('照片壓縮後仍超過 5 MB，請換一張較小的照片。');
   const id=crypto.randomUUID(),path=userId+'/'+id+'.jpg';const r=await client.storage.from('nora-media').upload(path,blob,{contentType:'image/jpeg',upsert:false});if(r.error)throw Error('照片上傳未完成，請重試。');const registered=await api({action:'asset_register',id,name:file.name.slice(0,155),mime_type:'image/jpeg',source_type:sourceType});mergeAsset(registered.asset);selected.push(id);
  }attachmentView();say('照片已保存，傳送訊息後團隊就能分析。');
 }
 function fillArtifact(a={}){$('artifactId').value=a.id||'';$('artifactRevision').value=a.revision||0;$('artifactTitle').value=a.title||'';$('artifactKind').value=a.kind||'social';$('artifactContent').value=a.content||'';$('artifactState').textContent=a.id?(a.status==='approved'?'已確認・版本 '+a.revision:'草稿・版本 '+a.revision):'尚未儲存';artifactDirty=false;}
 async function loadArtifacts(){const r=await api({action:'artifact_list'});if(!authenticated)return;artifacts=r.artifacts||[];$('artifactList').replaceChildren();for(const a of artifacts){const b=node('button',a.title+' · '+(a.status==='approved'?'已確認':'草稿'));b.type='button';b.onclick=()=>{if(artifactDirty)return say('目前有未儲存的修改，請先儲存作品。');fillArtifact(a);};$('artifactList').append(b);}const chosen=$('approvedCopy').value;$('approvedCopy').replaceChildren(new Option('無文字情境圖',''));for(const a of artifacts.filter(a=>a.status==='approved'))$('approvedCopy').add(new Option(a.title+'（版本 '+a.revision+'）',a.id));$('approvedCopy').value=chosen;}
 function taskFill(t={}){$('taskId').value=t.id||'';$('taskTitle').value=t.title||'';$('taskOwner').value=t.owner_role||'nora';$('taskDate').value=t.due_date||'';$('taskStatus').value=t.status||'todo';$('taskNotes').value=t.notes||'';}
 async function loadTasks(){const r=await api({action:'task_list'});if(!authenticated)return;tasks=r.tasks||[];$('taskList').replaceChildren();for(const t of tasks){const b=node('button',(t.due_date||'待定日期')+' · '+names[t.owner_role]+' · '+t.title+' · '+({todo:'未開始',doing:'進行中',done:'已完成'}[t.status]));b.type='button';b.onclick=()=>taskFill(t);$('taskList').append(b);}if(!tasks.length)$('taskList').append(node('p','把要做的事放在這裡，團隊與你一起掌握節奏。'));}
 function renderConnections(){$('connectionList').replaceChildren();for(const [title,message]of [['團隊對話',capabilities.ai_configured?'金鑰已設定；實際使用時驗證模型':'尚未設定 OpenAI'],['照片分析',capabilities.photos?'私人素材庫已就緒':'尚未部署素材庫'],['網頁研究',capabilities.research_configured?'已具備呼叫設定；使用時驗證搜尋權限':'尚未設定'],['視覺製作',capabilities.image_configured?'已具備呼叫設定；使用時驗證圖片模型':'尚未設定'],['Meta 廣告報表',capabilities.meta_configured?'帳號與權杖已設定；請按讀取驗證':'尚未設定；可匯入 CSV'],['電子報寄送','提供文案與郵件草稿下載；寄信平台尚未串接']]){const card=node('article',null,'connection-card');card.append(node('h3',title),node('p',message));$('connectionList').append(card);}}
 document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>run(()=>panel(b.dataset.panel)));
 document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>selectRole(b.dataset.role));
 document.querySelectorAll('#starters button').forEach(b=>b.onclick=()=>{$('message').value=b.textContent;$('message').focus();});
 $('newConversation').onclick=()=>run(async()=>{activeId=null;turns=[];selected=[];referenceText='';$('message').value='';attachmentView();renderMessages();await list();});
 $('reload').onclick=()=>run(async()=>{if(activeId)await loadConversation(activeId);await list();});
 $('workMode').onchange=()=>run(async()=>{$('imageOptions').hidden=$('workMode').value!=='image';if($('workMode').value==='image'){selectRole('leon');await loadArtifacts();}});
 for(const id of ['photos','libraryPhotos'])$(id).onchange=()=>{const files=[...$(id).files],sourceType=$(id==='libraryPhotos'?'librarySource':'uploadSource').value;$(id).value='';run(async()=>{await uploadFiles(files,sourceType);if(id==='libraryPhotos')await loadAssets();});};
 $('reportFile').onchange=()=>{const file=$('reportFile').files[0];$('reportFile').value='';if(!file)return;run(async()=>{if(file.size>100000)throw Error('報表檔案請小於 100 KB。');const content=await file.text();if(content.length>25000)throw Error('報表超過 25000 字，請保留重點欄位或分批匯入。');referenceText=content;$('message').value='請分析我附上的 '+file.name+' 報表，先確認期間、幣別與欄位，再提出建議。';selectRole('jack');say('報表已附上（'+content.length+' 字），按傳送後才交給 AI。');});};
 $('message').onkeydown=e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();$('composer').requestSubmit();}};
 $('composer').onsubmit=e=>{e.preventDefault();const message=$('message').value.trim();if(!message||!ready)return;run(async()=>{say($('workMode').value==='image'?'Leon 正在製圖，可能需要一至兩分鐘…':'團隊正在整理，完成後會自動保存。');
   const r=await api({action:'send',conversation_id:activeId,request_id:crypto.randomUUID(),message,role,mode:$('workMode').value,asset_ids:[...selected],artifact_id:$('approvedCopy').value||null,no_text:!$('approvedCopy').value,reference_text:referenceText});if(!authenticated)return;activeId=r.conversation_id;for(const a of r.assets||[])mergeAsset(a);turns.push({user_text:message,assistant_text:r.answer,status:'completed',role:r.role||role,asset_ids:[...selected],generated_asset_ids:(r.assets||[]).map(a=>a.id),sources:r.sources||[],reference_text:referenceText});$('message').value='';selected=[];referenceText='';attachmentView();renderMessages();say('已保存對話。');try{await list();}catch{say('回覆已保存；清單暫未更新，請重新載入紀錄。');}
  });};
 $('export').onclick=()=>download('frea-team-conversation.txt',turns.map(t=>'Sammi：\n'+t.user_text+'\n\n'+(names[t.role]||'fréa小芙')+'：\n'+(t.assistant_text||'（未完成）')+(t.sources?.length?'\n\n來源：\n'+t.sources.map(s=>s.title+' '+s.url).join('\n'):'')).join('\n\n——\n\n'));
 $('newArtifact').onclick=()=>{if(artifactDirty)return say('請先儲存目前作品。');fillArtifact();};
 $('artifactForm').oninput=()=>{artifactDirty=true;$('artifactState').textContent='有未儲存修改；儲存後需重新確認。';};
 $('artifactForm').onsubmit=e=>{e.preventDefault();run(async()=>{const r=await api({action:'artifact_save',id:$('artifactId').value||null,revision:Number($('artifactRevision').value),title:$('artifactTitle').value,kind:$('artifactKind').value,content:$('artifactContent').value});fillArtifact(r.artifact);await loadArtifacts();say('草稿已儲存。');});};
 $('approveArtifact').onclick=()=>run(async()=>{if(artifactDirty||!$('artifactId').value)throw Error('請先儲存目前文案，再確認版本。');const r=await api({action:'artifact_approve',id:$('artifactId').value,revision:Number($('artifactRevision').value)});fillArtifact(r.artifact);await loadArtifacts();say('此版文案已確認。');});
 $('visualFromArtifact').onclick=()=>run(async()=>{const id=$('artifactId').value,a=artifacts.find(a=>a.id===id);if(artifactDirty||a?.status!=='approved')throw Error('請先儲存並確認目前文案。');await panel('chat');selectRole('leon');$('workMode').value='image';$('imageOptions').hidden=false;$('approvedCopy').value=id;$('message').value='請依這份已確認文案製作符合 fréa 的視覺。';say('文案已帶入；可以加上參考照片，確認後按傳送製作圖片。');});
 $('downloadArtifact').onclick=()=>{const title=$('artifactTitle').value.replace(/[\r\n]/g,' ').trim()||'fréa作品',content=$('artifactContent').value;if(!content)return say('請先輸入作品內容。');if($('artifactKind').value==='email')download('frea-email-draft.eml','Subject: =?UTF-8?B?'+btoa(unescape(encodeURIComponent(title)))+'?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+btoa(unescape(encodeURIComponent(content))).match(/.{1,76}/g).join('\r\n'),'message/rfc822');else download('frea-'+$('artifactKind').value+'.txt',title+'\n\n'+content);};
 $('handoffArtifact').onclick=()=>run(async()=>{if(artifactDirty||!$('artifactId').value)throw Error('請先儲存作品。');await loadAssets();if(!assets.length)throw Error('請先上傳一張照片或製作圖片，再建立社群草稿。');$('socialAsset').replaceChildren(...assets.map(a=>new Option(a.name+(a.source_type==='illustration'?'（示意）':''),a.id)));$('socialTitle').value=$('artifactTitle').value.slice(0,24);$('socialFacebook').value=$('artifactContent').value.slice(0,5000);$('socialInstagram').value=$('artifactContent').value.slice(0,2200);socialRequestId=crypto.randomUUID();$('socialDialog').showModal();});
 $('closeSocial').onclick=()=>$('socialDialog').close();
 $('socialForm').onsubmit=e=>{e.preventDefault();run(async()=>{const r=await api({action:'social_prepare',request_id:socialRequestId,artifact_id:$('artifactId').value,revision:Number($('artifactRevision').value),asset_id:$('socialAsset').value,title:$('socialTitle').value,facebook_text:$('socialFacebook').value,instagram_text:$('socialInstagram').value});$('socialDialog').close();await panel('publishing');$('publishingFrame').src='admin-social.html?embedded=1&draft='+encodeURIComponent(r.draft_id);say('草稿已交接，請在社群管理核對圖片與文字，再送 LINE 審核。');});};
 $('brandForm').onsubmit=e=>{e.preventDefault();run(async()=>{const r=await api({action:'brand_save',context:$('brandContext').value,revision:brandRevision});brandRevision=r.revision;$('brandVersion').textContent=' 版本 '+r.revision;say('品牌資料已更新，夥伴的新回覆會使用這一版。');});};
 $('newTask').onclick=()=>taskFill();
 $('taskForm').onsubmit=e=>{e.preventDefault();run(async()=>{await api({action:'task_save',id:$('taskId').value||null,title:$('taskTitle').value,owner_role:$('taskOwner').value,due_date:$('taskDate').value||null,status:$('taskStatus').value,notes:$('taskNotes').value});taskFill();await loadTasks();say('待辦已保存。');});};
 $('calendarExport').onclick=()=>{const esc=s=>String(s).replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;'),lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//frea//fréa小芙 Studio//ZH'];for(const t of tasks.filter(t=>t.due_date&&t.status!=='done'))lines.push('BEGIN:VEVENT','UID:'+t.id+'@thefrea.com','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),'DTSTART;VALUE=DATE:'+t.due_date.replaceAll('-',''),'SUMMARY:'+esc(t.title),'DESCRIPTION:'+esc(names[t.owner_role]+'\n'+t.notes),'END:VEVENT');lines.push('END:VCALENDAR');download('frea-content-calendar.ics',lines.join('\r\n'),'text/calendar;charset=utf-8');};
 $('checkMeta').onclick=()=>run(async()=>{const r=await client.functions.invoke('social-meta-status',{body:{}});if(r.error)throw Error('FB／IG 讀取檢查未完成，請稍後再試。');$('metaMessage').textContent=r.data.message;});
 $('readAds').onclick=()=>run(async()=>{const r=await api({action:'meta_report'});download('frea-meta-last7days.json',JSON.stringify(r,null,2),'application/json');await panel('chat');selectRole('jack');const content='請分析這份實際取得的 Meta 近七天報表，先確認幣別與期間：\n'+JSON.stringify(r);$('message').value=content.length<=4000?content:'已下載 Meta 近七天報表，共 '+r.report.length+' 列。請告訴我應優先檢查哪些指標；我會分批貼上資料。';say(r.has_more?'報表超過 100 列，此次是部分資料；已下載，請核對輸入框內容。':'報表已下載，請核對輸入框中的內容後再傳送。');});

 function clearSession(){
  authenticated=ready=false;referenceText='';artifactDirty=false;activeId=null;userId=null;
  if($('socialDialog').open)$('socialDialog').close();
  turns=[];conversations=[];assets=[];artifacts=[];tasks=[];selected=[];
  $('workspace').hidden=$('teamControls').hidden=true;
  document.querySelectorAll('[data-work-panel]').forEach(e=>{e.hidden=true;});
  for(const id of ['messages','assetGrid','artifactList','taskList','conversations','attachments'])$(id).replaceChildren();
  document.querySelectorAll('textarea,input').forEach(e=>{e.value='';});
  $('publishingFrame').removeAttribute('src');
  $('authMessage').textContent='已登出，請重新登入管理後台。';
 }
 async function init(){
  try{
   if(!window.supabase||!window.freaSupabaseConfig)throw Error('無法載入登入服務。');
   client=window.supabase.createClient(window.freaSupabaseConfig.url,window.freaSupabaseConfig.publishableKey);
   const result=await client.auth.getUser();
   if(result.error||result.data.user?.app_metadata?.role!=='admin')throw Error('請先登入 fréa 管理後台。');
   userId=result.data.user.id;authenticated=true;
   client.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT'||(session?.user&&session.user.app_metadata?.role!=='admin'))clearSession();
   });
   $('authMessage').textContent='';$('workspace').hidden=false;$('teamControls').hidden=false;
   renderMessages();
   const status=await api({action:'status'});
   ready=!!status.ready;capabilities=status.capabilities||{};say(status.message);
   await list();await loadArtifacts();controls();
  }catch(error){(authenticated?say:value=>{$('authMessage').textContent=value;})(error.message);}
 }

 init();
})();
