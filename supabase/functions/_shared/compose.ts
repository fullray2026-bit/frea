import {Resvg,initWasm} from 'npm:@resvg/resvg-wasm@2.6.2';
import jpeg from 'npm:jpeg-js@0.4.4';
import {asset,request,put,signed} from './pipeline.ts';
let ready:Promise<void>;let font:Uint8Array;let logo:string;
const b64=(bytes:Uint8Array)=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)};
const xml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export async function compose(job:any){
 if(!ready)ready=(async()=>{await initWasm(await (await request('https://cdn.jsdelivr.net/npm/@resvg/resvg-wasm@2.6.2/index_bg.wasm')).arrayBuffer());font=new Uint8Array(await (await request('https://www.thefrea.com/assets/social/ChenYuluoyan-2.0-Thin.ttf')).arrayBuffer());const l=await asset('https://www.thefrea.com/assets/logo_round_transparent.png');logo='data:'+l.type+';base64,'+b64(l.bytes)})();await ready;
 const scene=await asset(await signed(job.scene_path));const img='data:'+scene.type+';base64,'+b64(scene.bytes);const full=job.style_snapshot.layout==='full',title=job.copy.title;const size=Math.min(72,Math.floor(950/Math.max([...title].length,1)));
 const svg='<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1350"><rect width="1080" height="1350" fill="#f5efe4"/><image x="'+(full?0:85)+'" y="'+(full?0:210)+'" width="'+(full?1080:910)+'" height="'+(full?1350:1010)+'" preserveAspectRatio="xMidYMid meet" xlink:href="'+img+'"/>'+(job.style_snapshot.show_title===false?'':(full?'<rect x="35" y="45" width="1010" height="145" fill="#fffdf9" fill-opacity=".86"/>':'')+'<text x="540" y="142" text-anchor="middle" font-family="Chenyu" font-size="'+size+'" fill="#503721">'+xml(title)+'</text>')+(job.style_snapshot.show_logo===false?'':'<image x="925" y="1200" width="112" height="112" xlink:href="'+logo+'"/>')+'</svg>';
 const renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:'Chenyu',loadSystemFonts:false}});const png=renderer.render();const encoded=jpeg.encode({data:png.pixels,width:1080,height:1350},90).data;png.free();renderer.free();return await put('pipeline/'+job.id+'/final.jpg',encoded);
}

