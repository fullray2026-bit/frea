alter table public.purchase_order_items add column receipt_specification text check (length(receipt_specification)<=500);
CREATE OR REPLACE FUNCTION public.inventory_source_snapshot(p_type text, p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare result jsonb;
begin
 if p_type='purchase' then
 select case when personal_request_id is null then jsonb_build_object('master',product_master_id,'quantity',quantity)
 else jsonb_build_object('master',null,'quantity',quantity,'personal_id',personal_request_id,'personal_index',personal_item_index,'personal_snapshot',personal_snapshot,'sku',inventory_sku_id) end
 || case when receipt_specification is null then '{}'::jsonb else jsonb_build_object('receipt_specification',receipt_specification) end
 into result from purchase_order_items where id::text=p_key;
 elsif p_type='order' then
 select jsonb_build_object('name',product_name,'specification',specification,'quantity',quantity) into result from order_items where id::text=p_key;
 elsif p_type='personal' then
 select jsonb_build_object('name',x.item->>'name','specification',x.item->>'specification','quantity',x.item->'quantity')
 into result from personal_shopping_requests p cross join lateral jsonb_array_elements(p.items) with ordinality x(item,n)
 where p.id::text=split_part(p_key,':',1) and x.n-1=split_part(p_key,':',2)::integer;
 end if; return result;
end $function$
;
CREATE OR REPLACE FUNCTION public.purchase_receipt_snapshot(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 select jsonb_build_object('supplier_id',p.supplier_id,'ordered_at',p.ordered_at,'notes',p.notes,'currency',p.currency,
 'status',p.status,'received_at',p.received_at,'items',coalesce((select jsonb_agg(
 jsonb_build_object('id',i.id,'product_master_id',i.product_master_id,'cost_scenario_id',i.cost_scenario_id,
 'quantity',i.quantity,'unit_cost',i.unit_cost,'personal_request_id',i.personal_request_id,'personal_item_index',i.personal_item_index,
 'personal_snapshot',i.personal_snapshot,'inventory_sku_id',i.inventory_sku_id,'received_quantity',i.received_quantity,'received_on',i.received_on) || case when i.receipt_specification is null then '{}'::jsonb else jsonb_build_object('receipt_specification',i.receipt_specification) end order by i.id)
 from purchase_order_items i where i.purchase_order_id=p.id),'[]'::jsonb)) from purchase_orders p where p.id=p_id
$function$
;
CREATE OR REPLACE FUNCTION public.save_purchase_receipt(p_id uuid, p_request_id uuid, p_expected jsonb, p_supplier_id uuid, p_ordered_at date, p_notes text, p_items jsonb, p_currency text, p_arrival text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
 po purchase_orders; previous purchase_order_items; op purchase_receipt_operations; item jsonb; payload jsonb; result jsonb;
 iid uuid; mid uuid; cid uuid; sid uuid; pid bigint; idx integer; snap jsonb; oldbinding inventory_bindings;
 qty numeric; price numeric; got numeric; gotdate date; receipt_spec text; seen uuid[]:='{}'; is_new boolean; creating boolean;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '僅管理員可登錄進貨收據' using errcode='42501'; end if;
 if p_id is null or p_request_id is null or p_ordered_at is null or p_supplier_id is null then raise exception '請填寫供應商與購買日期'; end if;
 if p_currency is null or p_currency not in ('JPY','TWD') or p_arrival is null or p_arrival not in ('arrived','pending','keep') then raise exception '幣別或到貨狀態無效'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception '請填寫 1 至 100 筆明細'; end if;
 payload:=jsonb_build_object('po',p_id,'expected',p_expected,'supplier',p_supplier_id,'date',p_ordered_at,'notes',coalesce(p_notes,''),'items',p_items,'currency',p_currency,'arrival',p_arrival);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,1));
 select * into op from purchase_receipt_operations where request_id=p_request_id;
 if found then
  if op.payload is distinct from payload then raise exception '同筆操作內容已變更，請重新載入確認儲存結果'; end if;
  return op.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into po from purchase_orders where id=p_id for update;creating:=not found;
 if not creating then
  perform id from purchase_order_items where purchase_order_id=p_id order by id for update;
  if p_expected is null or p_expected is distinct from purchase_receipt_snapshot(p_id) then raise exception '進貨單已更新，請重新載入後修改' using errcode='40001'; end if;
  if po.status='cancelled' then raise exception '已取消的進貨單不可登錄到貨'; end if;
 elsif p_expected is not null or p_arrival='keep' then raise exception '建立進貨單需指定到貨狀態'; end if;
 if not exists(select 1 from suppliers where id=p_supplier_id) then raise exception '找不到供應商'; end if;
 if creating then
  insert into purchase_orders(id,supplier_id,status,currency,ordered_at,notes)
  values(p_id,p_supplier_id,'ordered',p_currency,p_ordered_at,coalesce(p_notes,'')) returning * into po;
 end if;
 for item in select value from jsonb_array_elements(p_items) loop
  iid:=nullif(item->>'id','')::uuid;mid:=nullif(item->>'product_master_id','')::uuid;cid:=nullif(item->>'cost_scenario_id','')::uuid;
  pid:=nullif(item->>'personal_request_id','')::bigint;idx:=nullif(item->>'personal_item_index','')::integer;
  receipt_spec:=case when item ? 'receipt_specification' then nullif(btrim(item->>'receipt_specification'),'') else null end;
  if length(receipt_spec)>500 then raise exception '規格最多500字';end if;
  qty:=(item->>'quantity')::numeric;price:=(item->>'unit_cost')::numeric;sid:=nullif(item->>'inventory_sku_id','')::uuid;
  if iid is null or iid=any(seen) then raise exception '商品明細識別碼重複或遺漏'; end if;seen:=array_append(seen,iid);
  if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<1 or qty>2147483647 or qty<>trunc(qty)
   or price is null or price::text in ('NaN','Infinity','-Infinity') or price<0 or price>9999999999.99 or price<>round(price,2) then raise exception '數量須為正整數，單價最多兩位小數'; end if;
  select * into previous from purchase_order_items where id=iid;is_new:=not found;
  if not (item ? 'receipt_specification') then receipt_spec:=previous.receipt_specification;end if;
  if receipt_spec is not null and not exists(select 1 from product_master where id=mid and catalog_type='personal') then raise exception '只有代購歷史可直接補正收據規格';end if;
  if not is_new and previous.purchase_order_id<>p_id then raise exception '明細不屬於這張進貨單'; end if;
  if mid is not null and pid is null then
   if not exists(select 1 from product_master where id=mid and (status<>'archived' or previous.product_master_id=mid)) then raise exception '商品主檔不存在或已封存'; end if;
   if cid is not null and not exists(select 1 from cost_scenarios where id=cid and product_master_id=mid) then raise exception '成本方案與商品不符'; end if;
   snap:=null;idx:=null;
   if sid is not null and not exists(select 1 from inventory_skus where id=sid and product_master_id=mid) then raise exception '商品規格與主檔不符'; end if;
   select * into oldbinding from inventory_bindings where source_type='purchase' and source_key=iid::text;
   if oldbinding.id is not null and oldbinding.purpose<>'sale' and previous.product_master_id=mid then sid:=null;
   elsif sid is null and (select count(*) from inventory_skus where product_master_id=mid)=1 then select id into sid from inventory_skus where product_master_id=mid; end if;
  elsif mid is null and pid is not null and idx>=0 and cid is null then
   perform id from personal_shopping_requests where id=pid and status<>'cancelled' for update;
   if not found then raise exception '找不到代購單或已取消'; end if;
   snap:=inventory_source_snapshot('personal',pid::text||':'||idx::text);
   if snap is null or snap is distinct from item->'personal_snapshot' then raise exception '代購商品規格已變更，請重新選擇明細'; end if;
   select * into oldbinding from inventory_bindings where source_type='personal' and source_key=pid::text||':'||idx::text for update;
   if found and oldbinding.source_snapshot=snap then
    if oldbinding.purpose<>'sale' or oldbinding.quantity_factor<>1 then raise exception '此代購明細已有特殊用途或單位換算，請使用既有商品主檔進貨'; end if;
    sid:=oldbinding.sku_id;
   else
    select id into sid from inventory_skus where personal_request_id=pid and personal_item_index=idx and personal_snapshot=snap;
    if sid is null then
     insert into inventory_skus(personal_request_id,personal_item_index,personal_snapshot,product_name,specification,unit)
     values(pid,idx,snap,snap->>'name',coalesce(nullif(snap->>'specification',''),'標準規格'),'件') returning id into sid;
    end if;
    insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,note)
    values('personal',pid::text||':'||idx::text,snap,sid,'單次代購直接連結進貨明細，不建立正式商品編號')
    on conflict(source_type,source_key) do update set source_snapshot=excluded.source_snapshot,sku_id=excluded.sku_id,purpose='sale',quantity_factor=1,note=excluded.note;
   end if;
  else raise exception '請選擇商品主檔或代購單明細，兩者擇一'; end if;
  if p_arrival='arrived' then got:=qty;gotdate:=p_ordered_at;
  elsif p_arrival='pending' then got:=0;gotdate:=null;
  elsif is_new then
   got:=case when po.status='received' then qty else 0 end;gotdate:=case when po.status='received' then p_ordered_at else null end;
  else got:=least(previous.received_quantity,qty);gotdate:=case when got>0 then previous.received_on else null end;end if;
  insert into purchase_order_items(id,purchase_order_id,product_master_id,cost_scenario_id,quantity,unit_cost,personal_request_id,personal_item_index,personal_snapshot,inventory_sku_id,received_quantity,received_on,receipt_specification)
  values(iid,p_id,mid,cid,qty::integer,price,pid,idx,snap,sid,got,gotdate,receipt_spec)
  on conflict(id) do update set product_master_id=excluded.product_master_id,cost_scenario_id=excluded.cost_scenario_id,quantity=excluded.quantity,unit_cost=excluded.unit_cost,
   personal_request_id=excluded.personal_request_id,personal_item_index=excluded.personal_item_index,personal_snapshot=excluded.personal_snapshot,
   receipt_specification=excluded.receipt_specification,inventory_sku_id=excluded.inventory_sku_id,received_quantity=excluded.received_quantity,received_on=excluded.received_on;
  if sid is not null then
   select * into oldbinding from inventory_bindings where source_type='purchase' and source_key=iid::text;
   if oldbinding.id is not null and oldbinding.sku_id is distinct from sid then raise exception '此行已有庫存對應；更換商品時請移除此行並新增明細，保留歷史紀錄'; end if;
   insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,received_quantity,received_on,note)
   values('purchase',iid::text,inventory_source_snapshot('purchase',iid::text),sid,got,gotdate,'依購買收據登錄，預設已到貨；網購未收到可另勾選')
   on conflict(source_type,source_key) do update set source_snapshot=excluded.source_snapshot,received_quantity=excluded.received_quantity,received_on=excluded.received_on;
  else
   update inventory_bindings set source_snapshot=inventory_source_snapshot('purchase',iid::text),received_quantity=got,received_on=gotdate
   where source_type='purchase' and source_key=iid::text and purpose<>'sale' and previous.product_master_id=mid;
  end if;
 end loop;
 delete from purchase_order_items where purchase_order_id=p_id and not(id=any(seen));
 update purchase_orders p set supplier_id=p_supplier_id,currency=p_currency,ordered_at=p_ordered_at,notes=coalesce(p_notes,''),
 status=case when not exists(select 1 from purchase_order_items i where i.purchase_order_id=p.id and i.received_quantity<i.quantity) then 'received' else 'ordered' end,
 received_at=case when not exists(select 1 from purchase_order_items i where i.purchase_order_id=p.id and i.received_quantity<i.quantity) then (select max(received_on) from purchase_order_items i where i.purchase_order_id=p.id) else null end,
 updated_at=clock_timestamp() where id=p_id;
 result:=jsonb_build_object('id',p_id,'order_number',po.order_number);
 insert into purchase_receipt_operations(request_id,purchase_order_id,payload,result) values(p_request_id,p_id,payload,result);
 return result;
end $function$
;