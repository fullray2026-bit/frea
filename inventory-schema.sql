
create table public.inventory_skus (
 id uuid primary key default gen_random_uuid(),
 product_master_id uuid not null references public.product_master(id),
 specification text not null check(length(trim(specification))>0),
 unit text not null default '個',
 created_at timestamptz not null default now(),
 unique(product_master_id,specification)
);
create table public.inventory_bindings (
 id uuid primary key default gen_random_uuid(),
 source_type text not null check(source_type in ('purchase','order','personal')),
 source_key text not null,
 source_snapshot jsonb not null,
 sku_id uuid references public.inventory_skus(id),
 purpose text not null default 'sale' check(purpose in ('sale','sample','expense')),
 quantity_factor numeric not null default 1 check(quantity_factor>0),
 received_quantity numeric not null default 0 check(received_quantity>=0),
 received_on date,
 note text not null default '',
 updated_at timestamptz not null default now(),
 unique(source_type,source_key),
 check(purpose<>'sale' or sku_id is not null),
 check(received_quantity=0 or received_on is not null)
);
create index inventory_bindings_sku_idx on public.inventory_bindings(sku_id);
create table public.inventory_adjustments (
 id uuid primary key,
 sku_id uuid not null references public.inventory_skus(id),
 quantity numeric not null check(quantity<>0),
 reason text not null check(length(trim(reason))>=2),
 occurred_on date not null,
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid()
);
create index inventory_adjustments_sku_idx on public.inventory_adjustments(sku_id);
create table public.inventory_history (
 id bigint generated always as identity primary key,
 entity text not null,
 record_id text not null,
 before_value jsonb,
 after_value jsonb,
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid()
);
create function public.inventory_source_snapshot(p_type text,p_key text)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare result jsonb;
begin
 if p_type='purchase' then
 select jsonb_build_object('master',product_master_id,'quantity',quantity) into result from purchase_order_items where id::text=p_key;
 elsif p_type='order' then
 select jsonb_build_object('name',product_name,'specification',specification,'quantity',quantity) into result from order_items where id::text=p_key;
 elsif p_type='personal' then
 select jsonb_build_object('name',x.item->>'name','specification',x.item->>'specification','quantity',x.item->'quantity')
 into result from personal_shopping_requests p cross join lateral jsonb_array_elements(p.items) with ordinality x(item,n)
 where p.id::text=split_part(p_key,':',1) and x.n-1=split_part(p_key,':',2)::integer;
 end if;
 return result;
end $$;
create function public.inventory_validate_binding()
returns trigger language plpgsql security invoker set search_path=public as $$
declare snap jsonb; master uuid;
begin
 snap:=inventory_source_snapshot(new.source_type,new.source_key);
 if snap is null or snap is distinct from new.source_snapshot then raise exception '來源商品已變更，請重新載入後對應'; end if;
 if new.source_type='purchase' then
  if new.received_quantity>(snap->>'quantity')::numeric then raise exception '到貨數量不得超過進貨數量'; end if;
  if new.sku_id is not null then
   select product_master_id into master from inventory_skus where id=new.sku_id;
   if master::text is distinct from snap->>'master' then raise exception '進貨規格必須屬於相同商品主檔'; end if;
  end if;
 elsif new.received_quantity<>0 then raise exception '僅進貨明細可登記到貨';
 end if;
 new.updated_at:=clock_timestamp(); return new;
end $$;
create trigger inventory_validate_binding before insert or update on public.inventory_bindings for each row execute function public.inventory_validate_binding();
create function public.inventory_audit()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into inventory_history(entity,record_id,before_value,after_value)
 values(TG_TABLE_NAME,new.id::text,case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
 return new;
end $$;
create trigger inventory_binding_audit after insert or update on public.inventory_bindings for each row execute function public.inventory_audit();
create trigger inventory_adjustment_audit after insert on public.inventory_adjustments for each row execute function public.inventory_audit();
create trigger inventory_sku_audit after insert on public.inventory_skus for each row execute function public.inventory_audit();
alter table public.inventory_skus enable row level security;
alter table public.inventory_bindings enable row level security;
alter table public.inventory_adjustments enable row level security;
alter table public.inventory_history enable row level security;
create policy inventory_skus_admin on public.inventory_skus for all to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin') with check ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy inventory_bindings_admin on public.inventory_bindings for all to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin') with check ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy inventory_adjustments_read on public.inventory_adjustments for select to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy inventory_adjustments_insert on public.inventory_adjustments for insert to authenticated with check ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy inventory_history_read on public.inventory_history for select to authenticated using ((auth.jwt()->'app_metadata'->>'role')='admin');
create policy inventory_history_insert on public.inventory_history for insert to authenticated with check ((auth.jwt()->'app_metadata'->>'role')='admin');
revoke all on public.inventory_skus,public.inventory_bindings,public.inventory_adjustments,public.inventory_history from anon,authenticated;
grant select,insert on public.inventory_skus,public.inventory_adjustments,public.inventory_history to authenticated;
grant select,insert,update on public.inventory_bindings to authenticated;
grant usage,select on sequence public.inventory_history_id_seq to authenticated;
revoke all on function public.inventory_source_snapshot(text,text),public.inventory_validate_binding(),public.inventory_audit() from public;
grant execute on function public.inventory_source_snapshot(text,text),public.inventory_validate_binding(),public.inventory_audit() to authenticated;
