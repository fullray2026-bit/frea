create function public.social_set_default_style(chosen uuid) returns void language plpgsql security invoker set search_path='' as $$
declare target_kind text;
begin
 if coalesce((select auth.jwt())->'app_metadata'->>'role','')<>'admin' then raise exception '僅限管理員'; end if;
 select kind into target_kind from public.social_styles where id=chosen;
 if target_kind is null then raise exception '找不到風格'; end if;
 perform pg_advisory_xact_lock(hashtext('social_style_'||target_kind));
 update public.social_styles set is_default=false where kind=target_kind and is_default;
 update public.social_styles set is_default=true where id=chosen;
end $$;
revoke all on function public.social_set_default_style(uuid) from public,anon;
grant execute on function public.social_set_default_style(uuid) to authenticated;
