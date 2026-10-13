create or replace function social_private.delete_draft(chosen uuid, expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare d public.social_drafts;
begin
 if auth.uid() is null or coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' then raise exception '僅管理員可刪除草稿'; end if;
 -- Match LINE review lock order, then serialize deletion with draft edits.
 perform id from public.social_jobs where draft_id=chosen order by id for update;
 select * into d from public.social_drafts where id=chosen for update;
 if d.id is null then raise exception '草稿已不存在，請重新整理'; end if;
 if d.revision<>expected_revision then raise exception '草稿版本已變更，請重新整理後再刪除'; end if;
 if d.image_generation->>'state'='generating' or exists(select 1 from public.social_jobs where draft_id=chosen and (state not in ('pending','done','test_done','skipped','stale','failed') or lease_until>now() or ((fb_attempted or ig_attempted) and state<>'done'))) then
 raise exception '此草稿正在製作、發布或等待確認發布結果，暫時無法刪除'; end if;
 update public.social_jobs set draft_id=null,state=case when state='pending' then 'skipped' else state end,
 error=case when state='pending' then '草稿已刪除，審核已取消。' else error end,updated_at=now() where draft_id=chosen;
 delete from public.social_drafts where id=chosen;
end $$;
revoke all on function social_private.delete_draft(uuid,integer) from public,anon;
grant execute on function social_private.delete_draft(uuid,integer) to authenticated;
create or replace function public.social_delete_draft(chosen uuid,expected_revision integer)
returns void language sql security invoker set search_path='' as $$ select social_private.delete_draft(chosen,expected_revision); $$;
revoke all on function public.social_delete_draft(uuid,integer) from public,anon;
grant execute on function public.social_delete_draft(uuid,integer) to authenticated;
