create or replace function public.create_storefront_category(p_name text,p_status text,p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare new_id text; new_revision integer; next_order integer; clean_name text:=btrim(p_name);
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'Admin access required' using errcode='42501';end if;
 if clean_name is null or length(clean_name) not between 1 and 40 then raise exception 'Category name must contain 1 to 40 characters' using errcode='22023';end if;
 if p_status is null or p_status not in ('visible','hidden','soon') then raise exception 'Invalid category status' using errcode='22023';end if;
 if clean_name in ('全部商品','自選代購') then raise exception '此名稱為固定入口，請使用其他分類名稱。' using errcode='22023';end if;
 update public.storefront_revision set revision=revision+1,updated_at=now() where id and revision=p_expected_revision returning revision into new_revision;
 if new_revision is null then raise exception 'Settings changed elsewhere. Reload before saving.' using errcode='40001';end if;
 if exists(select 1 from public.storefront_categories where lower(btrim(name))=lower(clean_name)) then raise exception '分類名稱已存在，請使用其他名稱。' using errcode='23505';end if;
 new_id:='category-'||pg_catalog.gen_random_uuid()::text;
 select coalesce(max(sort_order),0)+1 into next_order from public.storefront_categories;
 insert into public.storefront_categories(id,name,status,sort_order) values(new_id,clean_name,p_status,next_order);
 return jsonb_build_object('id',new_id,'revision',new_revision);
end $$;
revoke all on function public.create_storefront_category(text,text,integer) from public,anon;
grant execute on function public.create_storefront_category(text,text,integer) to authenticated;
notify pgrst,'reload schema';