
alter table public.product_master add column catalog_type text not null default 'regular' check(catalog_type in ('regular','personal'));
alter table public.product_master alter column product_code drop not null;
create or replace function private.assign_product_code()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.catalog_type='personal' then
  if tg_op='UPDATE' and old.product_code is not null then new.legacy_product_code:=coalesce(new.legacy_product_code,old.product_code);end if;
  new.product_code:=null;
 elsif new.product_code is null or new.product_code='' then new.product_code:=private.next_identifier('product_FR','FR-');end if;
 return new;
end $$;
drop trigger product_master_assign_code on public.product_master;
create trigger product_master_assign_code before insert or update of catalog_type,product_code on public.product_master for each row execute function private.assign_product_code();
-- Classification preserves internal IDs and every existing foreign-key receipt link.
lock table public.product_master in share row exclusive mode;
lock table public.identifier_counters in share row exclusive mode;
with changed as(
 update public.product_master m set catalog_type='personal',legacy_product_code=coalesce(legacy_product_code,product_code),product_code=null,updated_at=clock_timestamp()
 where product_code between 'FR-000107' and 'FR-000169' and status='pending_review' and published_product_id is null
 and not exists(select 1 from public.products p where p.product_master_id=m.id)
 and not exists(select 1 from public.cost_scenarios c where c.product_master_id=m.id)
 returning id,legacy_product_code,name
)
insert into public.inventory_history(entity,record_id,before_value,after_value)
select 'product_master',id::text,jsonb_build_object('product_code',legacy_product_code,'catalog_type','regular'),jsonb_build_object('product_code',null,'catalog_type','personal','name',name,'reason','單次代購退出 FR 編號序列，保留歷史收據對應') from changed;
alter table public.product_master add constraint master_catalog_code check(
(catalog_type='regular' and product_code is not null and product_code ~ '^FR-[0-9]{6}$') or (catalog_type='personal' and product_code is null));
update public.identifier_counters set next_value=(select coalesce(max(substring(product_code from 4)::bigint),0)+1 from public.product_master where catalog_type='regular'),updated_at=clock_timestamp() where counter_key='product_FR';
create index product_master_catalog_type_idx on public.product_master(catalog_type);
