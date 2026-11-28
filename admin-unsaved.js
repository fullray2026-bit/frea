(function(root){
"use strict";
const regions='form:not(#adminLoginForm),[data-order-editor],[data-personal-editor],.member-admin-controls,#activity-sort';
const entries=new Map();let extraDirty=()=>false,refreshHandler=null;
const fields=r=>[...r.querySelectorAll('input,textarea,select')].filter(e=>!['search','submit','button','reset'].includes(e.type));
function snapshot(r){return JSON.stringify([ [...r.querySelectorAll("[data-activity-id]")].map(e=>e.dataset.activityId), fields(r).map((e,i)=>[e.name||e.id||i,e.type,e.type==="file"?[...e.files].map(f=>[f.name,f.size,f.lastModified]):e.type==="checkbox"||e.type==="radio"?e.checked:e.multiple?[...e.selectedOptions].map(o=>o.value):e.value])]);}
function scan(){for(const r of entries.keys())if(!r.isConnected)entries.delete(r);document.querySelectorAll(regions).forEach(r=>{if(!entries.has(r))entries.set(r,{baseline:snapshot(r),touched:false});});}
function mark(scope=document){scan();for(const [r,s]of entries)if(r===scope||scope.contains(r)){s.baseline=snapshot(r);s.touched=false;}}
function ownDirty(){scan();return [...entries].some(([r,s])=>s.touched&&snapshot(r)!==s.baseline);}
function childrenDirty(){return [...document.querySelectorAll('iframe[src]')].some(f=>{try{return !!f.contentWindow.FreaAdminFrame?.dirty();}catch{return false;}});}
function dirty(){return ownDirty()||extraDirty()||childrenDirty();}
function confirmLeave(action="繼續"){return !dirty()||root.confirm('有尚未儲存的修改。'+action+'可能放棄這些內容，確定繼續？');}
const actions='[data-admin-view],#adminRefresh,#adminLogout,#inventoryRefresh,[data-merch-reload],[data-master-merch-reload],[data-tab],[data-panel],#reload,#newTask,#newConversation,#newArtifact,[data-work-panel] .item-list button';
document.addEventListener('click',e=>{const b=e.target.closest?.(actions);if(b&&!confirmLeave('切換或重新整理')){e.preventDefault();e.stopImmediatePropagation();return;}const r=e.target.closest?.(regions);if(r&&e.target.closest?.('button')){scan();entries.get(r).touched=true;}},true);
const filterIds=new Set(['memberSearch','memberStatusFilter','orderSearch','orderStatusFilter','personalSearch','personalStatusFilter','productSearch','productStatusFilter','productCategoryFilter','productSort','masterSearch','masterStatusFilter','costSearch','purchaseSearch','purchaseTypeFilter']),filterValues=new WeakMap();
document.addEventListener('focusin',e=>{if(filterIds.has(e.target.id))filterValues.set(e.target,e.target.value);},true);
for(const kind of ['input','change'])document.addEventListener(kind,e=>{if(filterIds.has(e.target.id)){if(!confirmLeave('變更篩選')){e.target.value=filterValues.get(e.target)||'';e.preventDefault();e.stopImmediatePropagation();return;}filterValues.set(e.target,e.target.value);}const r=e.target.closest?.(regions);if(!r||e.target.type==="search")return;scan();entries.get(r).touched=true;},true);
document.addEventListener('reset',e=>queueMicrotask(()=>mark(e.target)),true);
document.addEventListener('close',e=>{if(e.target.tagName==="DIALOG")mark(e.target);},true);
root.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue="";}});
new MutationObserver(records=>{scan();for(const m of records)if(m.type==="attributes"&&m.target.matches(regions))mark(m.target);}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
root.FreaUnsaved={scan,mark,isDirty:dirty,confirm:confirmLeave};
root.FreaAdminFrame={register(refresh,isDirty=()=>false){refreshHandler=refresh;extraDirty=isDirty;mark();},dirty,async refresh(){if(!refreshHandler)throw Error('此頁尚未完成載入，請稍後重試。');await refreshHandler();mark();return new Date().toISOString();}};
scan();
})(window);