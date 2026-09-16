begin;
create unique index if not exists products_one_per_master on public.products(product_master_id) where product_master_id is not null;

create or replace function private.guard_master_workflow() returns trigger language plpgsql security invoker set search_path='' as $$
declare linked public.products; adopted boolean;
begin
 if new.status='archived' then return new; end if;
 select * into linked from public.products where product_master_id=new.id limit 1;
 if found then
   new.published_product_id:=linked.id;
   new.status:=case when linked.is_active then 'published' else 'ready_to_publish' end;
 else
   new.published_product_id:=null;
   if tg_op='UPDATE' and old.published_product_id is not null then
     if exists(select 1 from public.cost_scenarios where product_master_id=new.id and is_selected and actual_sale_price_twd>0) and nullif(new.storefront_brand_code,'') is not null then new.status:='ready_to_publish';
     elsif exists(select 1 from public.cost_scenarios where product_master_id=new.id) then new.status:='costed';
     else new.status:='confirmed'; end if;
   end if;
   if new.status='published' then
     if tg_op='UPDATE' and old.published_product_id is not null then new.status:='costed';
     else raise exception '請從商品管理確認上架，不能直接將主檔設為已上架。'; end if;
   end if;
   if new.status='ready_to_publish' then
     select exists(select 1 from public.cost_scenarios where product_master_id=new.id and is_selected and actual_sale_price_twd>0) into adopted;
     if not adopted or nullif(new.storefront_brand_code,'') is null then
       raise exception '待上架前，請指定網站品牌並採用實際銷售價大於 0 的成本方案。';
     end if;
   end if;
 end if;
 return new;
end $$;
drop trigger if exists master_workflow_guard on public.product_master;
create trigger master_workflow_guard before insert or update on public.product_master for each row execute function private.guard_master_workflow();

create or replace function private.guard_product_workflow() returns trigger language plpgsql security invoker set search_path='' as $$
declare adopted uuid; master_status text;
begin
 if new.product_master_id is null then return new; end if;
 select status into master_status from public.product_master where id=new.product_master_id for update;
 if new.cost_scenario_id is not null and not exists(select 1 from public.cost_scenarios where id=new.cost_scenario_id and product_master_id=new.product_master_id) then
   raise exception '成本方案與商品主檔不一致。';
 end if;
 if tg_op='INSERT' or (tg_op='UPDATE' and (not old.is_active and new.is_active or old.product_master_id is distinct from new.product_master_id)) then
   if master_status='archived' then raise exception '已封存主檔不可新增或上架商品。'; end if;
   select id into adopted from public.cost_scenarios where product_master_id=new.product_master_id and is_selected and actual_sale_price_twd>0;
   if adopted is null then raise exception '請先採用實際銷售價大於 0 的成本方案。'; end if;
   new.cost_scenario_id:=adopted;
 end if;
 if new.is_active and new.price<=0 then raise exception '上架商品售價必須大於 0。'; end if;
 return new;
end $$;
drop trigger if exists product_workflow_guard on public.products;
create trigger product_workflow_guard before insert or update on public.products for each row execute function private.guard_product_workflow();

create or replace function private.sync_workflow_master() returns trigger language plpgsql security invoker set search_path='' as $$
declare mid uuid; mids uuid[]; desired text;
begin
 if tg_op='INSERT' then mids:=array[new.product_master_id];
 elsif tg_op='DELETE' then mids:=array[old.product_master_id];
 else mids:=array[old.product_master_id,new.product_master_id]; end if;
 for mid in select distinct x from unnest(mids) x where x is not null loop
   if exists(select 1 from public.products where product_master_id=mid and is_active) then desired:='published';
   elsif exists(select 1 from public.products where product_master_id=mid) then desired:='ready_to_publish';
   elsif exists(select 1 from public.cost_scenarios s join public.product_master m on m.id=s.product_master_id where s.product_master_id=mid and s.is_selected and s.actual_sale_price_twd>0 and nullif(m.storefront_brand_code,'') is not null) then desired:='ready_to_publish';
   elsif exists(select 1 from public.cost_scenarios where product_master_id=mid) then desired:='costed';
   else desired:='confirmed'; end if;
   update public.product_master set status=desired,updated_at=now() where id=mid and status<>'archived';
 end loop;
 return null;
end $$;
drop trigger if exists products_sync_master on public.products;
create trigger products_sync_master after insert or update or delete on public.products for each row execute function private.sync_workflow_master();
drop trigger if exists costs_sync_master on public.cost_scenarios;
create trigger costs_sync_master after insert or update or delete on public.cost_scenarios for each row execute function private.sync_workflow_master();

create or replace function public.adopt_product_cost(p_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare mid uuid; sale numeric;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception '管理員權限不足。'; end if;
 select product_master_id,actual_sale_price_twd into mid,sale from public.cost_scenarios where id=p_id;
 if mid is null or coalesce(sale,0)<=0 then raise exception '請先填寫大於 0 的實際銷售價，再採用成本方案。'; end if;
 perform 1 from public.product_master where id=mid for update;
 update public.cost_scenarios set is_selected=false where product_master_id=mid and is_selected;
 update public.cost_scenarios set is_selected=true where id=p_id;
end $$;
revoke all on function public.adopt_product_cost(uuid) from public,anon;
grant execute on function public.adopt_product_cost(uuid) to authenticated;
revoke all on function private.guard_master_workflow(),private.guard_product_workflow(),private.sync_workflow_master() from public,anon,authenticated;
commit;