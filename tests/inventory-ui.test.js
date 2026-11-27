const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('inventory loads all four real schemas, renders, filters, opens and saves a receipt',async()=>{
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'',innerHTML:'',style:{},dataset:{},events:{},addEventListener(event,fn){this.events[event]=fn},showModal(){this.open=true},close(){this.open=false},reset(){}});return nodes.get(id)};
 const C=require('../admin-inventory-core.js');
 const source={purchaseOrders:[{order_number:'PO1',status:'ordered',ordered_at:'2026-11-26',purchase_order_items:[{id:'p',quantity:2,product_master_id:'m',product_master:{name:'�M'}}]}],masterProducts:[{id:'m',name:'�M',product_code:'FR1'}]};
 const tables={inventory_skus:[{id:'s',product_master_id:'m',specification:'�`�Ǻ��500ml',unit:'��'}],inventory_bindings:[{id:'b',source_type:'purchase',source_key:'p',source_snapshot:{master:'m',quantity:2},sku_id:'s',purpose:'sale',quantity_factor:1,received_quantity:0,updated_at:'v1'}],inventory_adjustments:[],inventory_history:[]};
 let update;
 const client={from(table){let mode='read';return {select(){return this},order(column){assert.equal(column,'id');return this},async range(){return {data:tables[table],error:null}},update(v){update=v;mode='update';return this},eq(){return this},then(resolve){resolve({data:[{id:'b'}],error:null})}}}};
 const context={window:{FreaInventoryCore:C},document:{getElementById:node},Intl,Date,Number,String,JSON,Map,Set,crypto:require('node:crypto').webcrypto,setTimeout};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/../admin-inventory.js','utf8'),context);
 const ui=context.window.FreaInventory;ui.init(client);ui.setData(source);
 await new Promise(r=>setImmediate(r));
 assert.match(node('inventoryRows').innerHTML,/�`�Ǻ�/);assert.match(node('inventorySummary').textContent,/�ݹ������ӷ��ܧ� 0/);
 node('inventorySources').events.click({target:{closest(){return {dataset:{inventoryMap:'purchase:p'}}}}});
 assert.equal(node('inventoryMapDialog').open,true);
 node('inventoryMapSku').value='s';node('inventoryMapMaster').value='m';node('inventoryPurpose').value='sale';node('inventoryFactor').value='1';node('inventoryReceived').value='2';node('inventoryReceivedOn').value='2026-11-27';node('inventoryMapNote').value='�L�I�T�{';
 await node('inventoryMapForm').events.submit({preventDefault(){},currentTarget:node('inventoryMapForm')});
 assert.equal(update.received_quantity,2);assert.equal(update.received_on,'2026-11-27');assert.equal(node('inventoryMapDialog').open,false);
});

