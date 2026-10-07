export const VERSION='recommendation-v1.5-coffee-equipment';
export const tagLabels={
'coffee-equipment':['咖啡沖煮器具','コーヒー抽出器具'],coffee:['咖啡','コーヒー'],cooking:['料理','料理'],soup:['湯品','スープ'],spicy:['辛香','辛味'],citrus:['柑橘香','柑橘の香り'],'light-roast':['淺焙','浅煎り'],'dark-roast':['深焙','深煎り'],floral:['花香','花の香り'],fruity:['果香','フルーティー'],'mild-acidity':['柔和酸質','穏やかな酸味'],drinkware:['飲水器物','ドリンクウェア'],commute:['通勤外出','通勤・外出'],insulated:['保溫保冷','保温・保冷'],lightweight:['輕巧','軽量'],snack:['點心','おやつ'],chocolate:['巧克力','チョコレート'],tea:['泡茶','お茶'],cleaning:['清潔','洗浄'],grinding:['研磨','ミル'],'gift-box':['禮盒裝','ギフトボックス'],fragrance:['香氛','フレグランス'],woody:['木質香','ウッディ'],fresh:['清新','爽やか'],handcare:['手部保濕','ハンドケア'],unscented:['無香料','無香料'],fashion:['穿搭','ファッション'],patterned:['花鳥圖案','花鳥柄'],travel:['旅行','旅行'],bag:['提袋','バッグ'],black:['黑色','ブラック']};
const dict=[
['coffee',/咖啡|コーヒー|coffee/i],['cooking',/料理|下廚|煮飯|調味/],['snack',/零食|點心|甜點|おやつ|お菓子/],['fragrance',/香水|香氛|香りの贈り物|フレグランス/],['handcare',/護手|手部|ハンドクリーム|ハンドケア/],['drinkware',/水瓶|杯|保溫|保冷|ボトル|タンブラー|マグ|水筒/],['tea',/泡茶|茶壺|ティーポット/],['travel',/旅行|旅遊|旅行用/],['bag',/提袋|袋子|バッグ/],['commute',/通勤|辦公|出勤/],['fashion',/襪|靴下|くつした|クツシタ|ソックス|穿搭/],['light-roast',/淺焙|淺煎|浅煎り/],['dark-roast',/深焙|深煎|深煎り/],['floral',/花香|花の香り/],['fruity',/果香|水果香|フルーティー/],['woody',/木質|ウッディ/],['unscented',/無香|無香料/],['citrus',/柑橘|柚子/],['lightweight',/輕巧|軽い|軽量/],['insulated',/保溫|保温|保冷/],['cleaning',/清潔|洗碗|洗浄/],['black',/黑色|ブラック/]];
export function detectLanguage(q){return /[ぁ-んァ-ヶ]|靴下/.test(q.normalize('NFKC'))?'ja':'zh'}
export function parseDemo(query,language){
 query=query.normalize('NFKC');
 const tags=dict.filter(([,r])=>r.test(query)).map(([t])=>t);
 const categoryMap={coffee:'coffee',cooking:'food',snack:'snack',fragrance:'beauty',handcare:'beauty',drinkware:'vessel',tea:'vessel',bag:'living',fashion:'craft'};
 let categories=[...new Set(tags.map(t=>categoryMap[t]).filter(Boolean))];
 if(tags.includes('cooking'))categories.push('tools');
 const toolsIntent=/廚房工具|廚房用品|廚房選物|廚具|料理工具|烹飪工具|キッチンツール|キッチン用品|調理器具|料理道具/.test(query);
 if(toolsIntent){categories=['tools'];const i=tags.indexOf('cooking');if(i>=0)tags.splice(i,1)}
 const seasoningIntent=/調味料|食材|調味|調味料/.test(query);
 if(seasoningIntent&&!toolsIntent)categories=['food'];
 const equipment=/手沖|手冲|ハンドドリップ|コーヒー器具|コーヒー用品|咖啡工具|咖啡器具|磨豆機|コーヒーミル/.test(query)&&!/咖啡豆|豆子|コーヒー豆/.test(query);
 if(equipment){categories=['vessel','tools'];for(const t of ['coffee','cooking','drinkware']){const i=tags.indexOf(t);if(i>=0)tags.splice(i,1)}tags.push('coffee-equipment')}
 const negated=[];
 if(/不要香|不喜歡香|無香|香りなし|無香料/.test(query))negated.push('fragrance','citrus','floral','woody','fruity');
 if(/不要辣|不吃辣|辛くない|辛いものは苦手/.test(query))negated.push('spicy');
 if(/不要咖啡|咖啡除外|コーヒー以外/.test(query)){negated.push('coffee');categories=categories.filter(c=>c!=='coffee')}
 const num=query.replace(/,/g,'').match(/(?:預算|预算|予算|NT\$|TWD|台幣|台湾ドル)\s*(\d+(?:\.\d+)?)/i)||query.replace(/,/g,'').match(/(\d+(?:\.\d+)?)\s*(?:元|円|以下|以內|以内|台湾ドル)/);
 const currency=/日圓|日幣|JPY|円/i.test(query)?'JPY':'TWD';
 const range=query.replace(/,/g,'').match(/(\d+)\s*[～~到至-]\s*(\d+)/);
 let budgetMax=num?Number(num[1]):null,budgetMin=null;
 if(range){budgetMin=Number(range[1]);budgetMax=Number(range[2])}
 const gift=/送禮|禮物|生日|贈り物|ギフト|プレゼント|誕生日/.test(query);
 const recipient=query.match(/媽媽|母親|母|爸爸|父親|父|同事|同僚|朋友|友人|恋人|伴侶|自己/);
 const unknown=/IH|直火|明火|洗碗機|微波|食洗機|電子レンジ|不吃辣|不要辣|辛くない|辛いものは苦手|過敏|アレルギー|孕|妊娠|嬰兒|赤ちゃん|治療|治す|無麩質|グルテン|純素|ヴィーガン|低敏/i.test(query);
 const unsupported=/手機|手機殼|電腦|ノートパソコン|スマートフォン|電視|テレビ/.test(query);
 const giftUnclear=gift&&!categories.length;
 const total=/總預算|總共|合計|全部で/.test(query);
 return {language,categories:[...new Set(categories)],budgetMin,budgetMax,currency,budgetScope:total?'total':'per_item',uses:tags.filter(t=>!['floral','fruity','woody','unscented','citrus'].includes(t)),preferences:tags.filter(t=>['floral','fruity','woody','unscented','citrus'].includes(t)),excludedTags:negated,recipient:recipient?.[0]||null,gift,unverifiedRequirements:unknown?['allergens_or_medical_suitability']:[],needsClarification:currency!=='TWD'||total||unsupported||giftUnclear||(!categories.length&&!tags.length),clarificationReason:currency!=='TWD'?'currency':total?'total_budget':unsupported?'outside_catalog':giftUnclear?'gift_preferences':(!categories.length&&!tags.length)?'unclear_request':null};
}
export function candidates(catalog,c){
 if(c.needsClarification||c.unverifiedRequirements.length)return [];
 const tags=[...c.uses,...c.preferences].filter(t=>!c.excludedTags.includes(t));
 return catalog.products.filter(p=>p.activeSnapshot&&p.stockSnapshot>0&&p.currency===c.currency&&(c.budgetMax===null||p.price<=c.budgetMax)&&(c.budgetMin===null||p.price>=c.budgetMin)&&(!c.categories.length||p.categories.some(k=>c.categories.includes(k)))&&!p.tags.some(t=>c.excludedTags.includes(t)))
 .map(p=>({p,matched:p.tags.filter(t=>tags.includes(t)),score:p.tags.filter(t=>tags.includes(t)).length*4+(c.gift&&p.tags.includes('gift-box')?6:0)}))
 .filter(x=>!tags.length||tags.every(t=>x.p.tags.includes(t))).sort((a,b)=>b.score-a.score||a.p.price-b.p.price);
}
const messages={
zh:{unclear_request:'目前還無法辨識你想找的商品。請補充商品類別或用途，例如廚房工具、咖啡、護手霜；不會任意推薦低價商品。',gift_preferences:'生日禮物想送哪一類？可以先選咖啡、杯子、護手霜或香氛，也可以補充收禮者的喜好。會保留你的預算，再找符合的商品；不會只因便宜就推薦。',currency:'商品價格為台幣。請將預算改為台幣後再試；這個 PoC 不自行換算匯率。',total_budget:'目前比較的是每件商品價格。請提供單件預算；這一版尚未計算整組購物清單。',outside_catalog:'這批測試商品沒有符合的品項。請改試咖啡、餐桌器物、料理、香氛或生活選物。',unknown:'目前資料不足以確認你指定的限制（例如不辣、熱源／清洗相容性、過敏原或特殊使用適合性），暫不推薦。請查看商品查核資料或放寬條件。',none:'目前沒有符合條件的商品。可以提高預算或放寬分類再試。',few:'符合條件的商品不足 3 件，以下只列出符合的選項，不加入不相符商品。',ok:'從 fréa 測試商品中，為你挑選以下選項。',gift:'送禮建議依用途與預算評估；未確認收禮者個人喜好或禮品包裝。'},
ja:{unclear_request:'お探しの商品をまだ特定できません。調理器具、コーヒー、ハンドクリームなど、カテゴリーや用途を教えてください。',gift_preferences:'どのような贈り物をお探しですか？コーヒー、マグ・ボトル、ハンドクリーム、フレグランスから選ぶか、相手の好みを教えてください。入力した予算を引き継いで探します。',currency:'商品価格は台湾ドルです。予算を台湾ドルで入力してください。この PoC では為替換算は行いません。',total_budget:'現在は商品1点あたりの予算で比較します。1点あたりの予算を入力してください。',outside_catalog:'今回のテスト商品には該当する商品がありません。コーヒー、食器、料理用品、香り、生活雑貨でお試しください。',unknown:'辛味、熱源・洗浄方法、アレルギーなど、指定された制限を十分に確認できないため、今回は推薦を控えます。',none:'条件に合う商品がありません。予算やカテゴリーを変更してお試しください。',few:'条件に合う商品が3点未満のため、該当する商品のみをご案内します。',ok:'fréa のテスト商品から、次の商品を選びました。',gift:'ギフト提案は用途と予算に基づきます。相手の好みやラッピングは未確認です。'}
};
export function compose(catalog,c,chosen,mode,meta={}){
 const lang=c.language, m=messages[lang],allowed=candidates(catalog,c);
 const ids=new Set();const valid=[];
 for(const item of chosen){const hit=allowed.find(x=>x.p.id===item.id);if(!hit||ids.has(item.id))continue;ids.add(item.id);valid.push(hit);if(valid.length===5)break}
 const recommendations=valid.map(({p,matched})=>({product:p,evidenceFields:['price','usage',...matched.length?['tags']:[]],reason:lang==='ja'?
 'ご希望との共通点：'+(matched.map(t=>tagLabels[t]?.[1]||t).join('・')||'予算内の候補')+'。'+p.usage.ja+' 価格は NT$'+p.price+'。':
 '符合需求：'+(matched.map(t=>tagLabels[t]?.[0]||t).join('、')||'預算內的選項')+'。'+p.usage.zh+' 單件價格 NT$'+p.price+'。'}));
 return {language:lang,mode,catalogVersion:catalog.version,logicVersion:VERSION,conditions:c,recommendations,message:c.needsClarification?m[c.clarificationReason]||m.none:c.unverifiedRequirements.length?m.unknown:!valid.length?m.none:valid.length<3?m.few:m.ok,giftNote:c.gift?m.gift:null,...meta};
}
export function recommendDemo(catalog,query,lang){const c=parseDemo(query,lang||detectLanguage(query));return compose(catalog,c,candidates(catalog,c).slice(0,5).map(x=>({id:x.p.id})),'demo')}
