alter table public.order_items add column item_type text not null default 'product' check(item_type in ('product','expense'));
update public.order_items i set item_type='expense' where exists(select 1 from public.inventory_bindings b where b.source_type='order' and b.source_key=i.id::text and b.purpose='expense');
CREATE OR REPLACE FUNCTION public.admin_save_order(p_id bigint, p_expected_updated_at timestamp with time zone, p_changes jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_order public.orders%rowtype; v_count integer; v_result jsonb; x jsonb; v_item public.order_items%rowtype; v_type text; v_name text; v_spec text; v_qty integer; v_price integer; v_id bigint;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then raise exception '僅限管理員修改訂單' using errcode='42501'; end if;
 select * into v_order from public.orders where id=p_id for update;
 if not found then raise exception '找不到訂單'; end if;
 if v_order.updated_at is distinct from p_expected_updated_at then raise exception '訂單已被更新，請重新整理後再修改'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception '商品資料格式錯誤'; end if;
 select count(*) into v_count from public.order_items where order_id=p_id;

 if jsonb_array_length(p_items)>100 or (select count(*) from jsonb_array_elements(p_items) as existing_line(value) where nullif(existing_line.value->>'id','') is not null)<>v_count
 or (select count(distinct existing_line.value->>'id') from jsonb_array_elements(p_items) as existing_line(value) where nullif(existing_line.value->>'id','') is not null)<>v_count then raise exception '商品明細已變更，請重新整理';end if;
 for x in select value from jsonb_array_elements(p_items) loop
  v_id:=nullif(x->>'id','')::bigint;
  select * into v_item from public.order_items where id=v_id and order_id=p_id;
  if v_id is not null and not found then raise exception '明細不屬於此訂單';end if;
  v_type:=coalesce(x->>'item_type',v_item.item_type,'product');
  if v_type not in ('product','expense') then raise exception '請選擇商品或費用';end if;
  if coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then raise exception '數量須為1至99999的整數';end if;
  v_qty:=(x->>'quantity')::integer;
  if v_id is null or v_type='expense' then
   v_name:=btrim(coalesce(x->>'product_name',v_item.product_name,''));v_spec:=coalesce(x->>'specification',v_item.specification,'');
   if length(v_name) not between 1 and 500 or length(v_spec)>500 then raise exception '請填寫名稱，名稱與規格最多500字';end if;
   if coalesce(x->>'unit_price',v_item.unit_price::text,'') !~ '^[0-9]{1,9}$' then raise exception '單價須為非負整數';end if;
   v_price:=coalesce(x->>'unit_price',v_item.unit_price::text)::integer;
  else v_name:=v_item.product_name;v_spec:=v_item.specification;v_price:=v_item.unit_price;end if;
  if v_qty::bigint*v_price>2147483647 then raise exception '明細金額過大';end if;
  if v_type='expense' and exists(select 1 from public.purchase_order_allocations where order_item_id=v_id) then raise exception '此商品已有進貨對應，請先移除對應再改為費用';end if;
  if v_id is null then
   insert into public.order_items(order_id,product_name,specification,quantity,unit_price,item_type) values(p_id,v_name,v_spec,v_qty,v_price,v_type) returning id into v_id;
  else
   update public.order_items set product_name=v_name,specification=v_spec,quantity=v_qty,unit_price=v_price,item_type=v_type where id=v_id and order_id=p_id;
  end if;
  if v_type='expense' then
   update public.inventory_bindings set purpose='expense',source_snapshot=public.inventory_source_snapshot('order',v_id::text) where source_type='order' and source_key=v_id::text;
  elsif v_item.item_type='expense' then
   update public.inventory_bindings set purpose='sale',source_snapshot='{}'::jsonb where source_type='order' and source_key=v_id::text;
  end if;
 end loop;
 if (select coalesce(sum(line_total::bigint),0) from public.order_items where order_id=p_id)>2147483647 then raise exception '訂單總額過大';end if;
 update public.orders set
 status=coalesce(p_changes->>'status',status),
 tracking_number=coalesce(p_changes->>'tracking_number',tracking_number),
 admin_note=coalesce(p_changes->>'admin_note',admin_note),
 recipient_name=coalesce(p_changes->>'recipient_name',recipient_name),
 recipient_phone=coalesce(p_changes->>'recipient_phone',recipient_phone),
 postal_code=coalesce(p_changes->>'postal_code',postal_code),
 shipping_address=coalesce(p_changes->>'shipping_address',shipping_address),
 created_at=coalesce((p_changes->>'created_at')::timestamptz,created_at),
 order_number=coalesce(p_changes->>'order_number',order_number),
 total_amount=(select coalesce(sum(line_total),0) from public.order_items where order_id=p_id),
 updated_at=now() where id=p_id;
 select to_jsonb(o)||jsonb_build_object('order_items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.order_items i where i.order_id=p_id)) into v_result from public.orders o where o.id=p_id;
 return v_result;
end; $function$
;
create function public.guard_expense_purchase_allocation() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from order_items where id=new.order_item_id and item_type='expense') then raise exception '費用不計庫存，不需對應商品進貨單';end if;
 return new;
end $$;
create trigger guard_expense_purchase_allocation before insert or update on public.purchase_order_allocations for each row execute function public.guard_expense_purchase_allocation();
