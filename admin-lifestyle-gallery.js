(function(){
 "use strict";
 const supported=brand=>["lifestyle-picks","fukuoka-coffee","akomeya","kayanoya","kinto"].includes(brand);
 const by=id=>document.getElementById(id);let slots=[null,null],box;
 function visible(){box.hidden=!supported(by("productBrand").value);}
 function draw(){
  box.replaceChildren();const title=document.createElement("p");title.textContent="商品附圖（主圖沿用上方照片，最多三張）";box.append(title);
  const grid=document.createElement("div");grid.style.cssText="display:flex;gap:16px;flex-wrap:wrap";box.append(grid);
  slots.forEach((slot,i)=>{
   const card=document.createElement("div");card.style.cssText="flex:1;min-width:180px";grid.append(card);
   const label=document.createElement("label");label.textContent="附圖 "+(i+1);const input=document.createElement("input");input.type="file";input.accept="image/jpeg,image/png,image/webp";label.append(input);card.append(label);
   input.onchange=async()=>{
    const file=input.files[0];if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>3*1024*1024){alert("附圖請使用 3MB 以內的 JPG、PNG 或 WebP。");input.value="";return;}
    const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();}catch{URL.revokeObjectURL(url);alert("無法讀取這張照片，請換一張。");return;}
    if(slots[i]?.file)URL.revokeObjectURL(slots[i].url);slots[i]={file,url};draw();
   };
   if(slot){const image=document.createElement("img");image.src=slot.url;image.alt="附圖 "+(i+1);image.style.cssText="display:block;width:120px;height:120px;object-fit:contain;margin:8px 0";card.append(image);
    const remove=document.createElement("button");remove.type="button";remove.textContent="移除附圖";remove.onclick=()=>{if(slot.file)URL.revokeObjectURL(slot.url);slots[i]=null;draw();};card.append(remove);
   }
  });
  if(slots.every(Boolean)){const swap=document.createElement("button");swap.type="button";swap.textContent="交換附圖順序";swap.style.marginTop="12px";swap.onclick=()=>{slots.reverse();draw();};box.append(swap);}
 }
 function setup(){if(box)return;box=document.createElement("div");box.className="product-wide";box.id="lifestyleGalleryEditor";box.hidden=true;by("productImage").closest("label").after(box);by("productBrand").addEventListener("change",visible);}
 window.freaLifestyleGalleryEditor={
  load(product){setup();slots.forEach(s=>{if(s?.file)URL.revokeObjectURL(s.url);});slots=[null,null];(product?.gallery_images||[]).slice(0,2).forEach((url,i)=>{slots[i]={url};});draw();visible();},
  async upload(brand,slug,upload){
   if(!supported(brand))return undefined;
   box.inert=true;
   try{const urls=[];for(let i=0;i<slots.length;i++){const s=slots[i];if(!s)continue;if(s.file){const result=await upload(s.file,brand,slug+"-gallery-"+i+"-"+crypto.randomUUID());URL.revokeObjectURL(s.url);slots[i]={url:result.url};}urls.push(slots[i].url);}return urls;}
   finally{box.inert=false;draw();}
  }
 };
})();

