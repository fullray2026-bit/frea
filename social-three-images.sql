-- Additive test workflow; existing single-image schedules remain unchanged.
alter table public.social_drafts add column if not exists image_paths text[] not null default '{}';
alter table public.social_drafts add column if not exists is_test boolean not null default false;
alter table public.social_drafts add column if not exists image_generation jsonb not null default '{}';
create or replace function social_private.block_test_publish() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.draft_id is not null and exists(select 1 from public.social_drafts where id=new.draft_id and is_test) then
  raise exception '測試草稿不可送 LINE 或發布，請先完成測試驗收。';
 end if;
 return new;
end $$;
revoke all on function social_private.block_test_publish() from public,anon,authenticated;
create trigger social_block_test_publish before insert or update on public.social_jobs for each row execute function social_private.block_test_publish();
create or replace function social_private.keep_test_draft() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.is_test and (not new.is_test or new.status <> 'draft') then raise exception '測試草稿只能保留待審閱，不能轉為發布草稿。'; end if;
 return new;
end $$;
revoke all on function social_private.keep_test_draft() from public,anon,authenticated;
create trigger social_keep_test_draft before update on public.social_drafts for each row execute function social_private.keep_test_draft();
