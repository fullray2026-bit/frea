create or replace function public.social_tick() returns void language plpgsql security definer set search_path='' as $$
declare t timestamptz:=now(); begin
 perform pg_advisory_xact_lock(72844101);
 update social_private.runtime set last_tick=t where id=true;
 if not exists(select 1 from social_private.runtime where enabled) then return; end if;
 insert into public.social_jobs(schedule_id,scheduled_for,kind,style_snapshot)
 select s.id,((t at time zone 'Asia/Tokyo')::date+s.local_time) at time zone 'Asia/Tokyo',s.kind,to_jsonb(st)
 from public.social_schedules s join public.social_styles st on st.id=coalesce(s.style_id,(select id from public.social_styles where kind=s.kind and is_default))
 where s.enabled and st.kind=s.kind and extract(dow from t at time zone 'Asia/Tokyo')::int=any(s.weekdays)
 and ((t at time zone 'Asia/Tokyo')::date+s.local_time) at time zone 'Asia/Tokyo' between greatest(t-interval '15 minutes',(select started_at from social_private.runtime)) and t
 on conflict(schedule_id,scheduled_for) do nothing;
 update public.social_jobs set state='failed',error='製作多次中斷，請查看紀錄後再試。',lease=null,lease_until=null where state in ('queued','copy','image','compose','notify') and attempts>=2 and lease_until<now();
 update public.social_jobs set state='stale',error='審核已超過七天，請重新送審。',updated_at=t where state='pending' and expires_at<t;
 update public.social_jobs set state='needs_check',error='發布請求的結果尚未確認，系統已停止重送以避免重複貼文。',lease=null,lease_until=null,updated_at=t where lease_until<t and (fb_attempted and fb_post_id is null or ig_attempted and ig_media_id is null) and state not in ('done','needs_check');
end $$;
create or replace function public.social_claim() returns setof public.social_jobs language plpgsql security definer set search_path='' as $$
declare chosen uuid; begin
 perform pg_advisory_xact_lock(72844102);
 if not exists(select 1 from social_private.runtime where id=true and enabled) then return;end if;
 if exists(select 1 from public.social_jobs where lease_until>now()) then return; end if;
 select id into chosen from public.social_jobs where state in ('queued','copy','image','compose','notify','approved','fb_upload','fb_publish','ig_create','ig_wait','ig_publish') and available_at<=now() and (lease_until is null or lease_until<now()) order by approved_at nulls last,created_at limit 1 for update skip locked;
 if chosen is null then return; end if;
 return query update public.social_jobs set lease=gen_random_uuid(),lease_until=now()+interval '8 minutes',attempts=attempts+1,updated_at=now() where id=chosen returning *;
end $$;
create or replace function public.social_toggle_pipeline(enable boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if coalesce((select auth.jwt())->'app_metadata'->>'role','')<>'admin' then raise exception '僅限管理員';end if;
 update social_private.runtime set enabled=enable,started_at=case when enable and not enabled then now() else started_at end where id=true;
end $$;
create or replace function public.social_review(token uuid,decision text) returns text language plpgsql security definer set search_path='' as $$
declare j public.social_jobs; d public.social_drafts; begin
 select * into j from public.social_jobs where review_token=token for update;
 if j.id is null then return '找不到這則審核。'; end if;
 if j.state not in ('pending','notify') or (j.state='notify' and j.line_payload is null) then return '這則審核已處理或已失效，不會重複發布。'; end if;
 select * into d from public.social_drafts where id=j.draft_id for update;
 if j.expires_at<now() or d.revision<>j.draft_revision or d.status='skipped' then
 update public.social_jobs set state='stale',updated_at=now(),error='草稿版本已變更或審核已過期。' where id=j.id;return '草稿已修改或審核已過期，請在後台重新送審。';end if;
 if decision='skip' then update public.social_jobs set state='skipped',lease=null,lease_until=null,updated_at=now() where id=j.id;return '已略過這篇貼文，不會發布。';end if;
 if decision<>'approve' then return '不支援的審核操作。';end if;
 update public.social_jobs set state='approved',lease=null,lease_until=null,approved_at=now(),available_at=now(),updated_at=now(),attempts=0 where id=j.id;
 return '已確認這篇的圖片與文案，接下來會發布至 fréa 的 Facebook 與 Instagram，完成後再通知你。';
end $$;