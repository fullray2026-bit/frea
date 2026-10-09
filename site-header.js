(() => {
  function refresh(){
    const badge=document.getElementById('homeCartCount');if(!badge)return;
    let count=0;try{const cart=JSON.parse(localStorage.getItem('frea_demo_cart_v1')||'[]');if(Array.isArray(cart))count=cart.reduce((n,p)=>n+Math.max(0,Number(p.quantity)||0),0);}catch{}
    if(badge.textContent!==String(count))badge.textContent=String(count);
  }
  refresh();window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);
  document.addEventListener('click',()=>setTimeout(refresh,0));
  setInterval(()=>{if(!document.hidden)refresh();},1000);
})();
(() => {
  const header=document.querySelector('.site-header');
  const nav=header?.querySelector('nav');
  if(!nav)return;
  const toggle=document.createElement('button');
  toggle.type='button';toggle.className='home-icon site-search-toggle';
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','siteSearchPanel');
  toggle.innerHTML='<svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="11.5" cy="11.5" r="7.5"/><path d="m17 17 7 7"/></svg><span>搜尋</span>';
  nav.prepend(toggle);
  const panel=document.createElement('form');panel.id='siteSearchPanel';panel.className='site-header-search-panel';panel.hidden=true;panel.setAttribute('role','search');
  panel.innerHTML='<label class="site-search-label" for="siteSearchInput">搜尋商品</label><input id="siteSearchInput" type="search" placeholder="搜尋商品、品牌" required><button type="submit">搜尋</button><button type="button" class="site-search-close" aria-label="關閉搜尋">×</button>';
  header.append(panel);
  const input=panel.querySelector('input');
  function close(focus=false){panel.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus()}
  toggle.addEventListener('click',()=>{if(!panel.hidden){close();return}panel.hidden=false;toggle.setAttribute('aria-expanded','true');input.focus()});
  panel.querySelector('.site-search-close').addEventListener('click',()=>close(true));
  panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close(true)}});
  panel.addEventListener('submit',e=>{e.preventDefault();const query=input.value.trim();if(!query)return;close();input.blur();const route='search/'+encodeURIComponent(query);if(document.body.classList.contains('frea-home')){location.hash=route;window.scrollTo(0,0)}else location.href='index.html#'+route});
  document.addEventListener('click',e=>{if(!header.contains(e.target))close()});
  const oldSearch=document.getElementById('homeSearch');if(oldSearch)oldSearch.hidden=true;
  const menu=document.getElementById('homeMenu');if(menu)menu.textContent='商品分類 ＋';
})();
