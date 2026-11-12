const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const products = require('./product-pages-data.json');
const escape = value => String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const template = fs.readFileSync(path.join(root,'product-FR-000074.html'),'utf8');
const originalSlug = template.match(/data-detail-slug="([^"]*)"/)[1];
function page(p, file) {
 const url = 'https://www.thefrea.com/' + file;
 return template.replace(/<title>.*?<\/title>/, '<title>'+escape(p.name)+'｜fréa</title>')
 .replace(/(<meta name="description" content=")[^"]*/, '$1'+escape(p.description))
 .replace(/(<meta property="og:title" content=")[^"]*/, '$1'+escape(p.name)+'｜fréa')
 .replace(/(<meta property="og:description" content=")[^"]*/, '$1'+escape(p.description))
 .replace(/(<meta property="og:image" content=")[^"]*/, '$1'+escape(p.image_url))
 .replaceAll('https://www.thefrea.com/product-FR-000074.html',url)
 .replace('data-detail-slug="'+originalSlug+'"','data-detail-slug="'+escape(p.slug)+'"')
 .replace(/<h1>.*?<\/h1>/,'<h1>'+escape(p.name)+'</h1>')
 .replace('index.html#category/craft','index.html#all').replace('← 限定選物','← 返回商品列表')
 .replace(/home-catalog.js\?v=[^" ]*/g,'home-catalog.js?v=20261112-all-products')
 .replace(/home-gallery.js\?v=[^" ]*/g,'home-gallery.js?v=20261112-all-products')
 .replace('src="product-detail.js"','src="product-detail.js?v=20261112-all-products"');
}
const mapping = {};
for(const p of products){
 if(!/^FR-\d{6}$/.test(p.product_code)) throw Error('Missing product code: '+p.slug);
 const file='product-'+p.product_code+'.html';
 mapping[p.slug]=file;
 fs.writeFileSync(path.join(root,file),page(p,file));
}
fs.writeFileSync(path.join(root,'product.html'),page({slug:'',name:'商品詳情',description:'探索 fréa 日常選物',image_url:''},'product.html'));
fs.writeFileSync(path.join(root,'product-page-links.js'),'window.FreaProductPages='+JSON.stringify(mapping)+';\n');
const catalogPath=path.join(root,'home-catalog.js');
let catalog=fs.readFileSync(catalogPath,'utf8');
catalog=catalog.replace(/const detailPages=.*?;/,'const detailPages='+JSON.stringify(mapping)+';');
catalog=catalog.replace(/const detailLink=.*?;/,"const detailLink=!document.getElementById('detailProduct') && (detailPages[product.slug] || 'product.html?slug='+encodeURIComponent(product.slug));");
fs.writeFileSync(catalogPath,catalog);
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
 const full=path.join(root,file);const before=fs.readFileSync(full,'utf8');
 const after=before.replace(/home-catalog.js(?:\?v=[^" ]*)?/g,'home-catalog.js?v=20261112-all-products').replace(/home-gallery.js(?:\?v=[^" ]*)?/g,'home-gallery.js?v=20261112-all-products');
 if(before!==after)fs.writeFileSync(full,after);
}
console.log('Generated '+products.length+' product pages and generic fallback.');
