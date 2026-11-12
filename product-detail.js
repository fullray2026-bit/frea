(async function(){
 const box=document.getElementById('detailProduct');
 const client=window.supabase.createClient(window.freaSupabaseConfig.url,window.freaSupabaseConfig.publishableKey);
 try{
 const {data:p,error}=await client.from('products').select('slug,name,description,specification,usage_flavor,price,currency,stock_quantity,image_url,gallery_images,is_active').eq('slug',document.body.dataset.detailSlug).maybeSingle();
 if(error)throw error;
 if(!p || !p.is_active){box.textContent='此商品已下架，歡迎返回限定選物看看其他商品。';return;}
 const {data:variants,error:ve}=await client.rpc('get_public_product_variants');if(ve)throw ve;
 p.product_variants=variants.filter(v=>v.product_slug===p.slug);
 window.FreaHomeCatalog.render(box,[p]);
 const title=box.querySelector('h3');const h=document.createElement('h1');h.textContent=p.name;title.replaceWith(h);
 document.title=p.name+'｜fréa';
 }catch(e){box.textContent='商品暫時無法載入，請重新整理後再試。';}
 document.getElementById('shareProduct').onclick=async()=>{const url=document.getElementById('shareUrl').value;try{if(navigator.share){await navigator.share({title:document.title,url});}else{await navigator.clipboard.writeText(url);document.getElementById('shareStatus').textContent='商品連結已複製';}}catch(e){if(e.name!=='AbortError'){document.getElementById('shareUrl').select();document.getElementById('shareStatus').textContent='請複製上方商品連結';}}};
})();
