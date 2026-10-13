import {Buffer} from 'node:buffer';
import {Resvg,initWasm} from 'npm:@resvg/resvg-wasm@2.6.2';
import jpeg from 'npm:jpeg-js@0.4.4';
import {PNG} from 'npm:pngjs@7.0.0';
import decodeWebp,{init as initWebp} from 'npm:@jsquash/webp@1.5.0/decode.js';
import {asset,request,put} from './pipeline.ts';
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const b64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
let ready:Promise<void>,webpReady:Promise<void>,font:Uint8Array;
function lines(text:string,width:number){const chars=[...text],rows=[];for(let i=0;i<chars.length;i+=width)rows.push(chars.slice(i,i+width).join(''));return rows;}
export async function productInformation(d:any,lock:string){
 if(!ready)ready=(async()=>{await initWasm(await(await request('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm')).arrayBuffer());font=new Uint8Array(await(await request('https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/TraditionalChinese/NotoSansCJKtc-Regular.otf')).arrayBuffer());})();await ready;
 const original=await asset(d.product_snapshot.image_url),image='data:'+original.type+';base64,'+b64(original.bytes);
 const fullName=String(d.product_snapshot.name),brand=fullName.match(/^[A-Za-z0-9][A-Za-z0-9 .&+\-]*(?=[\u3400-\u9fff｜])/u)?.[0].trim()||'';
 const name=lines((brand?fullName.slice(brand.length):fullName).trim().replace(/^[｜|\s]+/,'').replace(/\s*\d+(?:\.\d+)?\s*ml\s*$/i,''),9);
 const specs=String(d.product_snapshot.specification||'').split('／').map(s=>s.trim()).filter(Boolean);
 const text=(s:string,y:number,size:number,color='#503e32')=>'<text x="620" y="'+y+'" font-size="'+size+'" fill="'+color+'">'+xml(s)+'</text>';
 let texts=text('商品資訊',175,24,'#8a8178')+(brand?text(brand,240,30):'')+name.map((s,i)=>text(s,305+i*44,34)).join('');
 let y=355+name.length*44;
 for(const s of specs){const label=/^\d+(?:\.\d+)?\s*ml$/i.test(s)?'容量':/^[WＤDＷH]/i.test(s)?'尺寸':/g\s*$/i.test(s)?'重量':/色/.test(s)?'款式':'規格';texts+=text(label,y,17,'#8a8178');y+=27;for(const row of lines(s,19)){texts+=text(row,y,24);y+=30;}y+=20;}
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#efefef"/><g font-family="Noto Sans CJK TC" font-weight="400">'+texts+'</g></svg>';
 const renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:'Noto Sans CJK TC',loadSystemFonts:false}});const png=renderer.render();const pixels=png.pixels;
 // Composite the original pixels explicitly: the WASM SVG renderer omits JPEG images.
 // Sniff file bytes: some catalog .jpg objects actually contain WebP data.
 const isWebp=String.fromCharCode(...original.bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...original.bytes.slice(8,12))==='WEBP';
 let decoded:any;
 if(isWebp){
  if(!webpReady)webpReady=(async()=>{if(!('ImageData' in globalThis))Object.assign(globalThis,{ImageData:class{constructor(public data:Uint8ClampedArray,public width:number,public height:number){}}});await initWebp(await WebAssembly.compile(await(await request('https://cdn.jsdelivr.net/npm/@jsquash/webp@1.5.0/codec/dec/webp_dec.wasm')).arrayBuffer()));})();await webpReady;decoded=await decodeWebp(original.bytes.buffer);
 }else if(original.bytes[0]===255&&original.bytes[1]===216)decoded=jpeg.decode(original.bytes,{useTArray:true});
 else if(original.bytes[0]===137&&original.bytes[1]===80)decoded=PNG.sync.read(Buffer.from(original.bytes));
 else throw Error('商品資訊圖不支援此原始照片格式');
 let left=decoded.width,top=decoded.height,right=0,bottom=0;const bg=[decoded.data[0],decoded.data[1],decoded.data[2]];
 for(let y=0;y<decoded.height;y++)for(let x=0;x<decoded.width;x++){const k=(y*decoded.width+x)*4;if(decoded.data[k+3]>20&&(decoded.data[3]<20||Math.max(...bg.map((v,c)=>Math.abs(decoded.data[k+c]-v)))>45)){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
 if(right<=left||bottom<=top){left=0;top=0;right=decoded.width-1;bottom=decoded.height-1;}
 left=Math.max(0,left-24);top=Math.max(0,top-24);right=Math.min(decoded.width-1,right+24);bottom=Math.min(decoded.height-1,bottom+24);
 const sw=right-left+1,sh=bottom-top+1,scale=Math.min(520/sw,780/sh),w=Math.round(sw*scale),h=Math.round(sh*scale),ox=55+Math.round((520-w)/2),oy=120+Math.round((780-h)/2);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const from=((top+Math.min(sh-1,Math.floor(y/scale)))*decoded.width+left+Math.min(sw-1,Math.floor(x/scale)))*4,to=((oy+y)*1024+ox+x)*4,a=decoded.data[from+3]/255;for(let c=0;c<3;c++)pixels[to+c]=Math.round(decoded.data[from+c]*a+pixels[to+c]*(1-a));pixels[to+3]=255;}
 const encoded=jpeg.encode({data:pixels,width:1024,height:1024},90).data;png.free();renderer.free();return await put('three-images/'+d.id+'/information-'+lock+'.jpg',encoded);
}
