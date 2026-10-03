import { load } from 'npm:cheerio@1.0.0';

export const hosts = new Set(['kinto.co.jp','rec-coffee.com','russellhobbs.jp','shop.kamenoko-tawashi.co.jp','store.rivers.co.jp','tokado-coffee.shop-pro.jp','www.akomeya.jp','www.amazon.co.jp','www.kubara.jp','www.torizenfoods.jp','www.yodobashi.com']);
export function sourceURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !hosts.has(u.hostname)) throw new Error('目前支援既有商品來源網站；這個網址尚未支援，請手動填寫。');
  u.hash = ''; return u;
}
export function parseProduct(html, url) {
  const $ = load(html), clean = v => typeof v === 'string' ? load(v).text().replace(/\s+/g,' ').trim().slice(0,5000) : '';
  const nodes=[];
  if(new URL(url).hostname==='tokado-coffee.shop-pro.jp') {
    const name=clean($('.product__name').first().text());
    if(!name)throw new Error('找不到這個商品的資料，請確認商品網址。');
    const description=clean($('.product__explain').first().html()||'');
    const images=$('.product__image img').map((_,e)=>$(e).attr('src')).get();
    nodes.push({'@type':'Product',name,description,brand:{name:'豆香洞コーヒー'},image:images,offers:{price:$('.product__price').first().text().replace(/[^0-9]/g,''),priceCurrency:'JPY'}});
  }
  function walk(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walk); return; } nodes.push(x); if(x['@graph'])walk(x['@graph']); if(x.mainEntity)walk(x.mainEntity); }
  $('script[type="application/ld+json"]').each((_,el)=>{try{walk(JSON.parse($(el).text()));}catch{}});
  const products=nodes.filter(x=>[x['@type']].flat().some(t=>t==='Product'));
  const p=products.find(x=>{try{return x.url && new URL(x.url,url).pathname===new URL(url).pathname;}catch{return false;}})||products[0];
  const meta = name => $(`meta[property="${name}"],meta[name="${name}"]`).first().attr('content')||'';
  if(!p && !/product/i.test(meta('og:type'))) throw new Error('找不到可確認的商品資料，網站可能未提供結構化資料或限制擷取，請手動填寫。');
  const data={}, put=(key,v)=>{const s=clean(v);if(s)data[key]=s;};
  put('name',p?.name||meta('og:title')); put('brand_name',typeof p?.brand==='string'?p.brand:p?.brand?.name);
  if(new URL(url).hostname==='kinto.co.jp')data.brand_name='KINTO';
  put('description',p ? p.description : meta('og:description')); put('model',p?.model); put('barcode',p?.gtin13||p?.gtin12||p?.gtin14||p?.gtin8||p?.gtin);
  const offers=[p?.offers].flat().filter(Boolean), variant=new URL(url).searchParams.get('variant');
  const offer=variant?offers.find(o=>{try{return new URL(o.url,url).searchParams.get('variant')===variant;}catch{return false;}}):offers.length && offers.every(o=>o.price===offers[0].price && o.priceCurrency===offers[0].priceCurrency)?offers[0]:null;
  if(offer?.priceCurrency==='JPY' && offer.price!==undefined && /^\d+(\.\d+)?$/.test(String(offer.price)))data.reference_price_jpy=Number(offer.price);
  const w=p?.weight, unit=String(w?.unitCode||w?.unitText||'').toLowerCase();
  if(w && Number(w.value)>0 && ['grm','g','kg','kgm'].includes(unit))data.weight_g=Number(w.value)*(['kg','kgm'].includes(unit)?1000:1);
  const specs=[p?.size,p?.color,p?.material].map(x=>typeof x==='object'?x?.name:x).filter(x=>typeof x==='string');put('specification',specs.join(' / '));
  const images=[p?.image].flat().concat(meta('og:image')).map(x=>typeof x==='object'?x?.url:x).filter(Boolean).map(x=>{try{const u=new URL(x,url);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}).filter(Boolean);
  return {fields:data,images:[...new Set(images)].slice(0,8),warnings:['資料保留來源原文，請核對規格、價格及圖片後再儲存。',...(!data.reference_price_jpy?['未取得明確的單一日圓售價，請自行確認。']:[])]};
}
