// Shared, side-effect-free rules. No existing catalog behavior is changed.
(function(root){
 const eligible=p=>!!p.is_active&&!!p.image_url&&(p.product_variants?.length?p.product_variants.some(v=>v.is_active&&v.stock_quantity>0):p.stock_quantity>0);
 const link=p=>{if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(p.id||''))return 'https://www.thefrea.com/index.html#search/'+encodeURIComponent(p.name||'');const bytes=p.id.replaceAll('-','').match(/../g).map(h=>String.fromCharCode(parseInt(h,16))).join('');return 'https://www.thefrea.com/p/#'+btoa(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')};
 function choose(products,settings,recent){
   const excluded=new Set(settings.excluded_product_ids||[]),preferred=new Set(settings.preferred_product_ids||[]),used=new Set(recent);
   return products.filter(p=>eligible(p)&&!excluded.has(p.id)&&!used.has(p.id)).sort((a,b)=>Number(preferred.has(b.id))-Number(preferred.has(a.id))||a.name.localeCompare(b.name,'zh-Hant'))[0]||null;
 }
 function template(p){const text=`想和你分享一件日常選物：${p.name}。\n\n${p.usage_flavor||p.description||'替平常的日子，挑一件自己喜歡的選物。'}\n\n到 fréa 看看商品：\n${link(p)}\n\n#fréa #日常選物`;return {title:'留一點時間，給日常',facebook_text:text.slice(0,5000),instagram_text:text.slice(0,2200)}}
 const api={eligible,link,choose,template};root.FreaSocialRules=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
