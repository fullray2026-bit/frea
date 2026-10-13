begin;
alter table public.social_styles add column image_count integer not null default 1 check(image_count in (1,3));
alter table public.social_schedules add column review_only boolean not null default false;
alter table public.social_jobs add column image_paths text[] not null default '{}';
alter table public.social_jobs add column fb_photo_ids text[] not null default '{}';
alter table public.social_jobs add column ig_child_ids text[] not null default '{}';
alter table public.social_jobs add column is_dry_run boolean not null default false;
alter table public.social_jobs add column test_confirmed_at timestamptz;
create function social_private.guard_pipeline_test() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='INSERT' and new.schedule_id is not null then select review_only into new.is_dry_run from public.social_schedules where id=new.schedule_id;end if;
 if tg_op='UPDATE' and old.is_dry_run and not new.is_dry_run then raise exception '流程測試不可轉成正式發布';end if;
 if new.is_dry_run and new.state in ('approved','fb_upload','fb_publish','ig_create','ig_children_wait','ig_wait','ig_publish','done') then raise exception '流程測試禁止發布';end if;
 return new;
end $$;
revoke all on function social_private.guard_pipeline_test() from public,anon,authenticated;
create trigger social_pipeline_test_guard before insert or update on public.social_jobs for each row execute function social_private.guard_pipeline_test();
do $$ declare definition text;begin
 definition:=pg_get_functiondef('social_private.social_finish_draft(uuid,uuid,text)'::regprocedure);
 definition:=replace(definition,'image_path,background_path,generation_mode,style_snapshot)','image_path,background_path,generation_mode,style_snapshot,image_paths,image_generation)');
 definition:=replace(definition,'image,j.scene_path,''ai'',j.style_snapshot) returning','image,j.scene_path,''ai'',j.style_snapshot,j.image_paths,jsonb_build_object(''state'',''complete'',''review_only'',j.is_dry_run)) returning');
 definition:=replace(definition,'insert into public.social_drafts(kind,','if j.kind=''product'' and (j.style_snapshot->>''image_count'')::int=3 and cardinality(j.image_paths)<>3 then raise exception ''三圖尚未完成'';end if; insert into public.social_drafts(kind,');
 execute definition;
 definition:=pg_get_functiondef('social_private.social_review(uuid,text)'::regprocedure);
 definition:=replace(definition,' update public.social_jobs set state=''approved''',' if j.is_dry_run then update public.social_jobs set state=''test_done'',test_confirmed_at=now(),lease=null,lease_until=null,result_notified=true,updated_at=now() where id=j.id; return ''三圖、文案與 LINE 確認測試完成；此篇不會發布 FB／IG。'';end if; update public.social_jobs set state=''approved''');execute definition;
 definition:=pg_get_functiondef('social_private.social_claim()'::regprocedure);definition:=replace(definition,'''ig_create'',''ig_wait''','''ig_create'',''ig_children_wait'',''ig_wait''');execute definition;
 definition:=pg_get_functiondef('social_private.social_send_draft(uuid)'::regprocedure);definition:=replace(definition,'''ig_create'',''ig_wait''','''ig_create'',''ig_children_wait'',''ig_wait''');execute definition;
 definition:=pg_get_functiondef('social_private.guard_draft()'::regprocedure);definition:=replace(definition,'''ig_create'',''ig_wait''','''ig_create'',''ig_children_wait'',''ig_wait''');execute definition;
end $$;
update public.social_styles set image_count=3 where id='71b5fbf9-2505-4fbb-b5cc-8a5b02b37673';
update public.social_schedules set style_id='71b5fbf9-2505-4fbb-b5cc-8a5b02b37673',review_only=true,updated_at=now() where id='4bc72086-1e75-4e77-bf6b-c5e420d98446';
commit;
