import {Resvg,initWasm} from 'npm:@resvg/resvg-wasm@2.6.2';
import jpeg from 'npm:jpeg-js@0.4.4';
import {PNG} from 'npm:pngjs@7.0.0';
import {asset,request,put} from './pipeline.ts';
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const b64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
let ready:Promise<void>,font:Uint8Array;
function lines(text:string,width:number){const chars=[...text],rows=[];for(let i=0;i<chars.length;i+=width)rows.push(chars.slice(i,i+width).join(''));return rows;}
export async function productInformation(d:any,lock:string){
 if(!ready)ready=(async()=>{await initWasm(await(await request('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm')).arrayBuffer());font=new Uint8Array(await(await request('https://www.thefrea.com/assets/social/ChenYuluoyan-2.0-Thin.ttf')).arrayBuffer());})();await ready;
 const original=await asset(d.product_snapshot.image_url),image='data:'+original.type+';base64,'+b64(original.bytes);
 const name=lines(d.product_snapshot.name,8),specs=String(d.product_snapshot.specification||'').split('／').flatMap(s=>lines(s.trim(),11));
 const texts=[...name.map((s,i)=>'<text x="630" y="'+(240+i*54)+'" font-size="42">'+xml(s)+'</text>'),...specs.map((s,i)=>'<text x="630" y="'+(300+name.length*54+i*42)+'" font-size="30">'+xml(s)+'</text>')].join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024"><rect width="1024" height="1024" fill="#efefef"/><g font-family="Chenyu" fill="#503e32"><text x="630" y="150" font-size="34">商品資訊</text>'+texts+'</g></svg>';
 const renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:'Chenyu',loadSystemFonts:false}});const png=renderer.render();const pixels=png.pixels;
 // Composite the original pixels explicitly: the WASM SVG renderer omits JPEG images.
 const decoded=original.type==='image/jpeg'?jpeg.decode(original.bytes,{useTArray:true}):original.type==='image/png'?PNG.sync.read(original.bytes):null;
 if(!decoded)throw Error('商品資訊圖請使用 JPG 或 PNG 原始照片');
 let left=decoded.width,top=decoded.height,right=0,bottom=0;const bg=[decoded.data[0],decoded.data[1],decoded.data[2]];
 for(let y=0;y<decoded.height;y++)for(let x=0;x<decoded.width;x++){const k=(y*decoded.width+x)*4;if(decoded.data[k+3]>20&&Math.max(...bg.map((v,c)=>Math.abs(decoded.data[k+c]-v)))>45){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 if(right<=left||bottom<=top){left=0;top=0;right=decoded.width-1;bottom=decoded.height-1;}
 left=Math.max(0,left-24);top=Math.max(0,top-24);right=Math.min(decoded.width-1,right+24);bottom=Math.min(decoded.height-1,bottom+24);
 const sw=right-left+1,sh=bottom-top+1,scale=Math.min(520/sw,780/sh),w=Math.round(sw*scale),h=Math.round(sh*scale),ox=55+Math.round((520-w)/2),oy=120+Math.round((780-h)/2);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=((top+Math.min(sh-1,Math.floor(y/scale)))*decoded.width+left+Math.min(sw-1,Math.floor(x/scale)))*4,to=((oy+y)*1024+ox+x)*4,a=decoded.data[from+3]/255;for(let c=0;c<3;c++)pixels[to+c]=Math.round(decoded.data[from+c]*a+pixels[to+c]*(1-a));pixels[to+3]=255;}
 const encoded=jpeg.encode({data:pixels,width:1024,height:1024},90).data;png.free();renderer.free();return await put('three-images/'+d.id+'/information-'+lock+'.jpg',encoded);
}
