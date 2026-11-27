const test=require('node:test'),assert=require('node:assert/strict');
const V=require('../admin-purchase-view.js'),C=require('../admin-inventory-core.js'),E=require('../admin-receipt-editor.js');
const masters=[{id:'r',name:'�`�A�M',product_code:'FR-000107',catalog_type:'regular'},{id:'p',name:'�N�ʦ�',product_code:null,catalog_type:'personal'}];
const orders=[{id:'po',order_number:'PO1',ordered_at:'2026-11-27',currency:'JPY',purchase_order_items:[{id:'a',product_master_id:'r',quantity:2,unit_cost:100},{id:'b',product_master_id:'p',quantity:1,unit_cost:500},{id:'c',personal_request_id:1,personal_item_index:0,personal_snapshot:{name:'�I�]',specification:'NV/S'},quantity:1,unit_cost:2000}]}];
test('mixed receipt regular filter shows only regular lines and matching subtotal',()=>{
 const rows=V.filter(orders,masters,{type:'regular'});assert.equal(rows.length,1);assert.equal(rows[0].purchase_order_items.length,1);assert.equal(V.amount(rows[0].purchase_order_items),200);
 assert.equal(orders[0].purchase_order_items.length,3);
});
test('personal filter includes both removed-code historical purchases and direct purchases',()=>{
 const rows=V.filter(orders,masters,{type:'personal'});assert.equal(rows[0].purchase_order_items.length,2);assert.equal(V.amount(rows[0].purchase_order_items),2500);
});
test('date, type and search filters combine; invalid date range is explicit',()=>{
 assert.equal(V.filter(orders,masters,{type:'personal',search:'�I�]'})[0].purchase_order_items.length,1);
 assert.equal(V.filter(orders,masters,{from:'2026-11-28'}).length,0);
 assert.equal(V.filter(orders,masters,{from:'2026-11-28',to:'2026-11-27'}),null);
});
test('regular stock excludes legacy and direct one-time products, including adjustments',()=>{
 const data={masterProducts:masters,purchaseOrders:[{...orders[0],status:'received',purchase_order_items:orders[0].purchase_order_items.map(i=>({...i,received_quantity:i.quantity}))}],orders:[],personalRequests:[]};
 const skus=[{id:'rs',product_master_id:'r'},{id:'ps',product_master_id:'p'},{id:'ds',product_master_id:null,personal_request_id:1}];
 const bindings=C.sources(data).map((s,n)=>({source_type:s.type,source_key:s.key,source_snapshot:s.snapshot,purpose:'sale',sku_id:skus[n].id,quantity_factor:1}));
 const r=C.calculate(data,skus,bindings,[{sku_id:'ps',quantity:10}],{scope:'regular'});
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].purchased,2);assert.equal(r.sources.length,1);assert.equal(r.unresolved,0);
});
test('personal order for a regular catalog SKU still reserves regular inventory',()=>{
 const data={masterProducts:masters,personalRequests:[{id:1,request_number:'PS1',status:'confirmed',items:[{name:'�`�A�M',specification:'��',quantity:1}]}]};
 const source=C.sources(data)[0],r=C.calculate(data,[{id:'rs',product_master_id:'r'}],[{source_type:'personal',source_key:source.key,source_snapshot:source.snapshot,purpose:'sale',sku_id:'rs',quantity_factor:1}],[],{scope:'regular'});
 assert.equal(r.rows[0].reserved,1);assert.equal(r.rows[0].shortage,1);
});
test('unmatched one-time personal orders do not pollute stock mapping warnings',()=>{
 const data={masterProducts:masters,personalRequests:[{id:1,status:'confirmed',items:[{name:'�榸�c�l',specification:'��/L',quantity:1}]}]};
 assert.equal(C.calculate(data,[],[],[],{scope:'regular'}).unresolved,0);
});
test('common product name with capacity in specification stays visible for matching',()=>{
 const data={masterProducts:[{id:'c',catalog_type:'regular',name:'�����} Mild Blend�]200g�^',specification:'200g'}],personalRequests:[{id:1,status:'confirmed',items:[{name:'�����} Mild Blend',specification:'�����]200g�^',quantity:1}]}]};
 const r=C.calculate(data,[],[],[],{scope:'regular'});assert.equal(r.unresolved,1);assert.equal(r.sources.length,1);
});

