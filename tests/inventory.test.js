const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../admin-inventory-core.js');
const sku=[{id:'red',product_master_id:'m',specification:'��'},{id:'blue',product_master_id:'m',specification:'��'}];
function fixture(){
 const d={purchaseOrders:[{order_number:'P1',status:'ordered',purchase_order_items:[{id:'p',product_master_id:'m',quantity:5}]}],
 orders:[{order_number:'O1',status:'processing',order_items:[{id:1,product_name:'�M',specification:'��',quantity:3}]}],personalRequests:[]};
 const b=C.sources(d).map(s=>({source_type:s.type,source_key:s.key,source_snapshot:s.snapshot,sku_id:'red',quantity_factor:1,purpose:'sale',received_quantity:s.type==='purchase'?4:0}));
 return {d,b};
}
test('partial arrival, reservations, available and procurement balance are distinct',()=>{
 const {d,b}=fixture(),r=C.calculate(d,sku,b,[]).rows[0];
 assert.deepEqual([r.purchased,r.received,r.pending,r.onhand,r.reserved,r.available,r.balance],[5,4,1,4,3,1,2]);
});
test('completed shipment consumes once and same arrival saved twice is idempotent',()=>{
 const {d,b}=fixture();d.orders[0].status='completed';
 const first=C.calculate(d,sku,b,[]).rows[0],second=C.calculate(d,sku,b,[]).rows[0];
 assert.deepEqual([first.shipped,first.reserved,first.onhand,first.available],[3,0,1,1]);assert.deepEqual(first,second);
});
test('cancelled purchase and order contribute nothing',()=>{
 const {d,b}=fixture();d.orders[0].status='cancelled';d.purchaseOrders[0].status='cancelled';
 const r=C.calculate(d,sku,b,[]);assert.equal(r.rows[0].purchased,0);assert.equal(r.rows[0].demand,0);assert.equal(r.unresolved,0);
});
test('color variants do not offset another color shortage',()=>{
 const {d,b}=fixture();b[1].sku_id='blue';const r=C.calculate(d,sku,b,[]);
 assert.equal(r.rows[0].balance,5);assert.equal(r.rows[1].shortage,3);
});
test('edited source quantity invalidates old mapping, not silently reused',()=>{
 const {d,b}=fixture();d.orders[0].order_items[0].quantity=4;
 const r=C.calculate(d,sku,b,[]);assert.equal(r.unresolved,1);assert.equal(r.rows[0].demand,0);
});
test('tasting and freight excluded; physical adjustments remain traceable',()=>{
 const {d,b}=fixture();b[0].purpose='sample';const r=C.calculate(d,sku,b,[{sku_id:'red',quantity:-1}]);
 assert.equal(r.excluded,1);assert.equal(r.rows[0].purchased,0);assert.equal(r.rows[0].available,-4);
});
test('six-piece purchase set matches six individually ordered items',()=>{
 const {d,b}=fixture();d.purchaseOrders[0].purchase_order_items[0].quantity=1;b[0].source_snapshot.quantity=1;b[0].received_quantity=1;b[0].quantity_factor=6;
 d.orders[0].order_items[0].quantity=6;b[1].source_snapshot.quantity=6;
 const r=C.calculate(d,sku,b,[]).rows[0];assert.equal(r.balance,0);assert.equal(r.available,0);
});
test('personal item index shift or changed specification invalidates binding',()=>{
 const d={personalRequests:[{id:4,request_number:'PS',status:'purchased',items:[{name:'�U',specification:'NV/S',quantity:1}]}]};
 const s=C.sources(d)[0],b=[{source_type:s.type,source_key:s.key,source_snapshot:s.snapshot,sku_id:'red',quantity_factor:1,purpose:'sale'}];
 d.personalRequests[0].items[0]={name:'�U',specification:'GY/F',quantity:1};assert.equal(C.calculate(d,sku,b,[]).unresolved,1);
});
test('missing mappings never imply complete zero inventory; removed sources flagged',()=>{
 const {d,b}=fixture();assert.equal(C.calculate(d,sku,[],[]).unresolved,2);
 d.orders=[];assert.equal(C.calculate(d,sku,b,[]).orphaned.length,1);
});

