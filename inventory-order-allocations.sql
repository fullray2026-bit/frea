
alter table public.purchase_order_items add column allocation_purpose text not null default 'review' check(allocation_purpose in ('review','stock'));
create table public.purchase_order_allocations(
 id uuid primary key default gen_random_uuid(),
 purchase_item_id uuid not null references public.purchase_order_items(id) on delete cascade,
 order_item_id bigint references public.order_items(id) on delete cascade,
 personal_request_id bigint references public.personal_shopping_requests(id) on delete cascade,
 personal_item_index integer,
 quantity numeric not null check(quantity>0 and quantity::text not in ('NaN','Infinity','-Infinity')),
 order_quantity numeric not null check(order_quantity>0 and order_quantity::text not in ('NaN','Infinity','-Infinity')),
 purchase_snapshot jsonb not null,
 order_snapshot jsonb not null,
 sku_id uuid references public.inventory_skus(id),
 note text not null default '',
 updated_at timestamptz not null default now(),
 check((order_item_id is not null and personal_request_id is null and personal_item_index is null) or
 (order_item_id is null and personal_request_id is not null and personal_item_index>=0))
);
create index purchase_allocations_item_idx on public.purchase_order_allocations(purchase_item_id);
create index purchase_allocations_order_idx on public.purchase_order_allocations(order_item_id) where order_item_id is not null;
create index purchase_allocations_personal_idx on public.purchase_order_allocations(personal_request_id) where personal_request_id is not null;
create index purchase_allocations_sku_idx on public.purchase_order_allocations(sku_id) where sku_id is not null;
alter table public.purchase_order_allocations enable row level security;
create policy purchase_allocations_admin on public.purchase_order_allocations for all to authenticated
 using((select auth.jwt()->'app_metadata'->>'role')='admin') with check((select auth.jwt()->'app_metadata'->>'role')='admin');
revoke all on public.purchase_order_allocations from anon,authenticated;
grant select,insert,update,delete on public.purchase_order_allocations to authenticated;

create function public.validate_purchase_allocation()
returns trigger language plpgsql security invoker set search_path=public as $$
declare i purchase_order_items;snap jsonb;dest_qty numeric;used numeric;pb inventory_bindings;db inventory_bindings;kind text;key text;cancelled boolean;
begin
 select * into i from purchase_order_items where id=new.purchase_item_id for update;
 if not found then raise exception '找不到進貨明細'; end if;
 if exists(select 1 from purchase_orders where id=i.purchase_order_id and status='cancelled') then raise exception '已取消進貨不可對應'; end if;
 if new.order_item_id is not null then
  kind:='order';key:=new.order_item_id::text;
  select oi.quantity,o.status='cancelled' into dest_qty,cancelled from order_items oi join orders o on o.id=oi.order_id where oi.id=new.order_item_id for update of oi;
 else
  kind:='personal';key:=new.personal_request_id::text||':'||new.personal_item_index::text;
  select status='cancelled' into cancelled from personal_shopping_requests where id=new.personal_request_id for update;
  select (items->new.personal_item_index->>'quantity')::numeric into dest_qty from personal_shopping_requests where id=new.personal_request_id;
 end if;
 if dest_qty is null or cancelled then raise exception '訂單明細不存在或已取消'; end if;
 snap:=inventory_source_snapshot(kind,key);
 if new.purchase_snapshot is distinct from inventory_source_snapshot('purchase',i.id::text) or new.order_snapshot is distinct from snap then raise exception '商品名稱、規格或數量已更新，請重新載入核對'; end if;
 select * into pb from inventory_bindings where source_type='purchase' and source_key=i.id::text and source_snapshot=inventory_source_snapshot('purchase',i.id::text);
 select * into db from inventory_bindings where source_type=kind and source_key=key and source_snapshot=snap;
 if pb.id is not null and pb.purpose<>'sale' then raise exception '試喝與費用不需對應客戶商品'; end if;
 if db.id is not null and db.purpose<>'sale' then raise exception '此訂單明細為費用，不是商品'; end if;
 if pb.sku_id is not null and db.sku_id is not null then
  if pb.sku_id<>db.sku_id then raise exception '進貨與訂單商品規格不符'; end if;
  if abs(new.quantity*pb.quantity_factor-new.order_quantity*db.quantity_factor)>0.00001 then raise exception '進貨單位與訂單單位換算不符'; end if;
  new.sku_id:=pb.sku_id;
 else new.sku_id:=null;end if;
 if i.personal_request_id is not null and (new.personal_request_id is distinct from i.personal_request_id or new.personal_item_index is distinct from i.personal_item_index) then raise exception '單次代購進貨只能對應原訂單明細'; end if;
 select coalesce(sum(quantity),0) into used from purchase_order_allocations where purchase_item_id=i.id and id<>new.id;
 if used+new.quantity>i.quantity+0.00001 then raise exception '對應數量超過進貨數量'; end if;
 select coalesce(sum(order_quantity),0) into used from purchase_order_allocations where id<>new.id and
 ((new.order_item_id is not null and order_item_id=new.order_item_id) or (new.order_item_id is null and personal_request_id=new.personal_request_id and personal_item_index=new.personal_item_index));
 if used+new.order_quantity>dest_qty+0.00001 then raise exception '此訂單明細已由其他進貨單對應，數量超過需求'; end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger validate_purchase_allocation before insert or update on public.purchase_order_allocations for each row execute function public.validate_purchase_allocation();
create trigger audit_purchase_allocation after insert or update or delete on public.purchase_order_allocations for each row execute function public.inventory_audit();

create function public.save_purchase_allocation(p_value jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare a purchase_order_allocations; iid uuid:=(p_value->>'id')::uuid;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '僅管理員可對應訂單' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(iid::text,2));
 select * into a from purchase_order_allocations where id=iid for update;
 if found then
  if a.purchase_item_id is distinct from (p_value->>'purchase_item_id')::uuid then raise exception '進貨來源不符';end if;
  if a.updated_at is distinct from p_expected_updated_at then
   if a.quantity=(p_value->>'quantity')::numeric and a.order_quantity=(p_value->>'order_quantity')::numeric and a.order_item_id is not distinct from nullif(p_value->>'order_item_id','')::bigint and
    a.personal_request_id is not distinct from nullif(p_value->>'personal_request_id','')::bigint and a.personal_item_index is not distinct from nullif(p_value->>'personal_item_index','')::integer
    and a.purchase_snapshot=p_value->'purchase_snapshot' and a.order_snapshot=p_value->'order_snapshot' then return to_jsonb(a);end if;
   raise exception '對應紀錄已更新，請重新載入';
  end if;
 elsif p_expected_updated_at is not null then raise exception '對應紀錄已移除，請重新載入';end if;
 insert into purchase_order_allocations(id,purchase_item_id,order_item_id,personal_request_id,personal_item_index,quantity,order_quantity,purchase_snapshot,order_snapshot,note)
 values(iid,(p_value->>'purchase_item_id')::uuid,nullif(p_value->>'order_item_id','')::bigint,nullif(p_value->>'personal_request_id','')::bigint,nullif(p_value->>'personal_item_index','')::integer,
 (p_value->>'quantity')::numeric,(p_value->>'order_quantity')::numeric,p_value->'purchase_snapshot',p_value->'order_snapshot',coalesce(p_value->>'note',''))
 on conflict(id) do update set order_item_id=excluded.order_item_id,personal_request_id=excluded.personal_request_id,personal_item_index=excluded.personal_item_index,quantity=excluded.quantity,order_quantity=excluded.order_quantity,purchase_snapshot=excluded.purchase_snapshot,order_snapshot=excluded.order_snapshot,note=excluded.note returning * into a;
 return to_jsonb(a);
end $$;
create function public.remove_purchase_allocation(p_id uuid,p_expected_updated_at timestamptz)
returns void language plpgsql security invoker set search_path=public as $$
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '僅管理員可移除對應' using errcode='42501';end if;
 delete from purchase_order_allocations where id=p_id and updated_at=p_expected_updated_at;
 if not found then raise exception '紀錄已更新或移除，請重新載入';end if;
end $$;
create function public.set_purchase_allocation_purpose(p_item_id uuid,p_value text,p_expected_snapshot jsonb)
returns void language plpgsql security invoker set search_path=public as $$
declare i purchase_order_items;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '僅管理員可設定用途' using errcode='42501';end if;
 select * into i from purchase_order_items where id=p_item_id for update;
 if not found or inventory_source_snapshot('purchase',i.id::text) is distinct from p_expected_snapshot then raise exception '進貨明細已更新，請重新載入';end if;
 if p_value is null or p_value not in ('review','stock') then raise exception '用途無效';end if;
 if p_value='stock' and (i.personal_request_id is not null or exists(select 1 from product_master where id=i.product_master_id and catalog_type='personal')) then raise exception '單次代購不列入補庫存';end if;
 update purchase_order_items set allocation_purpose=p_value where id=p_item_id;
end $$;
revoke all on function public.validate_purchase_allocation(),public.save_purchase_allocation(jsonb,timestamptz),public.remove_purchase_allocation(uuid,timestamptz),public.set_purchase_allocation_purpose(uuid,text,jsonb) from public;
grant execute on function public.validate_purchase_allocation(),public.save_purchase_allocation(jsonb,timestamptz),public.remove_purchase_allocation(uuid,timestamptz),public.set_purchase_allocation_purpose(uuid,text,jsonb) to authenticated;

create function public.guard_allocated_purchase_quantity()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 if new.quantity<coalesce((select sum(quantity) from purchase_order_allocations where purchase_item_id=new.id),0)-0.00001 then raise exception '此明細已有訂單分配，請先調整對應數量再減少進貨量';end if;
 return new;
end $$;
create trigger guard_allocated_purchase_quantity before update of quantity on public.purchase_order_items for each row execute function public.guard_allocated_purchase_quantity();
create function public.allocate_direct_personal_purchase()
returns trigger language plpgsql security invoker set search_path=public as $$
declare remaining numeric;snap jsonb;
begin
 if new.personal_request_id is null or exists(select 1 from purchase_order_allocations where purchase_item_id=new.id) then return new;end if;
 snap:=inventory_source_snapshot('personal',new.personal_request_id::text||':'||new.personal_item_index::text);
 if snap is distinct from new.personal_snapshot then return new;end if;
 select (snap->>'quantity')::numeric-coalesce(sum(order_quantity),0) into remaining from purchase_order_allocations where personal_request_id=new.personal_request_id and personal_item_index=new.personal_item_index;
 if remaining>0 then
  insert into purchase_order_allocations(purchase_item_id,personal_request_id,personal_item_index,quantity,order_quantity,purchase_snapshot,order_snapshot,note)
  values(new.id,new.personal_request_id,new.personal_item_index,least(new.quantity,remaining),least(new.quantity,remaining),inventory_source_snapshot('purchase',new.id::text),snap,'直接沿用代購單明細');
 end if;return new;
end $$;
create trigger allocate_direct_personal_purchase after insert or update of personal_request_id,personal_item_index on public.purchase_order_items for each row execute function public.allocate_direct_personal_purchase();
revoke all on function public.guard_allocated_purchase_quantity(),public.allocate_direct_personal_purchase() from public;
grant execute on function public.guard_allocated_purchase_quantity(),public.allocate_direct_personal_purchase() to authenticated;
CREATE OR REPLACE FUNCTION public.validate_purchase_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare i purchase_order_items;snap jsonb;dest_qty numeric;used numeric;pb inventory_bindings;db inventory_bindings;kind text;key text;cancelled boolean;
begin
 select * into i from purchase_order_items where id=new.purchase_item_id for update;
 if not found then raise exception '找不到進貨明細'; end if;
 if exists(select 1 from purchase_orders where id=i.purchase_order_id and status='cancelled') then raise exception '已取消進貨不可對應'; end if;
 if new.order_item_id is not null then
  kind:='order';key:=new.order_item_id::text;
  select oi.quantity,o.status='cancelled' into dest_qty,cancelled from order_items oi join orders o on o.id=oi.order_id where oi.id=new.order_item_id for update of oi;
 else
  kind:='personal';key:=new.personal_request_id::text||':'||new.personal_item_index::text;
  select status='cancelled' into cancelled from personal_shopping_requests where id=new.personal_request_id for update;
  select (items->new.personal_item_index->>'quantity')::numeric into dest_qty from personal_shopping_requests where id=new.personal_request_id;
 end if;
 if dest_qty is null or cancelled then raise exception '訂單明細不存在或已取消'; end if;
 snap:=inventory_source_snapshot(kind,key);
 if new.purchase_snapshot is distinct from inventory_source_snapshot('purchase',i.id::text) or new.order_snapshot is distinct from snap then raise exception '商品名稱、規格或數量已更新，請重新載入核對'; end if;
 select * into pb from inventory_bindings where source_type='purchase' and source_key=i.id::text and source_snapshot=inventory_source_snapshot('purchase',i.id::text);
 select * into db from inventory_bindings where source_type=kind and source_key=key and source_snapshot=snap;
 if pb.id is not null and pb.purpose<>'sale' then raise exception '試喝與費用不需對應客戶商品'; end if;
 if db.id is not null and db.purpose<>'sale' then raise exception '此訂單明細為費用，不是商品'; end if;
 if pb.sku_id is null and i.personal_request_id is not null then pb.sku_id:=i.inventory_sku_id;pb.quantity_factor:=1;end if;
 if pb.sku_id is not null and db.sku_id is not null then
  if pb.sku_id<>db.sku_id then raise exception '進貨與訂單商品規格不符'; end if;
  if abs(new.quantity*pb.quantity_factor-new.order_quantity*db.quantity_factor)>0.00001 then raise exception '進貨單位與訂單單位換算不符'; end if;
  new.sku_id:=pb.sku_id;
 else new.sku_id:=null;end if;
 if i.personal_request_id is not null and (new.personal_request_id is distinct from i.personal_request_id or new.personal_item_index is distinct from i.personal_item_index) then raise exception '單次代購進貨只能對應原訂單明細'; end if;
 select coalesce(sum(quantity),0) into used from purchase_order_allocations where purchase_item_id=i.id and id<>new.id;
 if used+new.quantity>i.quantity+0.00001 then raise exception '對應數量超過進貨數量'; end if;
 select coalesce(sum(order_quantity),0) into used from purchase_order_allocations where id<>new.id and
 ((new.order_item_id is not null and order_item_id=new.order_item_id) or (new.order_item_id is null and personal_request_id=new.personal_request_id and personal_item_index=new.personal_item_index));
 if used+new.order_quantity>dest_qty+0.00001 then raise exception '此訂單明細已由其他進貨單對應，數量超過需求'; end if;
 new.updated_at:=clock_timestamp();return new;
end $function$
