const q=s=>document.querySelector(s);
const intro=q('.intro'), form=q('#queryForm'), result=q('#result'), status=q('#status'), settings=q('#settings');
document.body.insertAdjacentHTML('beforeend',`<button id="chatLauncher" aria-expanded="false" aria-controls="chatDialog">今天想找什麼？ <span aria-hidden="true">↗</span></button><dialog id="chatDialog" aria-labelledby="chatTitle"><div class="chat-top"><strong id="chatTitle"><img class="chat-logo" src="frea-logo.png" alt=""><span class="chat-wordmark">fréa</span><span class="chat-title-text">選品實驗室（測試版）</span></strong><button id="newChat" type="button">重新開始</button><button id="chatClose" type="button" aria-label="關閉對話框">×</button></div><div id="chatScroll"><div id="chatIntro"><p class="eyebrow">FUKUOKA, JAPAN · PROOF OF CONCEPT</p><h1>從你的日常，<br>找到合適的選物。</h1><p>說說你正在尋找什麼。<br><span class="note">測試版目前支援繁體中文搜尋。</span></p></div><div id="conversation"></div></div><div id="chatComposer"></div></dialog>`);
q('#chatScroll').append(result);q('#chatComposer').append(status,form);
settings.append(q('.form-top'));q('#examples').hidden=true;
q('#modeNote').textContent='規則展示模式 · 非 AI';
q('#query').placeholder='說說你的需求，也可以接著補充…';q('#query').rows=2;
q('#queryLabel').textContent='今天想找什麼？';
q('.workspace').remove();
intro.innerHTML='<p class="eyebrow">FUKUOKA, JAPAN · LOCAL PREVIEW</p><h1>讓生活，<br>回到它該有的溫度。</h1><p>fréa 選物體驗測試首頁</p><p>從右下角「今天想找什麼？」開始，<br>用你的語言，找到日常裡合適的選物。</p><p class="note">獨立測試頁 · 商品與價格為快照 · 不產生正式訂單</p><button id="catalogToggle" class="secondary">瀏覽測試商品</button><a class="text-link" href="/api/export" download>匯出測試紀錄 ↓</a>';
const dialog=q('#chatDialog'), launcher=q('#chatLauncher');
launcher.onclick=()=>{dialog.showModal();launcher.setAttribute('aria-expanded','true');q('#query').focus()};
q('#chatClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{launcher.setAttribute('aria-expanded','false');launcher.focus()});
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});

q('#language').value='zh';q('#language').closest('label').hidden=true;

q('body>header').hidden=true;q('main').hidden=true;q('footer').hidden=true;q('#chatLauncher').hidden=true;q('#chatLauncher').click();q('#chatDialog').addEventListener('close',()=>parent.postMessage({type:'frea-lab-close'},location.origin));window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data?.type==='frea-lab-open'&&!q('#chatDialog').open)q('#chatLauncher').click()});
