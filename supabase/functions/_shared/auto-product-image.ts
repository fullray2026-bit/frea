import {asset,put,signed,request,env} from './pipeline.ts';
import {imagePrompt,slots} from './three-images.ts';
import {productInformation} from './product-information.ts';
export function productType(p:any){const s=String(p.name||'');if(/杯|壺|匙|鍋|瓶|研磨|磨豆|茶具|酒器/.test(s))return 'object';if(/咖啡|高湯|味噌|鹽|胡椒|麵|豆腐|地瓜|蛋白|醬|黃豆/.test(s))return 'food';return 'package';}
export async function autoProductImage(j:any,slot:number){
 if(slot===1)return await productInformation({id:'auto-'+j.id,product_snapshot:j.source_snapshot},slots[slot].key);
 const original=await asset(j.source_snapshot.image_url),form=new FormData();form.set('model',Deno.env.get('SOCIAL_IMAGE_MODEL')||'gpt-image-1.5');form.set('size','1024x1024');form.set('quality','medium');form.set('input_fidelity','high');form.set('output_format','jpeg');form.set('output_compression','90');form.set('n','1');form.append('image[]',new Blob([original.bytes],{type:original.type}),'product.'+original.type.split('/')[1]);
 if(j.style_snapshot.reference_path){const mood=await asset(await signed(j.style_snapshot.reference_path));form.append('image[]',new Blob([mood.bytes],{type:mood.type}),'reference.'+mood.type.split('/')[1]);}
 form.set('prompt',imagePrompt(slot,j.source_snapshot,j.style_snapshot,productType(j.source_snapshot)));
 const data=await(await request('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+env('OPENAI_API_KEY')},body:form},130000)).json();if(data.data?.length!==1||!data.data[0].b64_json)throw Error('三圖製作未收到圖片');return await put('pipeline/'+j.id+'/'+slots[slot].key+'.jpg',Uint8Array.from(atob(data.data[0].b64_json),c=>c.charCodeAt(0)));
}
