(function(){
 'use strict';
 const form=document.getElementById('personalForm');if(!form?.hasAttribute('data-service-form'))return;
 const ja=document.documentElement.lang==='ja',t=(zh,jp)=>ja?jp:zh;
 const by=id=>document.getElementById(id),field=n=>form.elements.namedItem(n);
 const direction=by('personalDirection'),language=by('personalLanguage'),items=by('itemList'),message=by('personalFormMessage'),submit=by('personalSubmit');
 const params=new URLSearchParams(location.search);if(['jp_to_tw','tw_to_jp'].includes(params.get('direction')))direction.value=params.get('direction');
 const config=window.freaSupabaseConfig;
 const client=config&&window.supabase?window.supabase.createClient(config.url,config.publishableKey):null;
 let user=null,busy=false,signup=false,authBusy=false,requestNumber=null,submittedPayload=null;
 const show=text=>{message.hidden=false;message.textContent=text;};
 function route(){
  const japan=direction.value==='tw_to_jp';
  by('personalTitle').firstChild.textContent=t(japan?'台灣商品自選代購 ':'日本商品自選代購 ',japan?'台湾商品の購入代行 ':'日本商品の購入代行 ');
  by('personalIntro').textContent=t(japan?'把喜歡的台灣商品帶到日本。提供商品名稱、連結與數量，我們確認供貨與配送可行性後，以日圓提供報價。您確認購買並完成福岡銀行 ATM 日圓匯款後，我們再於台灣安排採購。':'提供想購買的日本商品名稱、連結與數量，我們確認供貨與費用後，以新台幣提供報價。您確認購買並完成匯款後，我們再於日本安排採購，寄送至台灣。',japan?'台湾で見つけたお気に入りを、日本の暮らしへ。商品名・URL・数量をお知らせください。在庫と配送の可否を確認し、日本円でお見積もりします。ご承諾と福岡銀行へのATM振込を確認後、台湾で購入を手配します。':'ご希望の日本商品の商品名・URL・数量をお知らせください。在庫と費用を確認し、台湾ドルでお見積もりします。ご承諾・ご入金後に日本で購入し、台湾へ発送します。');
  by('personalRegionLabel').textContent=t(japan?'都道府縣':'縣市',japan?'都道府県':'台湾の県・市');
  by('personalCityLabel').textContent=t(japan?'市區町村':'鄉鎮市區',japan?'市区町村':'区・郷・鎮');
  field('postal_code').pattern=japan?'[0-9]{3}-?[0-9]{4}':'[0-9]{3}([0-9]{2,3})?';
  field('postal_code').placeholder=japan?'123-4567':'111';
  by('personalLanguageLink').href=(ja?'personal-shopping.html':'personal-shopping-ja.html')+'?direction='+direction.value;
  const lines=japan?[
   t('服務說明：','サービスの流れ'),
   t('1. 提交需求後確認供貨與配送可行性，再提供日圓報價。','1. ご依頼後に在庫・配送の可否を確認し、日本円でお見積もりします。'),
   t('2. 確認報價並同意購買後，請以日圓 ATM 匯款至日本福岡銀行；匯款帳戶資訊於報價確認後提供。確認入帳後才採購。','2. お見積もりにご同意後、福岡銀行の指定口座へATMから日本円でお振り込みください。口座情報はお見積もりの確認後にご案内します。入金確認後に購入します。'),
   t('3. 商品寄至指定的日本地址。可配送品項、配送方式與相關費用將於報價時確認。','3. ご指定の日本国内住所へ発送します。配送できる商品・配送方法・関連費用はお見積もり時にご案内します。'),
   t('4. 報價包含商品、台灣國內運費換算日圓，以及國際運費、日本國內運費、關稅及手續費與其他列明費用；未確定費用會另行說明。','4. 商品代金・台湾国内送料を日本円に換算し、国際送料・日本国内送料・関税および手数料・その他の明細をご案内します。未確定の費用は別途ご説明します。')
  ]:[t('服務說明：','サービスの流れ'),t('1. 填寫需求後，fréa 將確認商品供貨狀況並提供新台幣報價。','1. 在庫を確認し、台湾ドルでお見積もりします。'),t('2. 確認報價、同意購買並完成匯款後，再於日本正式下單。','2. お見積もりへのご同意・ご入金後、日本で購入します。'),t('3. 寄送至指定台灣地址。台灣收件與通關資訊將於報價確認時核對。','3. ご指定の台湾の住所へ発送します。受取人・通関情報は見積もり確認時にご確認します。'),t('4. 報價依商品售價、日本國內運費、國際運費、台灣國內運費、關稅及手續費與其他費用計算。','4. 商品代金・日本国内送料・国際送料・台湾国内送料・関税および手数料・その他の費用を明記します。')];
  const notice=by('personalServiceNotice');notice.replaceChildren();lines.forEach((s,i)=>{const el=document.createElement(i?'div':'strong');el.textContent=s;notice.append(el);});
 }
 function add(values={}){
  if(items.children.length>=50)return show(t('每次最多填寫 50 項商品。','1回につき50商品まで入力できます。'));
  const row=document.createElement('div');row.className='item-row';
  const number=document.createElement('div');number.textContent=items.children.length+1;row.append(number);
  for(const [name,label,max] of [['name',t('商品名稱','商品名'),200],['url',t('商品連結','商品URL'),1000],['specification',t('顏色及規格說明（無請填 X）','色・仕様（指定なしの場合は X）'),300],['quantity',t('數量','数量'),99]]){
   const input=document.createElement('input');input.dataset.itemField=name;input.setAttribute('aria-label',label);input.placeholder=label;
   if(name==='quantity'){input.type='number';input.min=1;input.max=99;input.step=1;input.value=values[name]||1;}else{input.maxLength=max;input.value=values[name]||'';if(name==='url')input.type='url';}row.append(input);
  }
  const remove=document.createElement('button');remove.type='button';remove.className='remove';remove.textContent='×';remove.setAttribute('aria-label',t('移除商品','商品を削除'));remove.onclick=()=>{row.remove();[...items.children].forEach((r,i)=>r.firstChild.textContent=i+1);};row.append(remove);items.append(row);
 }
 async function refreshUser(){
  if(!client)return show(t('系統無法連線，請稍後再試。','接続できません。しばらくしてから再度お試しください。'));
  try{
   const {data,error}=await client.auth.getUser();user=error?null:data.user;
   if(by('personalAuth'))by('personalAuth').hidden=!!user;
   if(!user&&!ja){sessionStorage.setItem('freaPersonalDirection',direction.value);location.replace('register.html?view=register&return=personal-shopping.html');return;}
   if(user){const {data:p}=await client.from('profiles').select('full_name,phone').eq('id',user.id).maybeSingle();if(p){if(!field('customer_name').value)field('customer_name').value=p.full_name||'';if(!field('phone').value)field('phone').value=p.phone||'';}}
  }catch(e){show(t('無法讀取登入狀態，請重新整理。','ログイン状態を確認できません。ページを再読み込みしてください。'));}
 }
 if(!params.has('direction')&&!ja){const saved=sessionStorage.getItem('freaPersonalDirection');if(['jp_to_tw','tw_to_jp'].includes(saved))direction.value=saved;sessionStorage.removeItem('freaPersonalDirection');}
 route();direction.addEventListener('change',route);add({name:params.get('product')||'',url:params.get('url')||''});add();by('addItem').onclick=()=>add();
 const auth=by('personalAuth');
 if(auth){
  by('personalAuthMode').onclick=()=>{signup=!signup;auth.querySelectorAll('[data-signup]').forEach(el=>{el.hidden=!signup;el.querySelectorAll('input').forEach(i=>i.required=signup);});by('personalAuthSubmit').textContent=signup?'アカウントを作成':'ログイン';by('personalAuthMode').textContent=signup?'ログインへ':'新規会員登録へ';auth.elements.password.autocomplete=signup?'new-password':'current-password';};
  auth.onsubmit=async e=>{e.preventDefault();if(authBusy||!client)return;authBusy=true;by('personalAuthSubmit').disabled=true;by('personalAuthMode').disabled=true;by('personalAuthMessage').textContent='処理中…';try{
   const email=auth.elements.email.value.trim(),password=auth.elements.password.value;
   const result=signup?await client.auth.signUp({email,password,options:{data:{full_name:auth.elements.name.value.trim(),phone:auth.elements.phone.value.trim(),member_type:'D01',terms_accepted:true,privacy_accepted:true}}}):await client.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   by('personalAuthMessage').textContent=signup&&!result.data.session?'確認メールを送信しました。メール内のリンクで認証後、このページに戻ってログインしてください。':'ログインしました。';auth.elements.password.value='';await refreshUser();
  }catch(e){by('personalAuthMessage').textContent=e.code==='invalid_credentials'?'メールアドレスまたはパスワードをご確認ください。':e.code==='email_not_confirmed'?'確認メールのリンクから認証を完了してください。':'手続きを完了できませんでした。入力内容をご確認のうえ、時間をおいて再度お試しください。';}finally{authBusy=false;by('personalAuthSubmit').disabled=false;by('personalAuthMode').disabled=false;}};
 }
 form.onsubmit=async e=>{
  e.preventDefault();if(busy)return;if(!user){show(t('請先登入會員。','先にログインしてください。'));auth?.scrollIntoView({behavior:'smooth'});return;}
  const list=[...items.children].map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(i=>[i.dataset.itemField,i.dataset.itemField==='quantity'?Number(i.value):i.value.trim()]))).filter(i=>i.name||i.url||i.specification);
  if(!list.length||list.some(i=>!i.name||!i.specification||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99))return show(t('請完整填寫商品名稱、規格及數量；無規格請填 X。','商品名・仕様・数量を入力してください。仕様の指定がない場合は X と入力してください。'));
  if(list.some(i=>i.url&&!/^https?:\/\//i.test(i.url)))return show(t('商品連結請使用 http 或 https 網址。','商品URLは http または https で入力してください。'));
  const japan=direction.value==='tw_to_jp';
  if(['customer_name','phone','recipient','region','city','address_line'].some(n=>!field(n).value.trim()))return show(t('請完整填寫聯絡與收件資料。','連絡先とお届け先を入力してください。'));
  const payload={user_id:user.id,customer_name:field('customer_name').value.trim(),email:user.email,phone:field('phone').value.trim(),line_id:'',note:field('note').value.trim(),items:list,service_direction:direction.value,contact_language:language.value,quote_currency:japan?'JPY':'TWD',payment_method:japan?'fukuoka_bank_atm':'bank_transfer',delivery_address:{country:japan?'JP':'TW',recipient:field('recipient').value.trim(),postal_code:field('postal_code').value.trim(),region:field('region').value.trim(),city:field('city').value.trim(),address_line:field('address_line').value.trim()}};
  const fingerprint=JSON.stringify(payload);if(fingerprint!==submittedPayload){requestNumber='PS'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,12).replaceAll('-','').toUpperCase();submittedPayload=fingerprint;}
  payload.request_number=requestNumber;busy=true;submit.disabled=true;submit.textContent=t('送出中…','送信中…');const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
   const {error}=await client.from('personal_shopping_requests').insert(payload).abortSignal(controller.signal);
   if(error){if(error.code!=='23505')throw error;const {data:existing,error:check}=await client.from('personal_shopping_requests').select('request_number').eq('request_number',requestNumber).eq('user_id',user.id).abortSignal(controller.signal).maybeSingle();if(check||!existing)throw error;}
   show(t('代購需求已成立，編號：','お申し込みを受け付けました。受付番号：')+requestNumber+t('。確認供貨及費用後，我們會以電子郵件聯繫您。','。在庫と費用を確認後、メールでご連絡します。'));items.replaceChildren();add();add();field('note').value='';requestNumber=null;submittedPayload=null;
  }catch(e){show(t('尚未確認送出結果，請稍後重試；相同內容重試不會重複建立。','送信結果を確認できません。時間をおいて再度お試しください。同じ内容の再送で重複登録はされません。'));}finally{clearTimeout(timer);busy=false;submit.disabled=false;submit.textContent=t('送出代購需求','見積もりを依頼する');}
 };
 if(client)client.auth.onAuthStateChange(()=>{setTimeout(refreshUser,0);});refreshUser();
})();
