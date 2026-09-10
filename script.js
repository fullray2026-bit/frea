const qs=(s,e=document)=>e.querySelector(s),qsa=(s,e=document)=>[...e.querySelectorAll(s)];
function toast(m){const t=qs(".toast");if(!t)return;t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
const qf=qs("#quickQuote");if(qf)qf.addEventListener("submit",e=>{e.preventDefault();const p=new URLSearchParams(),a=qs("[name=quick_product]",qf).value.trim(),b=qs("[name=quick_url]",qf).value.trim();if(a)p.set("product",a);if(b)p.set("url",b);location.href="personal-shopping.html?"+p});
function addRow(v={}){
  const l=qs("#itemList");if(!l)return;
  const r=document.createElement("div");r.className="item-row";
  const number=document.createElement("div");number.textContent=l.children.length+1;
  const name=document.createElement("input");name.dataset.itemName="";name.placeholder="商品名稱";name.maxLength=200;name.value=String(v.name||"");
  const url=document.createElement("input");url.dataset.itemUrl="";url.placeholder="商品連結";url.maxLength=1000;url.value=String(v.url||"");
  const specification=document.createElement("input");specification.dataset.itemSpecification="";specification.placeholder="顏色及規格說明（無請填 X）";specification.maxLength=300;specification.value=String(v.specification||"");
  const quantity=document.createElement("input");quantity.dataset.itemQuantity="";quantity.type="number";quantity.min="1";quantity.max="99";quantity.value=String(v.qty||1);
  const remove=document.createElement("button");remove.type="button";remove.className="remove";remove.setAttribute("aria-label","移除商品");remove.textContent="×";
  remove.onclick=()=>{r.remove();qsa(".item-row",l).forEach((x,i)=>x.firstElementChild.textContent=i+1)};
  r.append(number,name,url,specification,quantity,remove);l.appendChild(r);
}
const itemList=qs("#itemList");
if(itemList){
  addRow();addRow();qs("#addItem").onclick=()=>addRow();
  const params=new URLSearchParams(location.search),first=qsa(".item-row",itemList)[0];
  if(params.get("product"))qs("[data-item-name]",first).value=params.get("product");
  if(params.get("url"))qs("[data-item-url]",first).value=params.get("url");
  const form=qs("#personalForm");
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const message=qs("#personalFormMessage"),button=qs("#personalSubmit");
    const items=qsa(".item-row",itemList).map(row=>({name:qs("[data-item-name]",row).value.trim(),url:qs("[data-item-url]",row).value.trim(),specification:qs("[data-item-specification]",row).value.trim(),quantity:Math.min(99,Math.max(1,Math.round(Number(qs("[data-item-quantity]",row).value)||1)))})).filter(item=>item.name||item.url||item.specification);
    if(!items.length||items.some(item=>!item.name||!item.specification)){message.hidden=false;message.textContent="請完整填寫商品名稱及顏色與規格說明；若無顏色或規格，請填 X。";return}
    if(!window.supabase||!window.freaSupabaseConfig){message.hidden=false;message.textContent="系統目前無法連線，請稍後再試。";return}
    const client=window.supabase.createClient(window.freaSupabaseConfig.url,window.freaSupabaseConfig.publishableKey);
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user){location.href="register.html?view=register&return=personal-shopping.html";return}
    const {data:profile,error:profileError}=await client.from("profiles").select("full_name,phone").eq("id",user.id).single();
    if(profileError||!profile){message.hidden=false;message.textContent="無法讀取會員資料，請稍後再試。";return}
    if(!String(profile.full_name||"").trim()||!String(profile.phone||"").trim()){message.hidden=false;message.textContent="請先至會員中心補齊姓名與手機，再送出代購需求。";return}
    const fd=new FormData(form);
    const requestNumber="PS"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
    button.disabled=true;button.textContent="送出中…";
    const {error}=await client.from("personal_shopping_requests").insert({request_number:requestNumber,user_id:user.id,customer_name:String(profile.full_name||"").trim(),email:String(user.email||"").trim(),phone:String(profile.phone||"").trim(),line_id:"",note:String(fd.get("note")||"").trim(),items});
    button.disabled=false;button.textContent="送出代購需求";message.hidden=false;
    if(error){message.textContent="代購需求送出失敗，請稍後再試。";return}
    form.reset();itemList.innerHTML="";addRow();addRow();message.textContent="代購需求已成立，編號："+requestNumber+"。我們確認供貨與費用後會與您聯繫。";toast("代購需求已送出");
  });
}

// Search uses the live public catalogue, never the legacy HTML product fixtures.
(function initSiteSearch(){
  const triggers=qsa('button.icon[aria-label="搜尋"]');
  if(!triggers.length)return;

  qsa('[data-cart-product]').forEach(row=>{
    if(row.dataset.productId&&!row.id)row.id=row.dataset.productId;
  });

  const overlay=document.createElement('div');
  overlay.className='site-search';
  overlay.hidden=true;
  overlay.innerHTML='<div class="site-search-backdrop" data-search-close></div><section class="site-search-panel" role="dialog" aria-modal="true" aria-labelledby="siteSearchTitle"><div class="site-search-head"><div><div class="site-search-kicker">SEARCH</div><h2 id="siteSearchTitle">搜尋商品</h2></div><button type="button" class="site-search-close" data-search-close aria-label="關閉搜尋">×</button></div><label class="site-search-field"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="14" cy="14" r="9.5"></circle><path d="M21.2 21.2 28 28"></path></svg><input type="search" autocomplete="off" placeholder="輸入商品、品牌、規格或用途" aria-label="搜尋商品"></label><div class="site-search-status">請輸入關鍵字開始搜尋。</div><div class="site-search-results" aria-live="polite"></div></section>';
  document.body.appendChild(overlay);

  const input=qs('input',overlay),status=qs('.site-search-status',overlay),results=qs('.site-search-results',overlay);
  let configPromise, searchVersion=0, searchTimer;
  const normalise=value=>String(value||'').toLocaleLowerCase('zh-Hant').replace(/\s+/g,' ').trim();
  const brands={
    kayanoya:['茅乃舍','brand-kayanoya.html'],kinto:['KINTO','brand-kinto.html'],
    kajidonya:['家事問屋','brand-kajidonya.html'],akomeya:['AKOMEYA TOKYO','brand-akomeya.html'],
    'fukuoka-coffee':['福岡咖啡精選','brand-fukuoka-coffee.html'],
    'lifestyle-picks':['生活雜貨精選','category-lifestyle.html']
  };
  async function loadSearchConfig(){
    if(window.freaSupabaseConfig)return window.freaSupabaseConfig;
    if(!configPromise){
      configPromise=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        script.src='supabase-config.js';
        script.onload=()=>window.freaSupabaseConfig?resolve(window.freaSupabaseConfig):reject(new Error('config'));
        script.onerror=()=>reject(new Error('config'));
        document.head.appendChild(script);
      }).catch(error=>{configPromise=null;throw error});
    }
    return configPromise;
  }
  async function loadCatalogue(){
    const config=await loadSearchConfig();
    const url=new URL('/rest/v1/products',config.url);
    url.searchParams.set('select','slug,brand_code,name,description,specification,usage_flavor,image_url,is_active');
    url.searchParams.set('is_active','eq.true');
    url.searchParams.set('order','brand_code.asc,sort_order.asc,slug.asc');
    const products=[];
    const pageSize=500;
    for(let offset=0;;offset+=pageSize){
      url.searchParams.set('limit',String(pageSize));
      url.searchParams.set('offset',String(offset));
      const response=await fetch(url.href,{cache:'no-store',headers:{apikey:config.publishableKey}});
      if(!response.ok)throw new Error('catalogue');
      const data=await response.json();
      if(!Array.isArray(data))throw new Error('catalogue');
      products.push(...data);
      if(data.length<pageSize)break;
    }
    return products.filter(product=>product.is_active===true).map(product=>{
      const [brand,page]=brands[product.brand_code]||[product.brand_code,'products.html'];
      return {
        id:product.slug,brand,page,name:product.name||'',spec:product.specification||'',
        description:product.description||'',use:product.usage_flavor||'',image:product.image_url||'',
        search:normalise([brand,product.name,product.specification,product.description,product.usage_flavor].join(' '))
      };
    });
  }
  function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
  async function runSearch(){
    const version=++searchVersion;
    const term=normalise(input.value);
    if(!term){results.innerHTML='';status.textContent='請輸入關鍵字開始搜尋。';return}
    results.innerHTML='';
    status.textContent='搜尋中…';
    try{
      const catalogue=await loadCatalogue();
      if(version!==searchVersion||overlay.hidden)return;
      const matches=catalogue.filter(item=>item.search.includes(term)).slice(0,24);
      status.textContent=matches.length?`找到 ${matches.length} 項商品`:'找不到符合的商品，請嘗試其他關鍵字。';
      results.innerHTML=matches.map(item=>`<a class="site-search-result" href="${escapeHtml(item.page)}#${encodeURIComponent(item.id)}"><span class="site-search-thumb">${item.image?`<img src="${escapeHtml(item.image)}" alt="">`:''}</span><span class="site-search-copy"><small>${escapeHtml(item.brand)}</small><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.spec)}${item.use?'｜'+escapeHtml(item.use):''}</span></span><span class="site-search-arrow" aria-hidden="true">→</span></a>`).join('');
    }catch(error){if(version!==searchVersion||overlay.hidden)return;status.textContent='搜尋資料暫時無法載入，請稍後再試。';results.innerHTML=''}
  }
  function openSearch(){overlay.hidden=false;document.body.classList.add('search-open');requestAnimationFrame(()=>input.focus());runSearch()}
  function closeSearch(){++searchVersion;clearTimeout(searchTimer);overlay.hidden=true;document.body.classList.remove('search-open')}
  triggers.forEach(trigger=>trigger.addEventListener('click',openSearch));
  qsa('[data-search-close]',overlay).forEach(button=>button.addEventListener('click',closeSearch));
  input.addEventListener('input',()=>{++searchVersion;clearTimeout(searchTimer);results.innerHTML='';status.textContent=input.value.trim()?'搜尋中…':'請輸入關鍵字開始搜尋。';searchTimer=setTimeout(runSearch,200)});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!overlay.hidden)closeSearch()});
  if(location.hash){const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(target)setTimeout(()=>target.scrollIntoView({behavior:'smooth',block:'center'}),120)}
})();

if (location.pathname.endsWith("/category-lifestyle.html")) {
  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.body.appendChild(script);
  });
  loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/dist/umd/supabase.js")
    .then(() => loadScript("supabase-config.js"))
    .then(() => loadScript("product-catalog.js?v=member-checkout-20260909"))
    .catch(() => {});
}

