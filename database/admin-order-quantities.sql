create or replace function public.admin_save_order(p_id bigint,p_expected_updated_at timestamptz,p_changes jsonb,p_items jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_count integer; v_result jsonb;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then raise exception '僅限管理員修改訂單' using errcode='42501'; end if;
 select * into v_order from public.orders where id=p_id for update;
 if not found then raise exception '找不到訂單'; end if;
 if v_order.updated_at is distinct from p_expected_updated_at then raise exception '訂單已被更新，請重新整理後再修改'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception '商品資料格式錯誤'; end if;
 select count(*) into v_count from public.order_items where order_id=p_id;
 if jsonb_array_length(p_items)<>v_count or (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>v_count then raise exception '商品明細已變更，請重新整理'; end if;
 if exists(select 1 from jsonb_array_elements(p_items) x where coalesce(x->>'quantity','') !~ '^[1-9][0-9]{0,4}$' or not exists(select 1 from public.order_items i where i.id=(x->>'id')::bigint and i.order_id=p_id)) then raise exception '商品數量須為 1 至 99999 的整數'; end if;
 update public.order_items i set quantity=(x->>'quantity')::integer from jsonb_array_elements(p_items) x where i.order_id=p_id and i.id=(x->>'id')::bigint;
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
end; $$;
revoke all on function public.admin_save_order(bigint,timestamptz,jsonb,jsonb) from public,anon;
grant execute on function public.admin_save_order(bigint,timestamptz,jsonb,jsonb) to authenticated;
