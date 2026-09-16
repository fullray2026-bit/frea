-- Applied 2026-09-16: procurement numbering and atomic creation.
begin;
insert into public.identifier_counters(counter_key,next_value)
select 'supplier_SUP',coalesce(max(substring(supplier_code from '^SUP_([0-9]+)$')::bigint),0)+1 from public.suppliers
on conflict(counter_key) do nothing;
insert into public.identifier_counters(counter_key,next_value)
select 'purchase_PO',coalesce(max(substring(order_number from '^PO-([0-9]+)$')::bigint),0)+1 from public.purchase_orders
on conflict(counter_key) do nothing;

create function private.assign_procurement_number() returns trigger language plpgsql security definer set search_path='' as $$
declare n text;
begin
 if (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin' then raise exception '僅管理員可建立資料' using errcode='42501'; end if;
 if tg_table_name='suppliers' then
   n:=(private.next_identifier('supplier_SUP','')::bigint)::text;
   new.supplier_code:='SUP_'||lpad(n,greatest(3,length(n)),'0');
 else
   new.order_number:=private.next_identifier('purchase_PO','PO-');
 end if;
 return new;
end $$;
revoke all on function private.assign_procurement_number() from public,anon,authenticated;
create trigger suppliers_auto_number before insert on public.suppliers for each row execute function private.assign_procurement_number();
create trigger purchase_orders_auto_number before insert on public.purchase_orders for each row execute function private.assign_procurement_number();
alter table public.purchase_orders add column creation_payload jsonb;
alter table public.purchase_order_items add column cost_scenario_id uuid references public.cost_scenarios(id) on delete set null;
create index purchase_order_items_cost_scenario_idx on public.purchase_order_items(cost_scenario_id);

create function public.create_supplier(p_id uuid,p_name text,p_website text,p_notes text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.suppliers;
begin
 if (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin' then raise exception '僅管理員可新增供應商' using errcode='42501'; end if;
 if p_id is null or nullif(btrim(p_name),'') is null then raise exception '請填寫供應商名稱'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.suppliers where id=p_id;
 if found then
   if r.name<>btrim(p_name) or r.website<>coalesce(p_website,'') or r.notes<>coalesce(p_notes,'') then raise exception '此操作已完成，請重新整理確認資料'; end if;
   return jsonb_build_object('id',r.id,'supplier_code',r.supplier_code);
 end if;
 insert into public.suppliers(id,name,website,notes) values(p_id,btrim(p_name),coalesce(p_website,''),coalesce(p_notes,'')) returning * into r;
 return jsonb_build_object('id',r.id,'supplier_code',r.supplier_code);
end $$;
revoke all on function public.create_supplier(uuid,text,text,text) from public,anon;
grant execute on function public.create_supplier(uuid,text,text,text) to authenticated;

create function public.create_purchase_order(p_id uuid,p_supplier_id uuid,p_ordered_at date,p_notes text,p_items jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.purchase_orders; item jsonb; mid uuid; cid uuid; qty numeric; cost numeric; payload jsonb;
begin
 if (auth.jwt()->'app_metadata'->>'role') is distinct from 'admin' then raise exception '僅管理員可建立進貨單' using errcode='42501'; end if;
 if p_id is null or p_supplier_id is null or p_ordered_at is null then raise exception '請選擇供應商及進貨日'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception '請新增商品明細'; end if;
 if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100 then raise exception '商品明細需為 1 至 100 筆'; end if;
 payload:=jsonb_build_object('supplier',p_supplier_id,'date',p_ordered_at,'notes',coalesce(p_notes,''),'items',p_items);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into r from public.purchase_orders where id=p_id;
 if found then
  if r.creation_payload is distinct from payload then raise exception '此進貨單已建立，請重新整理查看結果後再建立新單'; end if;
  return jsonb_build_object('id',r.id,'order_number',r.order_number);
 end if;
 if not exists(select 1 from public.suppliers where id=p_supplier_id) then raise exception '供應商不存在'; end if;
 insert into public.purchase_orders(id,supplier_id,ordered_at,notes,currency,creation_payload)
 values(p_id,p_supplier_id,p_ordered_at,coalesce(p_notes,''),'JPY',payload) returning * into r;
 for item in select value from jsonb_array_elements(p_items) loop
  mid:=(item->>'product_master_id')::uuid; cid:=nullif(item->>'cost_scenario_id','')::uuid;
  qty:=(item->>'quantity')::numeric; cost:=(item->>'unit_cost')::numeric;
  if mid is null or qty is null or qty<1 or qty>2147483647 or qty<>trunc(qty) or cost is null or cost<0 or cost::text in ('NaN','Infinity','-Infinity') then raise exception '商品、數量或單價不正確'; end if;
  if not exists(select 1 from public.product_master where id=mid and status<>'archived') then raise exception '商品不存在或已封存'; end if;
  if cid is not null and not exists(select 1 from public.cost_scenarios where id=cid and product_master_id=mid) then raise exception '成本方案與商品不相符'; end if;
  insert into public.purchase_order_items(purchase_order_id,product_master_id,quantity,unit_cost,cost_scenario_id)
  values(r.id,mid,qty::integer,cost,cid);
 end loop;
 return jsonb_build_object('id',r.id,'order_number',r.order_number);
end $$;
revoke all on function public.create_purchase_order(uuid,uuid,date,text,jsonb) from public,anon;
grant execute on function public.create_purchase_order(uuid,uuid,date,text,jsonb) to authenticated;
commit;