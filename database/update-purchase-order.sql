-- Purchase-order editing only. No existing table/column/export format changes.
create or replace function public.update_purchase_order(p_id uuid, p_expected jsonb, p_supplier_id uuid, p_ordered_at date, p_notes text, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 o public.purchase_orders%rowtype; current_snapshot jsonb; item jsonb;
 iid uuid; mid uuid; cid uuid; qty numeric; price numeric; seen uuid[] := '{}';
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then
   raise exception '僅管理員可修改進貨單' using errcode='42501';
 end if;
 select * into o from public.purchase_orders where id=p_id for update;
 if not found then raise exception '找不到進貨單'; end if;
 perform id from public.purchase_order_items where purchase_order_id=p_id order by id for update;
 select jsonb_build_object('supplier_id',o.supplier_id,'ordered_at',o.ordered_at,'notes',o.notes,
   'currency',o.currency,'status',o.status,'received_at',o.received_at,
   'items',coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_master_id',i.product_master_id,
     'cost_scenario_id',i.cost_scenario_id,'quantity',i.quantity,'unit_cost',i.unit_cost) order by i.id)
     filter (where i.id is not null),'[]'::jsonb))
 into current_snapshot from public.purchase_order_items i where i.purchase_order_id=p_id;
 if p_expected is distinct from current_snapshot then
   raise exception '這張進貨單已被更新，請重新載入後再修改。' using errcode='40001';
 end if;
 if p_supplier_id is null or p_ordered_at is null or not exists(select 1 from public.suppliers where id=p_supplier_id) then
   raise exception '請選擇供應商並填寫進貨日';
 end if;
 if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception '商品明細格式錯誤'; end if;
 if jsonb_array_length(p_items) not between 1 and 100 then raise exception '商品明細需有 1 至 100 筆'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
   iid := (item->>'id')::uuid; mid := (item->>'product_master_id')::uuid;
   cid := nullif(item->>'cost_scenario_id','')::uuid;
   qty := (item->>'quantity')::numeric; price := (item->>'unit_cost')::numeric;
   if iid is null or iid=any(seen) then raise exception '商品明細識別碼重複或遺漏'; end if;
   seen := array_append(seen,iid);
   if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<1 or qty>2147483647 or qty<>trunc(qty)
     or price is null or price::text in ('NaN','Infinity','-Infinity') or price<0 or price>9999999999.99 or price<>round(price,2) then
     raise exception '數量須為正整數，單價須為非負數且最多兩位小數';
   end if;
   if exists(select 1 from public.purchase_order_items where id=iid and purchase_order_id<>p_id) then
     raise exception '商品明細不屬於這張進貨單';
   end if;
   if not exists(select 1 from public.product_master m where m.id=mid and
      (m.status<>'archived' or exists(select 1 from public.purchase_order_items i where i.id=iid and i.purchase_order_id=p_id and i.product_master_id=mid))) then
     raise exception '商品不存在或已封存';
   end if;
   if cid is not null and not exists(select 1 from public.cost_scenarios where id=cid and product_master_id=mid) then
     raise exception '成本方案與商品不符';
   end if;
   insert into public.purchase_order_items(id,purchase_order_id,product_master_id,cost_scenario_id,quantity,unit_cost)
   values(iid,p_id,mid,cid,qty::integer,price)
   on conflict(id) do update set product_master_id=excluded.product_master_id,cost_scenario_id=excluded.cost_scenario_id,
     quantity=excluded.quantity,unit_cost=excluded.unit_cost;
 end loop;
 delete from public.purchase_order_items where purchase_order_id=p_id and not(id=any(seen));
 update public.purchase_orders set supplier_id=p_supplier_id,ordered_at=p_ordered_at,
   notes=coalesce(p_notes,''),updated_at=clock_timestamp() where id=p_id;
 return jsonb_build_object('id',p_id,'order_number',o.order_number);
end $$;
revoke all on function public.update_purchase_order(uuid,jsonb,uuid,date,text,jsonb) from public,anon;
grant execute on function public.update_purchase_order(uuid,jsonb,uuid,date,text,jsonb) to authenticated;
