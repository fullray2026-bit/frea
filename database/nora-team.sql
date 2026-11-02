-- Apply after nora-workspace.sql. No changes to existing social/publishing tables.
begin;
alter table public.nora_turns add column role text not null default 'nora' check(role in ('nora','maya','leon','iris','jack'));
alter table public.nora_turns add column mode text not null default 'chat' check(mode in ('chat','research','image'));
alter table public.nora_turns add column asset_ids uuid[] not null default '{}';
alter table public.nora_turns add column generated_asset_ids uuid[] not null default '{}';
alter table public.nora_turns add column sources jsonb not null default '[]';
alter table public.nora_turns add column reference_text text not null default '' check(char_length(reference_text)<=25000);
create table public.nora_brand_state (
 brand_id text primary key check(brand_id='frea'), context text not null check(char_length(context) between 1 and 18000),
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.nora_assets (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 path text not null unique, name text not null check(char_length(name) between 1 and 160),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 source_type text not null check(source_type in ('real','illustration')),
 created_at timestamptz not null default now()
);
create table public.nora_artifacts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 120),
 kind text not null check(kind in ('social','email','seo','ads','visual','research','plan')),
 content text not null check(char_length(content) between 1 and 30000),
 status text not null default 'draft' check(status in ('draft','approved')),
 revision integer not null default 1, approved_revision integer, approved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status<>'approved' or (approved_revision=revision and approved_at is not null))
);
create table public.nora_tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 160),
 owner_role text not null default 'nora' check(owner_role in ('nora','maya','leon','iris','jack')),
 due_date date, status text not null default 'todo' check(status in ('todo','doing','done')),
 notes text not null default '' check(char_length(notes)<=5000), created_at timestamptz not null default now()
);
create index nora_assets_owner on public.nora_assets(user_id,created_at desc);
create index nora_artifacts_owner on public.nora_artifacts(user_id,updated_at desc);
create index nora_tasks_owner on public.nora_tasks(user_id,due_date);
alter table public.nora_brand_state enable row level security;
alter table public.nora_assets enable row level security;
alter table public.nora_artifacts enable row level security;
alter table public.nora_tasks enable row level security;
create policy nora_brand_read on public.nora_brand_state for select to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin');
create policy nora_assets_read on public.nora_assets for select to authenticated using(user_id=(select auth.uid()) and (select auth.jwt())->'app_metadata'->>'role'='admin');
create policy nora_artifacts_read on public.nora_artifacts for select to authenticated using(user_id=(select auth.uid()) and (select auth.jwt())->'app_metadata'->>'role'='admin');
create policy nora_tasks_read on public.nora_tasks for select to authenticated using(user_id=(select auth.uid()) and (select auth.jwt())->'app_metadata'->>'role'='admin');
revoke all on public.nora_brand_state,public.nora_assets,public.nora_artifacts,public.nora_tasks from anon,authenticated;
grant select on public.nora_brand_state,public.nora_assets,public.nora_artifacts,public.nora_tasks to authenticated;
grant all on public.nora_brand_state,public.nora_assets,public.nora_artifacts,public.nora_tasks to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('nora-media','nora-media',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy nora_media_read on storage.objects for select to authenticated
 using(bucket_id='nora-media' and (storage.foldername(name))[1]=(select auth.uid())::text and (select auth.jwt())->'app_metadata'->>'role'='admin');
create policy nora_media_upload on storage.objects for insert to authenticated
 with check(bucket_id='nora-media' and (storage.foldername(name))[1]=(select auth.uid())::text and (select auth.jwt())->'app_metadata'->>'role'='admin');
commit;
