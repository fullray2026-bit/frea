(function(){
  "use strict";
  const config=window.freaSupabaseConfig,sdk=window.supabase;
  const client=config&&sdk?sdk.createClient(config.url,config.publishableKey):null;
  const registrationUrl="register.html?view=register&return=checkout.html";
  async function requireMember(){
    if(!client)throw new Error("auth unavailable");
    const {data,error}=await client.auth.getUser();
    if(error&&error.name!=="AuthSessionMissingError"&&![401,403].includes(error.status))throw error;
    if(error||!data?.user||data.user.is_anonymous){window.location.replace(registrationUrl);return null;}
    return data.user;
  }
  window.freaCheckoutAuth={client,requireMember};

  function enhanceCheckout(){
    const form=document.getElementById("checkoutForm");
    if(!form)return;
    const upload=document.querySelector(".upload-box");
    if(upload)upload.remove();
    const head=document.querySelector(".checkout-head p");
    if(head)head.textContent="請再次確認商品、匯款資訊與收件資料。";
    const bank=document.querySelector(".bank-card");
    if(bank){
      bank.innerHTML='<h2 class="serif">匯款資料</h2><div class="frea-bank-content"><div class="frea-bank-copy"><p class="bank-note">請加入 <a href="https://www.thefrea.com/index.html">fréa</a> 的 LINE 索取匯款資料，<a href="https://line.me/ti/p/GPJc_JJFGp" target="_blank" rel="noopener noreferrer">點擊連結加入</a>。</p><p class="bank-note">匯款後請將匯款（轉帳）證明傳送至 <a href="https://www.thefrea.com/index.html">fréa</a> 的 LINE 官方帳號，以利於對帳。</p></div><a class="frea-line-qr" href="https://line.me/ti/p/GPJc_JJFGp" target="_blank" rel="noopener noreferrer" aria-label="掃碼加入 fréa LINE"><img src="assets/line-add-qr.svg" alt="fréa LINE 加好友 QR Code"><span>掃碼加入 LINE</span></a></div>';
      const style=document.createElement("style");style.textContent='.frea-bank-content{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:24px;align-items:center}.frea-line-qr{display:grid;gap:8px;justify-items:center;color:#eee7df!important;text-decoration:none!important;font-size:11px;text-align:center}.frea-line-qr img{display:block;width:88px;height:88px;padding:6px;border-radius:9px;background:#fff}.frea-bank-copy .bank-note:first-child{margin-top:0}.frea-bank-copy .bank-note:first-of-type{padding-top:20px}@media(max-width:420px){.frea-bank-content{grid-template-columns:minmax(0,1fr) 82px;gap:16px}.frea-line-qr img{width:74px;height:74px}}';document.head.appendChild(style);
    }
    const success=document.querySelector("#checkoutSuccess p");
    if(success)success.textContent="請加入 fréa LINE 索取匯款資料，完成匯款後將轉帳證明傳送至 LINE 官方帳號，以利確認款項。";
  }

  document.addEventListener("DOMContentLoaded",enhanceCheckout);
  document.addEventListener("submit",async function(event){
    const form=event.target;if(!form||form.id!=="checkoutForm")return;
    event.preventDefault();event.stopImmediatePropagation();
    if(form.dataset.freaSubmitting==="1")return;
    form.dataset.freaSubmitting="1";
    const submit=form.querySelector('[type="submit"]');const message=document.getElementById("checkoutMessage");
    submit.disabled=true;submit.textContent="訂單送出中…";
    try{
      const user=await requireMember();if(!user)return;
      const items=JSON.parse(localStorage.getItem("frea_demo_cart_v1")||"[]").filter(item=>item.quantity>0);
      if(!items.length)throw new Error("購物車沒有商品。");
      const data=new FormData(form);
      const shipping={postalCode:String(data.get("postalCode")||"").trim(),address:String(data.get("address")||"").trim(),recipientPhone:String(data.get("recipientPhone")||"").trim(),recipientName:String(data.get("recipientName")||"").trim(),ezwayPhone:String(data.get("recipientPhone")||"").trim(),ezwayName:String(data.get("recipientName")||"").trim()};
      const {data:result,error}=await client.functions.invoke("submit-order-pending",{body:{items:items.map(item=>({id:item.productId||item.id,variantId:item.variantId||"",specification:item.spec,quantity:item.quantity})),shipping}});
      if(error||!result||!result.orderNumber)throw new Error(result&&result.error?result.error:"訂單送出失敗，請稍後再試。");
      localStorage.removeItem("frea_demo_cart_v1");form.reset();form.hidden=true;document.getElementById("checkoutSuccess").hidden=false;document.getElementById("successOrderNumber").textContent="訂單編號："+result.orderNumber;window.scrollTo({top:0,behavior:"smooth"});
    }catch(error){message.textContent=error.message||"暫時無法完成結帳，請稍後再試。";message.className="checkout-message error";}
    finally{form.dataset.freaSubmitting="0";submit.disabled=false;submit.textContent="訂單送出";}
  },true);
})();
