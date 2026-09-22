(function(){
 "use strict";
 if(!location.pathname.endsWith("/category-lifestyle.html"))return;
 let dialog,photo,counter,previous,next,opener,images=[],index=0,overflow,scrollY,start;
 const safe=value=>{try{const u=new URL(value,location.href);return /^(https?:)$/.test(u.protocol)?u.href:"";}catch{return "";}};
 function urls(row){return [...new Set([row.querySelector(".brand-product-thumb img")?.src,...JSON.parse(row.dataset.galleryImages||"[]")].map(safe).filter(Boolean))].slice(0,3);}
 function setup(){
  if(dialog)return;
  dialog=document.createElement("dialog");dialog.className="lifestyle-gallery-dialog";dialog.setAttribute("aria-label","商品照片");
  dialog.innerHTML='<div class="lg-head"><span class="lg-title"></span><button type="button" class="lg-close" aria-label="關閉商品照片">×</button></div><div class="lg-stage"><img alt=""><p class="lg-error" hidden>照片暫時無法顯示，請切換其他照片。</p></div><div class="lg-nav"><button type="button" class="lg-prev" aria-label="上一張">‹</button><span aria-live="polite"></span><button type="button" class="lg-next" aria-label="下一張">›</button></div>';
  document.body.append(dialog);photo=dialog.querySelector("img");counter=dialog.querySelector(".lg-nav span");previous=dialog.querySelector(".lg-prev");next=dialog.querySelector(".lg-next");
  dialog.querySelector(".lg-close").onclick=()=>dialog.close();previous.onclick=()=>move(-1);next.onclick=()=>move(1);
  dialog.addEventListener("keydown",e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();move(e.key==="ArrowLeft"?-1:1);}});
  dialog.addEventListener("click",e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  const stage=dialog.querySelector(".lg-stage");
  stage.addEventListener("touchstart",e=>{start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
  stage.addEventListener("touchend",e=>{if(!start)return;const t=e.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;start=null;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.3)move(dx<0?1:-1);},{passive:true});
  photo.onerror=()=>{dialog.querySelector(".lg-error").hidden=false;};photo.onload=()=>{dialog.querySelector(".lg-error").hidden=true;};
  dialog.addEventListener("close",()=>{document.body.style.overflow=overflow;opener?.focus({preventScroll:true});window.scrollTo(0,scrollY);photo.removeAttribute("src");});
 }
 function move(step){index=(index+step+images.length)%images.length;photo.src=images[index];photo.alt=dialog.querySelector(".lg-title").textContent+"，第 "+(index+1)+" 張";counter.textContent=(index+1)+"／"+images.length;previous.hidden=next.hidden=images.length<2;dialog.querySelector(".lg-error").hidden=true;}
 function open(row,button){images=urls(row);if(!images.length)return;setup();opener=button;index=0;scrollY=window.scrollY;overflow=document.body.style.overflow;document.body.style.overflow="hidden";dialog.querySelector(".lg-title").textContent=row.dataset.name||"商品照片";dialog.showModal();move(0);}
 function enhance(){
  document.querySelectorAll(".collection-products .brand-product-row").forEach(row=>{
   const thumb=row.querySelector(".brand-product-thumb");if(!thumb)return;
   let badge=thumb.querySelector(".lg-count");
   if(!thumb.dataset.galleryReady){
    thumb.dataset.galleryReady="1";thumb.setAttribute("role","button");thumb.tabIndex=0;thumb.setAttribute("aria-haspopup","dialog");
    thumb.addEventListener("click",()=>open(row,thumb));thumb.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open(row,thumb);}});
    badge=document.createElement("span");badge.className="lg-count";thumb.append(badge);
   }
   const count=urls(row).length;badge.textContent=count>1?"共 "+count+" 張":"放大";thumb.setAttribute("aria-label","放大 "+(row.dataset.name||"商品")+" 照片，共 "+count+" 張");
  });
 }
 const root=document.querySelector(".collection-products");if(!root)return;
 new MutationObserver(records=>{if(records.some(r=>r.type==="attributes"||[...r.addedNodes].some(n=>n.nodeType===1&&n.matches?.(".brand-product-row,.brand-product-list"))))enhance();}).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:["src","data-gallery-images"]});
 enhance();
})();

