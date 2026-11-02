(function () {
 'use strict';
 if (window.self !== window.top && new URLSearchParams(location.search).get('embedded') === '1') document.body.classList.add('embedded');
 const $ = id => document.getElementById(id);
 let client, activeId = null, turns = [], conversations = [], busy = false, ready = false, authenticated = false;
 const say = text => { $('notice').textContent = text; };
 function controls() {
  $('send').disabled = busy || !ready;
  $('message').disabled = busy || !ready;
  $('newConversation').disabled = $('reload').disabled = busy;
  $('export').disabled = busy || !turns.length;
  document.querySelectorAll('#conversations button,#starters button').forEach(b => { b.disabled = busy; });
  $('send').textContent = busy ? 'Nora 整理中…' : '傳送給 Nora';
 }
 async function api(body) {
  const { data, error } = await client.functions.invoke('nora-chat', { body });
  if (error) {
   let detail;
   try { detail = await error.context?.json(); } catch { /* Use a readable fallback. */ }
   if (detail?.conversation_id) activeId = detail.conversation_id;
   throw Error(detail?.error || '暫時無法連上 Nora，請稍後重試。');
  }
  if (data?.error) throw Error(data.error);
  return data;
 }
 function append(role, text, id) {
  const article = document.createElement('article'); article.className = 'message'; article.dataset.role = role;
  if (id) article.id = id;
  const name = document.createElement('div'); name.className = 'speaker'; name.textContent = role === 'user' ? 'SAMMI' : 'NORA';
  const content = document.createElement('div'); content.className = 'content'; content.textContent = text;
  article.append(name, content);
  if (role === 'assistant') {
   const copy = document.createElement('button'); copy.type = 'button'; copy.className = 'copy'; copy.textContent = '複製文字';
   copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(text); copy.textContent = '已複製'; } catch { say('無法自動複製，請選取文字複製。'); } });
   article.append(copy);
  }
  $('messages').append(article); $('messages').scrollTop = $('messages').scrollHeight;
 }
 function render() {
  $('messages').replaceChildren();
  if (!turns.length) {
   const card = document.createElement('div'); card.className = 'empty';
   const title = document.createElement('h2'); title.textContent = 'Sammi，慢慢來就好。';
   const p = document.createElement('p'); p.textContent = '品牌方向、日常筆記，或一篇還沒想好的貼文，都可以從這裡開始。';
   card.append(title, p); $('messages').append(card);
  }
  for (const t of turns) {
   append('user', t.user_text);
   if (t.status === 'completed') append('assistant', t.assistant_text);
   else append('assistant', t.status === 'pending' ? '這則訊息尚在處理。稍後按「重新載入紀錄」查看結果；若超過兩分鐘，請重新傳送。' : '這次回覆未完成，可以重新傳送訊息。');
  }
  $('starters').hidden = !!turns.length;
  $('conversationTitle').textContent = conversations.find(c => c.id === activeId)?.title || '今天，從哪個小地方開始？';
  controls();
 }
 async function list() {
  const result = await api({ action: 'list' });
  if (!authenticated) return;
  conversations = result.conversations || [];
  $('conversations').replaceChildren();
  for (const c of conversations) {
   const button = document.createElement('button'); button.type = 'button'; button.textContent = c.title;
   button.setAttribute('aria-current', String(c.id === activeId));
   button.addEventListener('click', () => run(async () => { await load(c.id); await list(); }));
   $('conversations').append(button);
  }
  if (!conversations.length) $('conversations').textContent = '第一段故事，從今天開始。';
  $('conversationTitle').textContent = conversations.find(c => c.id === activeId)?.title || '今天，從哪個小地方開始？';
  controls();
 }
 async function load(id) {
  const result = await api({ action: 'load', conversation_id: id });
  if (!authenticated) return;
  activeId = result.conversation.id; turns = result.turns || []; render();
 }
 async function run(task) {
  if (busy || !authenticated) return;
  busy = true; say(''); controls();
  try { await task(); } catch (error) { if (authenticated) say(error.message); }
  finally { busy = false; controls(); }
 }
 $('newConversation').addEventListener('click', () => run(async () => { activeId = null; turns = []; render(); await list(); $('message').value = ''; }));
 $('reload').addEventListener('click', () => run(async () => { if (activeId) await load(activeId); await list(); }));
 document.querySelectorAll('#starters button').forEach(button => button.addEventListener('click', () => { $('message').value = button.textContent; $('message').focus(); }));
 $('message').addEventListener('keydown', event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); $('composer').requestSubmit(); } });
 $('composer').addEventListener('submit', event => {
  event.preventDefault(); const message = $('message').value.trim(); if (!message || !ready) return;
  run(async () => {
   if (!turns.length) $('messages').replaceChildren();
   append('user', message, 'sendingMessage');
   say('Nora 正在整理，完成後會自動保存。');
   let result;
   try { result = await api({ action: 'send', conversation_id: activeId, request_id: crypto.randomUUID(), message }); }
   catch (error) {
    $('sendingMessage')?.remove();
    if (activeId && authenticated) { try { await load(activeId); await list(); } catch { /* Original failure is more useful. */ } }
    throw error;
   }
   if (!authenticated) return;
   activeId = result.conversation_id; $('message').value = '';
   // Keep the confirmed answer visible even if a subsequent history refresh fails.
   turns.push({ user_text: message, assistant_text: result.answer, status: 'completed' }); render(); say('已儲存對話。');
   try { await list(); } catch { say('回覆已保存；對話清單暫未更新，可重新載入紀錄。'); }
  });
 });
 $('export').addEventListener('click', () => {
  if (!authenticated || !turns.length) return;
  const text = 'fréa｜Nora 對話\n\n' + turns.map(t => 'Sammi：\n' + t.user_text + '\n\nNora：\n' + (t.assistant_text || '（未完成）')).join('\n\n——\n\n');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'frea-nora-' + new Date().toISOString().slice(0, 10) + '.txt'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
 });
 async function init() {
  try {
   if (!window.supabase || !window.freaSupabaseConfig) throw Error('無法載入登入服務，請重新整理。');
   client = window.supabase.createClient(window.freaSupabaseConfig.url, window.freaSupabaseConfig.publishableKey);
   const { data, error } = await client.auth.getUser();
   if (error || data.user?.app_metadata?.role !== 'admin') throw Error('請先登入 fréa 管理後台，再開啟 Nora。');
   authenticated = true; $('authMessage').textContent = ''; $('workspace').hidden = false; render();
   client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') { authenticated = ready = false; turns = []; conversations = []; activeId = null; $('messages').replaceChildren(); $('conversations').replaceChildren(); $('message').value = ''; $('workspace').hidden = true; $('authMessage').textContent = '已登出，請重新登入管理後台。'; }
   });
   const status = await api({ action: 'status' }); ready = !!status.ready; say(status.message); controls();
   await list();
  } catch (error) { (authenticated ? say : text => { $('authMessage').textContent = text; })(error.message); }
 }
 init();
})();
