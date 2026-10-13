import {Resvg,initWasm} from 'npm:@resvg/resvg-wasm@2.6.2';
import jpeg from 'npm:jpeg-js@0.4.4';
import {asset,request,put} from './pipeline.ts';
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const b64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
let ready:Promise<void>,font:Uint8Array;
function lines(text:string,width:number){const chars=[...text],rows=[];for(let i=0;i<chars.length;i+=width)rows.push(chars.slice(i,i+width).join(''));return rows;}
export async function productInformation(d:any,lock:string){
 if(!ready)ready=(async()=>{await initWasm(await(await request('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm')).arrayBuffer());font=new Uint8Array(await(await request('https://www.thefrea.com/assets/social/ChenYuluoyan-2.0-Thin.ttf')).arrayBuffer());})();await ready;
 const original=await asset(d.product_snapshot.image_url),image='data:'+original.type+';base64,'+b64(original.bytes);
 const name=lines(d.product_snapshot.name,12),specs=String(d.product_snapshot.specification||'').split('／').flatMap(s=>lines(s.trim(),15));
 const texts=[...name.map((s,i)=>'<text x="630" y="'+(240+i*39)+'" font-size="30">'+xml(s)+'</text>'),...specs.map((s,i)=>'<text x="630" y="'+(300+name.length*39+i*34)+'" font-size="24">'+xml(s)+'</text>')].join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024"><rect width="1024" height="1024" fill="#efefef"/><image x="35" y="60" width="560" height="900" preserveAspectRatio="xMidYMid meet" xlink:href="'+image+'"/><g font-family="Chenyu" fill="#503e32"><text x="630" y="150" font-size="34">商品資訊</text>'+texts+'</g></svg>';
 const renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:'Chenyu',loadSystemFonts:false}});const png=renderer.render();const encoded=jpeg.encode({data:png.pixels,width:1024,height:1024},90).data;png.free();renderer.free();return await put('three-images/'+d.id+'/information-'+lock+'.jpg',encoded);
}
