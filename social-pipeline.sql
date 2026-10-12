-- Social pipeline only. No storefront or order tables are changed.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create schema if not exists social_private;
revoke all on schema social_private from public,anon,authenticated;
create table social_private.runtime(id boolean primary key default true check(id),enabled boolean not null default false,started_at timestamptz not null default now(),last_tick timestamptz);
insert into social_private.runtime(id) values(true);
do $$ begin perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'social_cron_key','Social worker request authentication'); end $$;
create table public.social_jobs(
 id uuid primary key default gen_random_uuid(), schedule_id uuid references public.social_schedules(id), scheduled_for timestamptz,
 kind text not null check(kind in ('product','life')), state text not null default 'queued',
 source_id uuid, source_snapshot jsonb, style_snapshot jsonb, copy jsonb, scene_path text,
 draft_id uuid references public.social_drafts(id), draft_revision integer, payload jsonb,
 review_token uuid not null default gen_random_uuid(), expires_at timestamptz,
 line_payload jsonb, line_sent_at timestamptz, approved_at timestamptz,
 fb_photo_id text, fb_post_id text, ig_container_id text, ig_media_id text,
 fb_attempted boolean not null default false,ig_attempted boolean not null default false,
 attempts integer not null default 0, lease uuid, lease_until timestamptz, available_at timestamptz not null default now(),
 error text, result_notified boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(schedule_id,scheduled_for)
);
create index social_jobs_queue on public.social_jobs(state,available_at);
alter table public.social_jobs enable row level security;
revoke all on public.social_jobs from anon,authenticated;
grant select on public.social_jobs to authenticated;
grant all on public.social_jobs to service_role;
create policy social_jobs_admin_read on public.social_jobs for select to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin');
create or replace function social_private.dispatch() returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from social_private.runtime where enabled) then return; end if;
 perform net.http_post(url:='https://ixxatlyckbtihlnmlqnw.supabase.co/functions/v1/social-worker',headers:=jsonb_build_object('Content-Type','application/json','x-social-cron-key',(select decrypted_secret from vault.decrypted_secrets where name='social_cron_key')),body:='{}'::jsonb,timeout_milliseconds:=5000);
end $$;
revoke all on function social_private.dispatch() from public,anon,authenticated;
create function public.social_cron_auth(secret_digest text) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from vault.decrypted_secrets where name='social_cron_key' and encode(extensions.digest(decrypted_secret,'sha256'),'hex')=secret_digest);
$$;
revoke all on function public.social_cron_auth(text) from public,anon,authenticated;
grant execute on function public.social_cron_auth(text) to service_role;
create function public.social_tick() returns void language plpgsql security definer set search_path='' as $$
declare t timestamptz:=now(); begin
 perform pg_advisory_xact_lock(72844101);
 update social_private.runtime set last_tick=t;
 if not exists(select 1 from social_private.runtime where enabled) then return; end if;
 insert into public.social_jobs(schedule_id,scheduled_for,kind,style_snapshot)
 select s.id,((t at time zone 'Asia/Tokyo')::date+s.local_time) at time zone 'Asia/Tokyo',s.kind,to_jsonb(st)
 from public.social_schedules s join public.social_styles st on st.id=coalesce(s.style_id,(select id from public.social_styles where kind=s.kind and is_default))
 where s.enabled and st.kind=s.kind and extract(dow from t at time zone 'Asia/Tokyo')::int=any(s.weekdays)
 and ((t at time zone 'Asia/Tokyo')::date+s.local_time) at time zone 'Asia/Tokyo' between greatest(t-interval '15 minutes',(select started_at from social_private.runtime)) and t
 on conflict(schedule_id,scheduled_for) do nothing;
 update public.social_jobs set state='stale',error='審核已超過七天，請重新送審。',updated_at=t where state='pending' and expires_at<t;
 update public.social_jobs set state='needs_check',error='發布請求的結果尚未確認，系統已停止重送以避免重複貼文。',lease=null,lease_until=null,updated_at=t where lease_until<t and (fb_attempted and fb_post_id is null or ig_attempted and ig_media_id is null) and state not in ('done','needs_check');
end $$;
revoke all on function public.social_tick() from public,anon,authenticated;
grant execute on function public.social_tick() to service_role;
create function public.social_claim() returns setof public.social_jobs language plpgsql security definer set search_path='' as $$
declare chosen uuid; begin
 perform pg_advisory_xact_lock(72844102);
 if exists(select 1 from public.social_jobs where lease_until>now()) then return; end if;
 select id into chosen from public.social_jobs where state in ('queued','copy','image','compose','notify','approved','fb_upload','fb_publish','ig_create','ig_wait','ig_publish') and available_at<=now() and (lease_until is null or lease_until<now()) order by approved_at nulls last,created_at limit 1 for update skip locked;
 if chosen is null then return; end if;
 return query update public.social_jobs set lease=gen_random_uuid(),lease_until=now()+interval '8 minutes',attempts=attempts+1,updated_at=now() where id=chosen returning *;
end $$;
revoke all on function public.social_claim() from public,anon,authenticated;
grant execute on function public.social_claim() to service_role;
create function public.social_review(token uuid,decision text) returns text language plpgsql security definer set search_path='' as $$
declare j public.social_jobs; d public.social_drafts; begin
 select * into j from public.social_jobs where review_token=token for update;
 if j.id is null then return '找不到這則審核。'; end if;
 if j.state<>'pending' then return '這則審核已處理或已失效，不會重複發布。'; end if;
 select * into d from public.social_drafts where id=j.draft_id for update;
 if j.expires_at<now() or d.revision<>j.draft_revision or d.status='skipped' then
 update public.social_jobs set state='stale',updated_at=now(),error='草稿版本已變更或審核已過期。' where id=j.id;return '草稿已修改或審核已過期，請在後台重新送審。';end if;
 if decision='skip' then update public.social_jobs set state='skipped',updated_at=now() where id=j.id;return '已略過這篇貼文，不會發布。';end if;
 if decision<>'approve' then return '不支援的審核操作。';end if;
 update public.social_jobs set state='approved',approved_at=now(),available_at=now(),updated_at=now(),attempts=0 where id=j.id;
 return '已確認這篇的圖片與文案，接下來會發布至 fréa 的 Facebook 與 Instagram，完成後再通知你。';
end $$;
revoke all on function public.social_review(uuid,text) from public,anon,authenticated;
grant execute on function public.social_review(uuid,text) to service_role;
create function public.social_send_draft(chosen uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.social_drafts; j uuid; begin
 if coalesce((select auth.jwt())->'app_metadata'->>'role','')<>'admin' then raise exception '僅限管理員';end if;
 select * into d from public.social_drafts where id=chosen for update;
 if d.id is null or d.image_path is null or d.facebook_text='' or d.instagram_text='' then raise exception '請先儲存完整的圖片與文案。';end if;
 if exists(select 1 from public.social_jobs where draft_id=chosen and state in ('approved','fb_upload','fb_publish','ig_create','ig_wait','ig_publish','done','needs_check')) then raise exception '這篇已進入發布流程或已發布，不能重複送審。';end if;
 select id into j from public.social_jobs where draft_id=chosen and draft_revision=d.revision and state in ('notify','pending') limit 1;
 if j is not null then return j;end if;
 update public.social_jobs set state='stale',error='已有更新版本送審。' where draft_id=chosen and state in ('notify','pending');
 insert into public.social_jobs(kind,state,draft_id,draft_revision,payload,style_snapshot) values(d.kind,'notify',d.id,d.revision,to_jsonb(d),d.style_snapshot) returning id into j;
 return j;
end $$;
revoke all on function public.social_send_draft(uuid) from public,anon;
grant execute on function public.social_send_draft(uuid) to authenticated;
create function public.social_generate_now(chosen uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.social_schedules; style public.social_styles; j uuid; begin
 if coalesce((select auth.jwt())->'app_metadata'->>'role','')<>'admin' then raise exception '僅限管理員';end if;
 select * into s from public.social_schedules where id=chosen;
 if s.id is null then raise exception '找不到排程';end if;
 if exists(select 1 from public.social_jobs where schedule_id=chosen and created_at>now()-interval '5 minutes') then raise exception '此排程剛剛已送出製作，請稍候。';end if;
 select * into style from public.social_styles where id=coalesce(s.style_id,(select id from public.social_styles where kind=s.kind and is_default));
 if style.id is null or style.kind<>s.kind then raise exception '請設定相同類型的風格';end if;
 insert into public.social_jobs(schedule_id,kind,style_snapshot) values(s.id,s.kind,to_jsonb(style)) returning id into j;return j;
end $$;
revoke all on function public.social_generate_now(uuid) from public,anon;
grant execute on function public.social_generate_now(uuid) to authenticated;
create function social_private.guard_draft() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.social_jobs where draft_id=old.id and state in ('approved','fb_upload','fb_publish','ig_create','ig_wait','ig_publish','done','needs_check')) then raise exception '這篇已確認發布，請另建草稿，不可修改已核准版本。';end if;
 return new;
end $$;
revoke all on function social_private.guard_draft() from public,anon,authenticated;
create trigger social_guard_approved before update on public.social_drafts for each row execute function social_private.guard_draft();
select cron.schedule('frea-social-pipeline','* * * * *','select social_private.dispatch()');
-- Execution remains paused until deployment checks finish.
insert into public.social_schedules(name,kind,weekdays,local_time,enabled) values('週一三五・日常選物','product',array[1,3,5],'08:00',true);
create function public.social_finish_draft(job uuid,lock_id uuid,image text) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.social_jobs;d public.social_drafts;begin
 select * into j from public.social_jobs where id=job and lease=lock_id for update;
 if j.id is null or j.state<>'compose' then raise exception '工作鎖失效';end if;
 insert into public.social_drafts(kind,product_id,material_id,product_snapshot,title,facebook_text,instagram_text,image_path,background_path,generation_mode,style_snapshot)
 values(j.kind,case when j.kind='product' then j.source_id end,case when j.kind='life' then j.source_id end,
 case when j.kind='product' then j.source_snapshot else jsonb_build_object('name',j.source_snapshot->>'title','location',j.source_snapshot->>'location','notes',j.source_snapshot->>'notes','source_type',j.source_snapshot->>'source_type') end,
 j.copy->>'title',j.copy->>'facebook_text',j.copy->>'instagram_text',image,j.scene_path,'ai',j.style_snapshot) returning * into d;
 update public.social_jobs set draft_id=d.id,draft_revision=d.revision,payload=to_jsonb(d),state='notify',attempts=0,lease=null,lease_until=null,updated_at=now() where id=job;
 return d.id;
end $$;
revoke all on function public.social_finish_draft(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.social_finish_draft(uuid,uuid,text) to service_role;
create function public.social_pipeline_status() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if coalesce((select auth.jwt())->'app_metadata'->>'role','')<>'admin' then raise exception '僅限管理員';end if;
 return (select jsonb_build_object('enabled',enabled,'last_tick',last_tick) from social_private.runtime);
end $$;
revoke all on function public.social_pipeline_status() from public,anon;
grant execute on function public.social_pipeline_status() to authenticated;
