const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../admin-receipt-editor.js'),C=require('../admin-inventory-core.js');
function row(){
 const controls=new Map();
 const r={dataset:{purchaseItemId:'line'},events:{},set innerHTML(html){this.html=html;for(const tag of html.matchAll(/<[^>]+>/g)){for(const m of tag[0].matchAll(/\b(data-purchase-[a-z-]+)(?=\s|>)/g)){const el={value:tag[0].match(/\bvalue="([^"]*)"/)?.[1]||'',hidden:false,disabled:false,required:false,innerHTML:'',textContent:'',matches(q){return q==='['+m[1]+']'}};controls.set('['+m[1]+']',el)}}},querySelector(q){if(!controls.has(q))throw Error('missing '+q);return controls.get(q)},addEventListener(e,fn){this.events[e]=fn}};
 return r;
}
const data={currency:'JPY',masterProducts:[{id:'m',name:'�M',product_code:'FR1'}],costScenarios:[],inventory:{skus:[{id:'s',product_master_id:'m',specification:'�ա�355ml',unit:'��'}],bindings:[]},personalRequests:[{id:7,request_number:'PS1',status:'confirmed',items:[{name:'�I�]',specification:'NV��S',quantity:2}]},{id:9,request_number:'CANCEL',status:'cancelled',items:[{name:'�����~',quantity:1}]}]};
test('one-time purchase serializes direct order reference without a master ID',()=>{
 const r=row();E.populate(r,null,data);
 r.querySelector('[data-purchase-kind]').value='personal';r.events.change({target:r.querySelector('[data-purchase-kind]')});
 r.querySelector('[data-purchase-personal]').value='7:0';r.events.change({target:r.querySelector('[data-purchase-personal]')});
 r.querySelector('[data-purchase-price]').value='2000';
 const p=E.serialize(r);assert.equal(p.product_master_id,null);assert.equal(p.personal_request_id,7);assert.equal(p.personal_item_index,0);assert.equal(p.quantity,2);assert.equal(p.personal_snapshot.specification,'NV��S');
 assert.equal(r.querySelector('[data-purchase-product]').required,false);assert.equal(r.querySelector('[data-purchase-personal]').required,true);
 assert.ok(!E.personalChoices(data.personalRequests).some(c=>c.id===9));
});
test('formal catalog item retains master, variant, price and quantity',()=>{
 const r=row();E.populate(r,{id:'l',product_master_id:'m',inventory_sku_id:'s',quantity:3,unit_cost:100},data);
 assert.deepEqual(E.serialize(r),{id:'l',product_master_id:'m',cost_scenario_id:null,inventory_sku_id:'s',personal_request_id:null,personal_item_index:null,personal_snapshot:null,quantity:3,unit_cost:100});
});
test('editing a direct purchase retains exact historical personal snapshot',()=>{
 const r=row(),snap={name:'�I�]',specification:'NV��S',quantity:2};
 E.populate(r,{id:'l',product_master_id:null,personal_request_id:7,personal_item_index:0,personal_snapshot:snap,quantity:1,unit_cost:2000},data);
 assert.deepEqual(E.serialize(r).personal_snapshot,snap);assert.equal(E.serialize(r).product_master_id,null);
});
test('purchase snapshot includes arrival fields for optimistic concurrency',()=>{
 const o={supplier_id:'v',ordered_at:'2026-11-27',notes:'',currency:'JPY',status:'received',received_at:'2026-11-27',purchase_order_items:[{id:'a',product_master_id:null,personal_request_id:7,personal_item_index:0,personal_snapshot:{name:'�I�]',specification:'NV��S',quantity:2},inventory_sku_id:'s',quantity:2,unit_cost:'2000',received_quantity:'2',received_on:'2026-11-27'}]};
 assert.equal(E.snapshotPurchase(o).items[0].received_quantity,2);assert.equal(E.snapshotPurchase(o).items[0].personal_item_index,0);
});
test('direct personal purchase and demand reconcile with no catalog master',()=>{
 const snap={name:'�I�]',specification:'NV��S',quantity:2};
 const d={purchaseOrders:[{order_number:'PO1',status:'received',purchase_order_items:[{id:'p',product_master_id:null,personal_request_id:7,personal_item_index:0,personal_snapshot:snap,inventory_sku_id:'s',quantity:2,received_quantity:2,received_on:'2026-11-27'}]}],personalRequests:data.personalRequests.slice(0,1)};
 const bindings=C.sources(d).map(s=>({source_type:s.type,source_key:s.key,source_snapshot:s.snapshot,sku_id:'s',purpose:'sale',quantity_factor:1,received_quantity:0}));
 const result=C.calculate(d,[{id:'s',product_master_id:null,personal_request_id:7,personal_item_index:0,specification:'NV��S'}],bindings,[]);
 assert.equal(result.unresolved,0);assert.equal(result.rows[0].received,2);assert.equal(result.rows[0].balance,0);assert.equal(result.rows[0].available,0);
});
test('pending online purchase does not become physical stock',()=>{
 const snap={name:'�I�]',specification:'NV��S',quantity:2};
 const d={purchaseOrders:[{status:'ordered',purchase_order_items:[{id:'p',product_master_id:null,personal_request_id:7,personal_item_index:0,personal_snapshot:snap,inventory_sku_id:'s',quantity:2,received_quantity:0}]}],personalRequests:[]};
 const s=C.sources(d)[0],r=C.calculate(d,[{id:'s'}],[{source_type:'purchase',source_key:'p',source_snapshot:s.snapshot,sku_id:'s',purpose:'sale',quantity_factor:1,received_quantity:2}],[]).rows[0];
 assert.equal(r.received,0);assert.equal(r.pending,2);
});

