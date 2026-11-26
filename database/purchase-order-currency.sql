create or replace function public.create_purchase_order_currency(p_id uuid,p_supplier_id uuid,p_ordered_at date,p_notes text,p_items jsonb,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb; existing_currency text;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '僅管理員可建立進貨單' using errcode='42501'; end if;
 if p_currency is null or p_currency not in ('JPY','TWD') then raise exception '幣別須為 JPY 或 TWD'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select currency into existing_currency from public.purchase_orders where id=p_id;
 if found and existing_currency<>p_currency then raise exception '此進貨單已建立，幣別與本次輸入不同，請重新整理確認'; end if;
 result:=public.create_purchase_order(p_id,p_supplier_id,p_ordered_at,p_notes,p_items);
 update public.purchase_orders set currency=p_currency where id=p_id;
 return result;
end $$;
create or replace function public.update_purchase_order_currency(p_id uuid,p_expected jsonb,p_supplier_id uuid,p_ordered_at date,p_notes text,p_items jsonb,p_currency text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '僅管理員可修改進貨單' using errcode='42501'; end if;
 if p_currency is null or p_currency not in ('JPY','TWD') then raise exception '幣別須為 JPY 或 TWD'; end if;
 result:=public.update_purchase_order(p_id,p_expected,p_supplier_id,p_ordered_at,p_notes,p_items);
 update public.purchase_orders set currency=p_currency where id=p_id;
 return result;
end $$;
revoke all on function public.create_purchase_order_currency(uuid,uuid,date,text,jsonb,text) from public,anon;
revoke all on function public.update_purchase_order_currency(uuid,jsonb,uuid,date,text,jsonb,text) from public,anon;
grant execute on function public.create_purchase_order_currency(uuid,uuid,date,text,jsonb,text) to authenticated;
grant execute on function public.update_purchase_order_currency(uuid,jsonb,uuid,date,text,jsonb,text) to authenticated;