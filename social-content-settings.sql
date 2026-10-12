create table public.social_styles(
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 kind text not null check(kind in ('product','life')), is_default boolean not null default false,
 copy_rules text not null default '' check(length(copy_rules)<=6000),
 photo_rules text not null default '' check(length(photo_rules)<=6000),
 reference_path text, show_title boolean not null default true, show_logo boolean not null default true,
 layout text not null default 'framed' check(layout in ('framed','full')),
 include_link boolean not null default true, updated_at timestamptz not null default now()
);
create unique index social_styles_default on public.social_styles(kind) where is_default;
create table public.social_schedules(
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 kind text not null check(kind in ('product','life')), weekdays integer[] not null check(cardinality(weekdays)>0 and weekdays <@ array[0,1,2,3,4,5,6]),
 local_time time not null, enabled boolean not null default true, style_id uuid references public.social_styles(id),
 updated_at timestamptz not null default now()
);
create table public.social_materials(
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 120),
 location text not null default '', notes text not null check(length(notes) between 1 and 10000),
 photo_paths text[] not null default '{}', source_type text not null default 'real' check(source_type in ('real','illustration')),
 status text not null default 'ready' check(status in ('ready','used','hold')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.social_drafts alter column product_id drop not null;
alter table public.social_drafts add column kind text not null default 'product' check(kind in ('product','life'));
alter table public.social_drafts add column material_id uuid references public.social_materials(id);
alter table public.social_drafts add column style_snapshot jsonb not null default '{}';
alter table public.social_drafts add constraint social_draft_source check((kind='product' and product_id is not null) or (kind='life' and material_id is not null and product_id is null));
alter table public.social_styles enable row level security;
alter table public.social_schedules enable row level security;
alter table public.social_materials enable row level security;
create policy social_styles_admin on public.social_styles for all to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin') with check((select auth.jwt())->'app_metadata'->>'role'='admin');
create policy social_schedules_admin on public.social_schedules for all to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin') with check((select auth.jwt())->'app_metadata'->>'role'='admin');
create policy social_materials_admin on public.social_materials for all to authenticated using((select auth.jwt())->'app_metadata'->>'role'='admin') with check((select auth.jwt())->'app_metadata'->>'role'='admin');
revoke all on public.social_styles,public.social_schedules,public.social_materials from anon,authenticated;
grant select,insert,update on public.social_styles,public.social_schedules,public.social_materials to authenticated;
create or replace function public.social_record_revision() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.revision <> old.revision then raise exception '版本由系統管理'; end if;
 new.revision := old.revision+1;
 if (to_jsonb(new)-array['status','revision','updated_at']) is distinct from (to_jsonb(old)-array['status','revision','updated_at']) then new.status:='draft'; end if;
 new.updated_at:=now(); return new;
end $$;
insert into public.social_styles(name,kind,is_default,copy_rules,photo_rules,include_link) values
('fréa 日常選物','product',true,'繁體中文，像朋友分享，文字精緻、生活感，不強烈促銷。FB 約150字、IG 約100字，最多4個標籤。避免「必買」「神器」「最棒」。不得捏造使用心得或產品功效。','米白、燕麥、淺木色與暖棕，避免過黃。柔和自然窗光與真實陰影。依用途安排生活場景，少量亞麻與陶器，商品主角、適度留白、不放人臉。保留商品形狀、顏色、包裝和標誌，不自行改造。',true),
('福岡生活筆記','life',true,'繁體中文，溫柔自然的生活筆記。只根據提供的照片說明、地點及筆記整理，不捏造造訪、口味、天氣或營業資訊。FB 約150字、IG 約100字，最多4個標籤，不強加商品推銷。','以實拍照片為主，保留真實地點與物件。自然光、柔和色調、適度留白。示意情境圖須與實拍區分。',false);

