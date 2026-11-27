
alter table public.inventory_skus alter column product_master_id drop not null;
alter table public.inventory_skus
 add column personal_request_id bigint references public.personal_shopping_requests(id),
 add column personal_item_index integer,
 add column personal_snapshot jsonb,
 add column product_name text,
 add constraint inventory_sku_origin check (
 (product_master_id is not null and personal_request_id is null and personal_item_index is null and personal_snapshot is null)
 or (product_master_id is null and personal_request_id is not null and personal_item_index>=0 and personal_snapshot is not null and length(trim(product_name))>0));
create unique index inventory_personal_sku_key on public.inventory_skus(personal_request_id,personal_item_index,personal_snapshot) where personal_request_id is not null;
alter table public.purchase_order_items alter column product_master_id drop not null;
alter table public.purchase_order_items
 add column personal_request_id bigint references public.personal_shopping_requests(id),
 add column personal_item_index integer,
 add column personal_snapshot jsonb,
 add column inventory_sku_id uuid references public.inventory_skus(id),
 add column received_quantity numeric not null default 0,
 add column received_on date,
 add constraint purchase_item_origin check (
 (product_master_id is not null and personal_request_id is null and personal_item_index is null and personal_snapshot is null)
 or (product_master_id is null and personal_request_id is not null and personal_item_index>=0 and personal_snapshot is not null and inventory_sku_id is not null and cost_scenario_id is null)),
 add constraint purchase_received_bounds check (received_quantity>=0 and received_quantity<=quantity and (received_quantity=0 or received_on is not null));
create index purchase_items_personal_idx on public.purchase_order_items(personal_request_id) where personal_request_id is not null;
create index purchase_items_inventory_sku_idx on public.purchase_order_items(inventory_sku_id) where inventory_sku_id is not null;
create table public.purchase_receipt_operations(
 request_id uuid primary key,
 purchase_order_id uuid not null references public.purchase_orders(id),
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.purchase_receipt_operations enable row level security;
create policy receipt_operations_admin on public.purchase_receipt_operations for all to authenticated
 using((select auth.jwt()->'app_metadata'->>'role')='admin') with check((select auth.jwt()->'app_metadata'->>'role')='admin');
revoke all on public.purchase_receipt_operations from anon,authenticated;
grant select,insert on public.purchase_receipt_operations to authenticated;
create index receipt_operations_po_idx on public.purchase_receipt_operations(purchase_order_id);

create or replace function public.inventory_source_snapshot(p_type text,p_key text)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_type='purchase' then
 select case when personal_request_id is null then jsonb_build_object('master',product_master_id,'quantity',quantity)
 else jsonb_build_object('master',null,'quantity',quantity,'personal_id',personal_request_id,'personal_index',personal_item_index,'personal_snapshot',personal_snapshot,'sku',inventory_sku_id) end
 into result from purchase_order_items where id::text=p_key;
 elsif p_type='order' then
 select jsonb_build_object('name',product_name,'specification',specification,'quantity',quantity) into result from order_items where id::text=p_key;
 elsif p_type='personal' then
 select jsonb_build_object('name',x.item->>'name','specification',x.item->>'specification','quantity',x.item->'quantity')
 into result from personal_shopping_requests p cross join lateral jsonb_array_elements(p.items) with ordinality x(item,n)
 where p.id::text=split_part(p_key,':',1) and x.n-1=split_part(p_key,':',2)::integer;
 end if; return result;
end $$;

create or replace function public.inventory_validate_binding()
returns trigger language plpgsql security invoker set search_path=public as $$
declare snap jsonb; sku inventory_skus; line purchase_order_items;
begin
 snap:=inventory_source_snapshot(new.source_type,new.source_key);
 if snap is null or snap is distinct from new.source_snapshot then raise exception '來源商品已變更，請重新載入後對應'; end if;
 if new.sku_id is not null then select * into sku from inventory_skus where id=new.sku_id; end if;
 if new.source_type='purchase' then
  select * into line from purchase_order_items where id::text=new.source_key for update;
  if new.received_quantity>line.quantity then raise exception '到貨數量不得超過進貨數量'; end if;
  if new.sku_id is not null then
   if line.personal_request_id is null and sku.product_master_id is distinct from line.product_master_id then
    raise exception '進貨規格必須屬於相同商品主檔';
   elsif line.personal_request_id is not null and new.sku_id is distinct from line.inventory_sku_id then
    raise exception '代購進貨規格須符合原代購明細';
   end if;
  end if;
 elsif new.received_quantity<>0 then raise exception '僅進貨明細可登記到貨';
 elsif sku.personal_request_id is not null and
 (new.source_type<>'personal' or new.source_key<>sku.personal_request_id::text||':'||sku.personal_item_index::text or new.source_snapshot is distinct from sku.personal_snapshot) then
  raise exception '單次代購規格僅可對應原代購明細';
 end if;
 new.updated_at:=clock_timestamp();return new;
end $$;

create function public.inventory_receipt_sync()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.source_type='purchase' then
  update purchase_order_items set received_quantity=new.received_quantity,received_on=new.received_on
  where id::text=new.source_key and (received_quantity,received_on) is distinct from (new.received_quantity,new.received_on);
  update purchase_orders p set
   status=case when not exists(select 1 from purchase_order_items i where i.purchase_order_id=p.id and i.received_quantity<i.quantity) then 'received' else 'ordered' end,
   received_at=case when not exists(select 1 from purchase_order_items i where i.purchase_order_id=p.id and i.received_quantity<i.quantity) then (select max(received_on) from purchase_order_items i where i.purchase_order_id=p.id) else null end,
   updated_at=clock_timestamp()
  where p.id=(select purchase_order_id from purchase_order_items where id::text=new.source_key) and p.status<>'cancelled';
 end if;return new;
end $$;
create trigger inventory_binding_receipt_sync after insert or update on public.inventory_bindings for each row execute function public.inventory_receipt_sync();
create trigger purchase_item_inventory_audit after insert or update or delete on public.purchase_order_items for each row execute function public.inventory_audit();
-- Existing audit function returns NEW; delete auditing must use OLD too.
create or replace function public.inventory_audit()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into inventory_history(entity,record_id,before_value,after_value)
 values(TG_TABLE_NAME,coalesce(new.id,old.id)::text,
 case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
 case when TG_OP='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end $$;

create function public.purchase_receipt_snapshot(p_id uuid)
returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('supplier_id',p.supplier_id,'ordered_at',p.ordered_at,'notes',p.notes,'currency',p.currency,
 'status',p.status,'received_at',p.received_at,'items',coalesce((select jsonb_agg(
 jsonb_build_object('id',i.id,'product_master_id',i.product_master_id,'cost_scenario_id',i.cost_scenario_id,
 'quantity',i.quantity,'unit_cost',i.unit_cost,'personal_request_id',i.personal_request_id,'personal_item_index',i.personal_item_index,
 'personal_snapshot',i.personal_snapshot,'inventory_sku_id',i.inventory_sku_id,'received_quantity',i.received_quantity,'received_on',i.received_on) order by i.id)
 from purchase_order_items i where i.purchase_order_id=p.id),'[]'::jsonb)) from purchase_orders p where p.id=p_id
$$;

create function public.save_purchase_receipt(
 p_id uuid,p_request_id uuid,p_expected jsonb,p_supplier_id uuid,p_ordered_at date,p_notes text,p_items jsonb,p_currency text,p_arrival text
) returns jsonb language plpgsql security invoker set search_path=public as $$
declare
 po purchase_orders; previous purchase_order_items; op purchase_receipt_operations; item jsonb; payload jsonb; result jsonb;
 iid uuid; mid uuid; cid uuid; sid uuid; pid bigint; idx integer; snap jsonb; oldbinding inventory_bindings;
 qty numeric; price numeric; got numeric; gotdate date; seen uuid[]:='{}'; is_new boolean; creating boolean;
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
  qty:=(item->>'quantity')::numeric;price:=(item->>'unit_cost')::numeric;sid:=nullif(item->>'inventory_sku_id','')::uuid;
  if iid is null or iid=any(seen) then raise exception '商品明細識別碼重複或遺漏'; end if;seen:=array_append(seen,iid);
  if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<1 or qty>2147483647 or qty<>trunc(qty)
   or price is null or price::text in ('NaN','Infinity','-Infinity') or price<0 or price>9999999999.99 or price<>round(price,2) then raise exception '數量須為正整數，單價最多兩位小數'; end if;
  select * into previous from purchase_order_items where id=iid;is_new:=not found;
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
  insert into purchase_order_items(id,purchase_order_id,product_master_id,cost_scenario_id,quantity,unit_cost,personal_request_id,personal_item_index,personal_snapshot,inventory_sku_id,received_quantity,received_on)
  values(iid,p_id,mid,cid,qty::integer,price,pid,idx,snap,sid,got,gotdate)
  on conflict(id) do update set product_master_id=excluded.product_master_id,cost_scenario_id=excluded.cost_scenario_id,quantity=excluded.quantity,unit_cost=excluded.unit_cost,
   personal_request_id=excluded.personal_request_id,personal_item_index=excluded.personal_item_index,personal_snapshot=excluded.personal_snapshot,
   inventory_sku_id=excluded.inventory_sku_id,received_quantity=excluded.received_quantity,received_on=excluded.received_on;
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
end $$;
revoke all on function public.inventory_receipt_sync(),public.purchase_receipt_snapshot(uuid),public.save_purchase_receipt(uuid,uuid,jsonb,uuid,date,text,jsonb,text,text) from public;
grant execute on function public.inventory_receipt_sync(),public.purchase_receipt_snapshot(uuid),public.save_purchase_receipt(uuid,uuid,jsonb,uuid,date,text,jsonb,text,text) to authenticated;

create function public.save_inventory_receipt_binding(p_value jsonb,p_binding_id uuid,p_expected_updated_at timestamptz,p_expected_receipt jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare b inventory_bindings;i purchase_order_items;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '僅管理員可登記庫存' using errcode='42501'; end if;
 if p_value->>'source_type'='purchase' then
  select * into i from purchase_order_items where id::text=p_value->>'source_key' for update;
  if not found or p_expected_receipt is distinct from jsonb_build_object('quantity',i.received_quantity,'received_on',i.received_on) then raise exception '進貨到貨資料已更新，請重新載入'; end if;
 end if;
 if p_binding_id is not null then
  select * into b from inventory_bindings where id=p_binding_id for update;
  if not found or b.updated_at is distinct from p_expected_updated_at then raise exception '對應已更新，請重新載入'; end if;
  if b.source_type is distinct from p_value->>'source_type' or b.source_key is distinct from p_value->>'source_key' then raise exception '來源不符'; end if;
  update inventory_bindings set source_snapshot=p_value->'source_snapshot',sku_id=nullif(p_value->>'sku_id','')::uuid,purpose=p_value->>'purpose',
  quantity_factor=(p_value->>'quantity_factor')::numeric,received_quantity=(p_value->>'received_quantity')::numeric,received_on=nullif(p_value->>'received_on','')::date,note=coalesce(p_value->>'note','') where id=p_binding_id returning * into b;
 else
  insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,purpose,quantity_factor,received_quantity,received_on,note)
  values(p_value->>'source_type',p_value->>'source_key',p_value->'source_snapshot',nullif(p_value->>'sku_id','')::uuid,p_value->>'purpose',
   (p_value->>'quantity_factor')::numeric,(p_value->>'received_quantity')::numeric,nullif(p_value->>'received_on','')::date,coalesce(p_value->>'note','')) returning * into b;
 end if;return to_jsonb(b);
end $$;
revoke all on function public.save_inventory_receipt_binding(jsonb,uuid,timestamptz,jsonb) from public;
grant execute on function public.save_inventory_receipt_binding(jsonb,uuid,timestamptz,jsonb) to authenticated;
