(() => {
  function refresh(){
    const badge=document.getElementById('homeCartCount');if(!badge)return;
    let count=0;try{const cart=JSON.parse(localStorage.getItem('frea_demo_cart_v1')||'[]');if(Array.isArray(cart))count=cart.reduce((n,p)=>n+Math.max(0,Number(p.quantity)||0),0);}catch{}
    if(badge.textContent!==String(count))badge.textContent=String(count);
  }
  refresh();window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);
  document.addEventListener('click',()=>setTimeout(refresh,0));
  setInterval(()=>{if(!document.hidden)refresh();},1000);
})();
