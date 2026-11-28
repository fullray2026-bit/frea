alter table public.social_jobs add column if not exists deleted_at timestamptz,add column if not exists deleted_by uuid;
create or replace function social_private.social_delete_job_record(p_id uuid,p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare r public.social_jobs%rowtype;
begin
 if (select auth.uid()) is null or coalesce((select auth.jwt())->'app_metadata'->>'role','')<>'admin' then raise exception '僅限管理員' using errcode='42501';end if;
 select * into r from public.social_jobs where id=p_id for update;
 if not found then raise exception '找不到發布紀錄，請重新整理。' using errcode='P0002';end if;
 if r.deleted_at is not null then return;end if;
 if p_expected_updated_at is null or r.updated_at is distinct from p_expected_updated_at then raise exception '此紀錄已更新，請重新整理後再刪除。' using errcode='40001';end if;
 if r.state not in ('done','failed','skipped','stale','test_done','needs_check') or r.lease_until>clock_timestamp() then raise exception '工作仍在處理中，請稍後再刪除。' using errcode='55000';end if;
 update public.social_jobs set deleted_at=clock_timestamp(),deleted_by=auth.uid(),updated_at=greatest(clock_timestamp(),r.updated_at+interval '1 microsecond') where id=p_id;
end $$;
create or replace function public.social_delete_job_record(p_id uuid,p_expected_updated_at timestamptz)
returns void language sql security invoker set search_path='' as $$select social_private.social_delete_job_record(p_id,p_expected_updated_at);$$;
revoke all on function social_private.social_delete_job_record(uuid,timestamptz) from public,anon;
revoke all on function public.social_delete_job_record(uuid,timestamptz) from public,anon;
grant execute on function social_private.social_delete_job_record(uuid,timestamptz) to authenticated;
grant execute on function public.social_delete_job_record(uuid,timestamptz) to authenticated;
notify pgrst,'reload schema';
