(function(){
"use strict";
const buttons=[...document.querySelectorAll("[data-inventory-panel]")],panels=[...document.querySelectorAll(".inventory-utility-panel")];
function show(id){for(const panel of panels)panel.hidden=panel.id!==id;for(const button of buttons)button.setAttribute("aria-expanded",String(button.dataset.inventoryPanel===id));}
for(const button of buttons)button.addEventListener("click",()=>{const panel=document.getElementById(button.dataset.inventoryPanel);if(panel)show(panel.hidden?panel.id:null);});
for(const button of document.querySelectorAll("[data-close-inventory-panel]"))button.addEventListener("click",()=>{show(null);buttons.find(b=>b.dataset.inventoryPanel===button.dataset.closeInventoryPanel)?.focus();});
})();