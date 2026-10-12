alter table public.social_jobs add column ig_permalink text;
create function public.social_toggle_pipeline(enable boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if coalesce((select auth.jwt())->'app_metadata'->>'role','')<>'admin' then raise exception '僅限管理員';end if;
 update social_private.runtime set enabled=enable,started_at=case when enable and not enabled then now() else started_at end;
end $$;
revoke all on function public.social_toggle_pipeline(boolean) from public,anon;
grant execute on function public.social_toggle_pipeline(boolean) to authenticated;
