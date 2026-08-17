const qs=(s,e=document)=>e.querySelector(s),qsa=(s,e=document)=>[...e.querySelectorAll(s)];
function toast(m){const t=qs(".toast");if(!t)return;t.textContent=m;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
const qf=qs("#quickQuote");if(qf)qf.addEventListener("submit",e=>{e.preventDefault();const p=new URLSearchParams(),a=qs("[name=quick_product]",qf).value.trim(),b=qs("[name=quick_url]",qf).value.trim();if(a)p.set("product",a);if(b)p.set("url",b);location.href="personal-shopping.html?"+p});
function addRow(v={}){
  const l=qs("#itemList");if(!l)return;
  const r=document.createElement("div");r.className="item-row";
  const number=document.createElement("div");number.textContent=l.children.length+1;
  const name=document.createElement("input");name.dataset.itemName="";name.placeholder="商品名稱";name.maxLength=200;name.value=String(v.name||"");
  const url=document.createElement("input");url.dataset.itemUrl="";url.placeholder="商品連結";url.maxLength=1000;url.value=String(v.url||"");
  const quantity=document.createElement("input");quantity.dataset.itemQuantity="";quantity.type="number";quantity.min="1";quantity.max="99";quantity.value=String(v.qty||1);
  const remove=document.createElement("button");remove.type="button";remove.className="remove";remove.setAttribute("aria-label","移除商品");remove.textContent="×";
  remove.onclick=()=>{r.remove();qsa(".item-row",l).forEach((x,i)=>x.firstElementChild.textContent=i+1)};
  r.append(number,name,url,quantity,remove);l.appendChild(r);
}
const itemList=qs("#itemList");
if(itemList){
  addRow();addRow();qs("#addItem").onclick=()=>addRow();
  const params=new URLSearchParams(location.search),first=qsa(".item-row",itemList)[0];
  if(params.get("product"))qs("[data-item-name]",first).value=params.get("product");
  if(params.get("url"))qs("[data-item-url]",first).value=params.get("url");
  const form=qs("#personalForm");
  form.addEventListener("submit",async e=>{
    e.preventDefault();
    const message=qs("#personalFormMessage"),button=qs("#personalSubmit");
    const items=qsa(".item-row",itemList).map(row=>({name:qs("[data-item-name]",row).value.trim(),url:qs("[data-item-url]",row).value.trim(),quantity:Math.min(99,Math.max(1,Math.round(Number(qs("[data-item-quantity]",row).value)||1)))})).filter(item=>item.name||item.url);
    if(!items.length||items.some(item=>!item.name)){message.hidden=false;message.textContent="請至少完整填寫一項商品名稱。";return}
    if(!window.supabase||!window.freaSupabaseConfig){message.hidden=false;message.textContent="系統目前無法連線，請稍後再試。";return}
    const client=window.supabase.createClient(window.freaSupabaseConfig.url,window.freaSupabaseConfig.publishableKey);
    const {data:{user},error:userError}=await client.auth.getUser();
    if(userError||!user){location.href="register.html?view=login&return=personal-shopping.html";return}
    const fd=new FormData(form);
    const requestNumber="PS"+new Date().toISOString().slice(0,10).replaceAll("-","")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
    button.disabled=true;button.textContent="送出中…";
    const {error}=await client.from("personal_shopping_requests").insert({request_number:requestNumber,user_id:user?user.id:null,customer_name:String(fd.get("customer_name")||"").trim(),email:String(fd.get("email")||"").trim(),phone:String(fd.get("phone")||"").trim(),line_id:String(fd.get("line_id")||"").trim(),note:String(fd.get("note")||"").trim(),items});
    button.disabled=false;button.textContent="送出代購需求";message.hidden=false;
    if(error){message.textContent="代購需求送出失敗，請稍後再試。";return}
    form.reset();itemList.innerHTML="";addRow();addRow();message.textContent="代購需求已成立，編號："+requestNumber+"。我們確認供貨與費用後會與您聯繫。";toast("代購需求已送出");
  });
}

