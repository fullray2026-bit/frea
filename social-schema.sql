-- Isolated social module. No existing tables or policies are changed.
create table public.social_settings (
 id boolean primary key default true check(id),
 timezone text not null default 'Asia/Tokyo' check(timezone='Asia/Tokyo'),
 daily_time time not null default '08:00' check(daily_time='08:00'),
 enabled boolean not null default false check(not enabled),
 preferred_product_ids uuid[] not null default '{}',
 excluded_product_ids uuid[] not null default '{}',
 avoid_repeat_days integer not null default 14 check(avoid_repeat_days between 1 and 90),
 updated_at timestamptz not null default now()
);
insert into public.social_settings(id) values(true);
create table public.social_drafts (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id),
 product_snapshot jsonb not null,
 title text not null check(length(title) between 1 and 40),
 facebook_text text not null check(length(facebook_text)<=5000),
 instagram_text text not null check(length(instagram_text)<=2200),
 image_path text,
 generation_mode text not null default 'manual' check(generation_mode in ('manual','template','ai')),
 status text not null default 'draft' check(status in ('draft','reviewed','skipped')),
 revision integer not null default 1,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table public.social_revisions (
 id bigint generated always as identity primary key,
 draft_id uuid not null references public.social_drafts(id) on delete cascade,
 revision integer not null,
 snapshot jsonb not null,
 saved_at timestamptz not null default now(),
 unique(draft_id,revision)
);
create function public.social_record_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.revision <> old.revision then raise exception '版本由系統管理'; end if;
   new.revision := old.revision+1;
   if new.title is distinct from old.title or new.facebook_text is distinct from old.facebook_text or new.instagram_text is distinct from old.instagram_text or new.image_path is distinct from old.image_path then
     new.status := 'draft';
   end if;
 end if;
 new.updated_at := now();
 return new;
end $$;
create function public.social_append_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.social_revisions(draft_id,revision,snapshot) values(new.id,new.revision,to_jsonb(new));
 return new;
end $$;
create trigger social_before_save before update on public.social_drafts for each row execute function public.social_record_revision();
create trigger social_after_save after insert or update on public.social_drafts for each row execute function public.social_append_revision();
alter table public.social_settings enable row level security;
alter table public.social_drafts enable row level security;
alter table public.social_revisions enable row level security;
create policy social_settings_admin on public.social_settings for all to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin') with check((select auth.jwt())->'app_metadata'->>'role'='admin');
create policy social_drafts_admin on public.social_drafts for all to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin') with check((select auth.jwt())->'app_metadata'->>'role'='admin');
create policy social_revisions_read on public.social_revisions for select to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin');
create policy social_revisions_append on public.social_revisions for insert to authenticated with check((select auth.jwt())->'app_metadata'->>'role'='admin');
revoke all on public.social_settings,public.social_drafts,public.social_revisions from anon,authenticated;
grant select,update on public.social_settings to authenticated;
grant select,insert,update on public.social_drafts to authenticated;
grant select,insert on public.social_revisions to authenticated;
grant usage on sequence public.social_revisions_id_seq to authenticated;
revoke execute on function public.social_record_revision(),public.social_append_revision() from public,anon,authenticated;
create index social_drafts_recent on public.social_drafts(created_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('social-drafts','social-drafts',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy social_images_read on storage.objects for select to authenticated using(bucket_id='social-drafts' and (select auth.jwt())->'app_metadata'->>'role'='admin');
create policy social_images_insert on storage.objects for insert to authenticated with check(bucket_id='social-drafts' and (select auth.jwt())->'app_metadata'->>'role'='admin');
alter table public.social_drafts add column background_path text;
