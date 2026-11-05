/* Browser cart ownership; order authorization remains on the server. */
(() => {
 const legacy='frea_demo_cart_v1', prefix='frea_cart_v2:', authKey='sb-ixxatlyckbtihlnmlqnw-auth-token';
 function identity(){try{const s=JSON.parse(localStorage.getItem(authKey)||'null');return s?.user?.id&&!s.user.is_anonymous?s.user.id:'guest'}catch{return 'guest'}}
 let owner=identity();
 function changed(){const next=identity();if(next===owner)return;owner=next;window.dispatchEvent(new Event('frea-cart-updated'));if(/\/(cart|checkout)\.html$/.test(location.pathname))location.reload()}
 window.FreaCartStorage={
 getItem(key){return localStorage.getItem(key===legacy?prefix+identity():key)},
 setItem(key,value){if(key===legacy&&identity()!==owner){changed();throw Error('帳號已切換，請重新操作購物車。')}localStorage.setItem(key===legacy?prefix+owner:key,value)},
 removeItem(key){if(key===legacy&&identity()!==owner){changed();throw Error('帳號已切換，請重新整理。')}localStorage.removeItem(key===legacy?prefix+owner:key);window.dispatchEvent(new Event('frea-cart-updated'))}
 };
 // Unowned legacy carts are retained for recovery but never assigned to another account.
 window.addEventListener('storage',changed);window.addEventListener('pageshow',changed);window.addEventListener('focus',changed);setInterval(changed,250);
})();
