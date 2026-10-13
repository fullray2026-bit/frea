import {asset,put,signed,request,env} from './pipeline.ts';
import {imagePrompt,slots} from './three-images.ts';
import {productInformation} from './product-information.ts';
export function productType(p:any){const s=String(p.name||'');if(/杯|壺|匙|鍋|瓶|研磨|磨豆|茶具|酒器/.test(s))return 'object';if(/咖啡|高湯|味噌|鹽|胡椒|麵|豆腐|地瓜|蛋白|醬|黃豆/.test(s))return 'food';return 'package';}
export async function autoProductImage(j:any,slot:number){
 if(![0,1,2].includes(slot))throw Error('圖片角色無效');
 return await productInformation({id:'auto-'+j.id,product_snapshot:j.source_snapshot},slots[slot].key,slot===1?'information':slot===2?'detail':'original');
}