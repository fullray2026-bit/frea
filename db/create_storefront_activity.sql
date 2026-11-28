create or replace function public.create_storefront_activity(p_title text,p_image text,p_expected_revision integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare new_id text; new_revision integer; next_order integer;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 80 then raise exception 'Activity title must contain 1 to 80 characters' using errcode='22023'; end if;
 if p_image is null or length(p_image)>2048 or p_image !~ '^https://[^[:space:]]+$' then raise exception 'A valid HTTPS image URL is required' using errcode='22023'; end if;
 update public.storefront_revision set revision=revision+1,updated_at=now() where id and revision=p_expected_revision returning revision into new_revision;
 if new_revision is null then raise exception 'Settings changed elsewhere. Reload before saving.' using errcode='40001'; end if;
 new_id:='activity-'||pg_catalog.gen_random_uuid()::text;
 select coalesce(max(sort_order),0)+1 into next_order from public.storefront_activities;
 insert into public.storefront_activities(id,title,description,image,status,sort_order) values(new_id,btrim(p_title),'',p_image,'draft',next_order);
 return jsonb_build_object('id',new_id,'revision',new_revision);
end $$;
revoke all on function public.create_storefront_activity(text,text,integer) from public,anon;
grant execute on function public.create_storefront_activity(text,text,integer) to authenticated;
notify pgrst,'reload schema';