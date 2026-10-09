(function(){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fields={recipientName:'recipient_name',recipientPhone:'recipient_phone',postalCode:'postal_code',address:'address'};
 async function list(client,user){const r=await client.from('member_addresses').select('id,label,recipient_name,recipient_phone,postal_code,address,is_default').eq('user_id',user.id).order('id');if(r.error)throw r.error;return r.data||[]}
 async function save(client,id,label,shipping,def){const r=await client.rpc('save_member_address',{p_id:id||null,p_label:label,p_name:shipping.recipientName,p_phone:shipping.recipientPhone,p_postal:shipping.postalCode,p_address:shipping.address,p_default:!!def});if(r.error)throw r.error;return r.data}
 function fill(form,row){Object.entries(fields).forEach(([field,key])=>form.elements.namedItem(field).value=row?.[key]||'')}
 function shipping(form){return Object.fromEntries(Object.keys(fields).map(k=>[k,form.elements.namedItem(k).value.trim()]))}
 const option=row=>'<option value="'+row.id+'">'+esc(row.label||'常用地址')+'｜'+esc(row.recipient_name)+(row.is_default?'（預設）':'')+'</option>';
 async function member(client,user,form){
  let rows=await list(client,user),busy=false;
  const previous=form.querySelector('[data-address-ui]');if(previous){const grid=previous.querySelector('.form-grid');if(grid)form.prepend(grid);previous.remove();}
  const ui=document.createElement('div');ui.dataset.addressUi='';ui.className='address-book';ui.innerHTML='<label>常用收件資料（最多3組）<select data-select></select></label><label>地址名稱<input data-label maxlength="30" placeholder="例如：住家、公司、媽媽家"></label><label class="address-check"><input type="checkbox" data-default>設為預設收件資料</label><div class="address-actions"><button type="button" data-save>儲存此收件資料</button><button type="button" data-delete>刪除此地址</button></div><p data-message role="status"></p>';
  const grid=form.querySelector('.form-grid');if(grid)ui.insertBefore(grid,ui.querySelector('.address-actions'));
  form.prepend(ui);const select=ui.querySelector('[data-select]'),label=ui.querySelector('[data-label]'),def=ui.querySelector('[data-default]'),msg=ui.querySelector('[data-message]');
  function selectRow(){const row=rows.find(r=>String(r.id)===select.value);fill(form,row);label.value=row?.label||'';def.checked=row?.is_default||!rows.length;ui.querySelector('[data-delete]').disabled=!row;}
  function render(id){select.innerHTML=rows.map(option).join('')+(rows.length<3?'<option value="">＋ 新增收件資料</option>':'');select.value=String(id??rows.find(r=>r.is_default)?.id??rows[0]?.id??'');selectRow()}
  select.onchange=selectRow;render();
  async function run(fn){if(busy)return;busy=true;ui.querySelectorAll('button,select').forEach(e=>e.disabled=true);try{await fn();rows=await list(client,user);render();msg.textContent='收件資料已更新，已成立的訂單不受影響。'}catch(e){msg.textContent=e.message||'儲存失敗，請稍後重試。'}finally{busy=false;ui.querySelectorAll('button,select').forEach(e=>e.disabled=false);ui.querySelector('[data-delete]').disabled=!select.value}}
  ui.querySelector('[data-save]').onclick=()=>run(()=>save(client,select.value,label.value,shipping(form),def.checked));
  ui.querySelector('[data-delete]').onclick=()=>{if(select.value&&confirm('確定刪除這組常用收件資料？已成立訂單不受影響。'))run(async()=>{const r=await client.rpc('delete_member_address',{p_id:select.value});if(r.error)throw r.error})};
 }
 async function checkout(client,user,form){
  const rows=await list(client,user);form.querySelector('[data-checkout-address]')?.remove();
  const ui=document.createElement('div');ui.dataset.checkoutAddress='';ui.className='address-book';ui.innerHTML='<label>選擇收件資料<select data-pick><option value="">使用其他收件資料</option>'+rows.map(option).join('')+'</select></label><label class="address-check"><input type="checkbox" data-save-address>將這組收件資料儲存至會員，方便下次使用</label><div data-options hidden><label>儲存方式<select data-target>'+ (rows.length<3?'<option value="">新增一組收件資料</option>':'<option value="" disabled selected>已滿3組，請選擇要更新的地址</option>')+rows.map(r=>'<option value="'+r.id+'">更新：'+esc(r.label)+'｜'+esc(r.recipient_name)+'</option>').join('')+'</select></label><label>地址名稱<input data-label maxlength="30" placeholder="例如：住家、公司"></label><label class="address-check"><input type="checkbox" data-default>設為預設收件資料</label></div><label class="address-check"><input type="checkbox" data-ezway>以本次收件姓名、手機更新會員的 EZ WAY 實名資料</label><small>僅更新 fréa 會員資料，不會修改 EZ WAY App。寄給他人時請勿勾選。</small>';
  form.querySelector('.checkout-form').prepend(ui);
  const pick=ui.querySelector('[data-pick]'),target=ui.querySelector('[data-target]'),label=ui.querySelector('[data-label]'),def=ui.querySelector('[data-default]'),check=ui.querySelector('[data-save-address]');
  function chosen(){const row=rows.find(r=>String(r.id)===pick.value);fill(form,row);target.value=row?String(row.id):'';label.value=row?.label||'';def.checked=row?.is_default||!rows.length;}
  pick.onchange=chosen;pick.value=String(rows.find(r=>r.is_default)?.id||'');chosen();
  check.onchange=()=>ui.querySelector('[data-options]').hidden=!check.checked;
  target.onchange=()=>{const row=rows.find(r=>String(r.id)===target.value);label.value=row?.label||'';def.checked=row?.is_default||!rows.length};
  return {capture(){if(check.checked&&rows.length>=3&&!target.value)throw new Error('請選擇要更新的常用地址，或取消儲存收件資料。');return {address:check.checked,id:target.value,label:label.value,def:def.checked,ezway:ui.querySelector('[data-ezway]').checked}},async persist(choice,values){const notices=[];if(choice.address){try{await save(client,choice.id,choice.label,values,choice.def);notices.push('常用收件資料已儲存。')}catch{notices.push('訂單已成立，但常用收件資料未能儲存，請至會員中心更新。')}}if(choice.ezway){try{const r=await client.from('ezway_profiles').upsert({user_id:user.id,real_name:values.recipientName,mobile:values.recipientPhone},{onConflict:'user_id'});if(r.error)throw r.error;notices.push('會員 EZ WAY 資料已更新。')}catch{notices.push('訂單已成立，但會員 EZ WAY 資料未能更新，請至會員中心更新。')}}return notices.join(' ')}};
 }
 window.FreaAddressBook={member,checkout,list,save};
})();
