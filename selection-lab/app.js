import {recommendDemo} from './engine.js';
import './widget.js?v=20261007-clean';
const $=s=>document.querySelector(s);
let token='',current=null,lastQuery='';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog=null,liveRows=[];
async function init(){const r=await fetch('./catalog.json');catalog=await r.json();applyLive();}
function applyLive(){if(!catalog)return;catalog.products=catalog.products.map(p=>{const live=liveRows.find(x=>x.slug===p.slug);return {...p,price:Number(live?.price||0),currency:live?.currency||'TWD',activeSnapshot:!!live?.is_active,stockSnapshot:Number(live?.stock_quantity||0),image:live?.image_url||'',name:{zh:live?.name||p.name.zh},productUrl:location.origin+'/index.html#search/'+encodeURIComponent(live?.name||p.name.zh)}})}
window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;if(e.data?.type==='frea-lab-products'&&Array.isArray(e.data.products)){liveRows=e.data.products;applyLive()}});
parent.postMessage({type:'frea-lab-ready'},location.origin);
async function post(url,data){if(url==='/api/event')return {saved:true};if(url!=='/api/recommend')throw Error('此設定不適用於公開測試版');if(!catalog||!liveRows.length)throw Error('商品資料尚在載入，請稍後再試。');const start=performance.now();const r=recommendDemo(catalog,data.query,'zh');return {...r,requestId:crypto.randomUUID(),latencyMs:Math.round(performance.now()-start)}}
$('#settingsToggle').onclick=()=>{$('#settings').hidden=!$('#settings').hidden};
$('#catalogToggle').onclick=()=>{$('#catalogPanel').hidden=!$('#catalogPanel').hidden;if(!$('#catalogPanel').hidden)$('#catalogPanel').scrollIntoView({behavior:'smooth'})};
$('#settingsForm').onsubmit=async e=>{e.preventDefault();try{await post('/api/settings',{key:$('#apiKey').value,model:$('#model').value});$('#apiKey').value='';$('#settingsStatus').textContent='連線設定已保存於本次伺服器記憶體；請用 AI 模式測試。'}catch(err){$('#settingsStatus').textContent=err.message}};
$('#mode').onchange=()=>{$('#modeNote').textContent=$('#mode').value==='demo'?'規則展示模式：用於驗證流程，不代表 AI 成效。':'AI 模式：僅從本次 81 件商品選擇，錯誤時不以展示結果替代。'};
document.querySelectorAll('[data-query]').forEach(b=>b.onclick=()=>{$('#query').value=b.dataset.query;$('#query').focus()});
const labels={zh:{title:'為你挑選',view:'查看商品 ↗',cart:'加入測試購物車',purchase:'模擬購買',added:'已加入測試購物車',bought:'已記錄模擬購買',currency:'台幣／單件',catalog:'商品快照',demo:'規則展示 · 非 AI',llm:'OpenAI 推薦',conditions:'解析條件',none:'未指定',budget:'單件預算',recipient:'送禮對象',uses:'用途／偏好',evidence:'理由依據：用途、標籤及價格',link:'商品連結開啟官網搜尋結果。'},ja:{title:'おすすめの商品',view:'商品を見る ↗',cart:'テストカートに追加',purchase:'購入を模擬',added:'テストカートに追加済み',bought:'模擬購入を記録しました',currency:'台湾ドル／1点',catalog:'商品スナップショット',demo:'ルール展示・AIではありません',llm:'OpenAI 推薦',conditions:'解析した条件',none:'指定なし',budget:'1点の予算',recipient:'贈る相手',uses:'用途・好み',evidence:'根拠：用途・タグ・価格',link:'商品リンクは本サイトの検索結果です。PoC から注文は行いません。'}};
function reviewDetails(p){const note=String(p.constraints||'').replace(/(?:notes|description|usage_flavor|specification)：/g,'');if(!note||/^未記載|^尚未找到/.test(note))return '';return '<details class="review"><summary>使用注意事項</summary><p>'+esc(note)+'</p><p>請以商品實際標示為準。</p></details>';}
function giftChoices(r){
 if(r.conditions.clarificationReason!=='gift_preferences')return '';
 const ja=r.language==='ja', names=ja?['コーヒー','マグ・ボトル','ハンドクリーム','フレグランス']:['咖啡','杯子／水瓶','護手霜','香氛'];
 return '<div class="gift-choices">'+names.map(n=>'<button type="button" data-gift="'+esc(n)+'">'+esc(n)+'</button>').join('')+'</div>';
}
function render(r){
current=r;const l=labels[r.language],ja=r.language==='ja';
const c=r.conditions;
$('#result').lang=ja?'ja':'zh-Hant';
$('#result').innerHTML='<div class="result-head"><h2>'+l.title+'</h2><p>'+esc(r.message.replace("fréa 測試商品","fréa 商品"))+'</p>'+giftChoices(r)+(r.giftNote?'<p class="note">'+esc(r.giftNote)+'</p>':'')+'</div><div class="cards">'+r.recommendations.map(({product:p,reason})=>'<article class="card" data-id="'+p.id+'"><img src="'+esc(p.image)+'" alt="'+esc(p.name[r.language])+'"><div class="copy"><span class="brand">'+esc(p.brand)+'</span><h3>'+esc(p.name[r.language])+'</h3><p class="price">NT$'+p.price.toLocaleString()+' <small>'+l.currency+'</small></p><p class="reason">'+esc(reason)+'</p>'+reviewDetails(p,ja)+'<div class="actions"><a href="'+esc(p.productUrl)+'" target="_blank" rel="noopener noreferrer" data-action="click">'+l.view+'</a></div><p class="event-status" role="status"></p></div></article>').join('')+'</div>';
$('#result').querySelectorAll('[data-gift]').forEach(el=>el.onclick=()=>{$('#query').value=el.dataset.gift;$('#queryForm').requestSubmit()});
$('#result').querySelectorAll('[data-action]').forEach(el=>el.onclick=async e=>{
 const card=el.closest('.card'),type=el.dataset.action;
 if(type==='click')e.preventDefault();
 try{await post('/api/event',{eventId:crypto.randomUUID(),requestId:r.requestId,productId:card.dataset.id,type});
 if(type==='click'){window.open(el.href,'_blank','noopener,noreferrer');return}
 el.disabled=true;card.querySelector('.event-status').textContent=type==='cart'?l.added:l.bought;
 if(type==='cart')card.querySelector('[data-action="purchase"]').disabled=false;
 }catch(err){card.querySelector('.event-status').textContent=err.message}});
}
$('#queryForm').onsubmit=async e=>{e.preventDefault();const ja=$('#language').value==='ja'||($('#language').value==='auto'&&/[ぁ-んァ-ヶ]/.test($('#query').value));$('#status').textContent=ja?'条件を確認しています…':'正在核對商品與條件…';$('#submit').disabled=true;$('#result').innerHTML='';try{const input=$('#query').value.trim();
 const reset=/重新|重來|改找|改成|別の|やり直し/.test(input);
 let context=reset?'':lastQuery;
 if(/預算|予算|[0-9]+\s*(元|台湾ドル)/.test(input))context=context.replace(/(?:預算|予算)?\s*[0-9,]+\s*(?:元|台湾ドル|以內|以内)?/g,'');
 lastQuery=(context?context+'；':'')+input;
 if(lastQuery.length>1000)lastQuery=input;
 $('#conversation').insertAdjacentHTML('beforeend','<p class="user-message">'+esc(input)+'</p>');
 $('#chatIntro').classList.add('compact');$('#topics').open=false;
 const r=await post('/api/recommend',{query:lastQuery,mode:'demo',language:'zh'});render(r);$('#query').value='';$('#status').textContent='';$('#result').scrollIntoView({block:'start',behavior:'smooth'})}catch(err){$('#status').textContent=err.message}finally{$('#submit').disabled=false}};
document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement){e.target.alt+=' — 圖片暫時無法載入';e.target.style.opacity='.5'}},true);
init().catch(()=>{$('#status').textContent='測試服務未啟動，請重新啟動本機 PoC。'});

$('#newChat').onclick=()=>{lastQuery='';current=null;$('#result').innerHTML='';$('#conversation').innerHTML='';$('#query').value='';$('#chatIntro').classList.remove('compact');$('#query').focus()};

const topics=[
 ['通勤隨行','通勤','想找通勤用的哪一類商品？例如水瓶或提袋。單件預算大約多少？','zh'],
 ['日常咖啡','咖啡','喜歡淺焙、深焙，或有特別喜歡的風味嗎？單件預算大約多少？','zh'],
 ['生日賀禮','生日送禮','想送給誰呢？單件預算大約多少？也可以告訴我對方喜歡咖啡、器物或其他類型。','zh'],
 ['喬遷賀禮','喬遷送禮','想送給誰、單件預算大約多少？對方喜歡下廚、咖啡，還是日常器物？','zh'],
 ['升遷賀禮','升遷送禮','想送給誰、單件預算大約多少？對方偏好辦公隨行用品、咖啡或其他選物？','zh']
];
$('#chatIntro').insertAdjacentHTML('afterend','<details id="topics" open><summary>換個主題</summary><div class="topic-grid">'+topics.map((t,i)=>'<button type="button" data-topic="'+i+'">'+t[0]+'</button>').join('')+'</div></details>');
const previousReset=$('#newChat').onclick;
$('#newChat').onclick=()=>{previousReset();$('#topics').open=true;$('#language').value='zh';$('#status').textContent=''};
document.querySelectorAll('[data-topic]').forEach(button=>button.onclick=()=>{
 if($('#submit').disabled)return;
 const [title,context,prompt,lang]=topics[Number(button.dataset.topic)];
 $('#newChat').click();lastQuery=context;$('#language').value=lang;
 $('#chatIntro').classList.add('compact');$('#topics').open=false;
 $('#conversation').innerHTML='<p class="user-message">'+esc(title)+'</p><p class="topic-prompt" lang="'+(lang==='ja'?'ja':'zh-Hant')+'">'+esc(prompt)+'</p>';
 $('#query').focus();
});
