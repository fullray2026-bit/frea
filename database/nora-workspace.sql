-- Additive module; apply once before deploying nora-chat.
begin;
create table public.nora_conversations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(title) between 1 and 80),
 created_at timestamptz not null default now()
);
create table public.nora_turns (
 id uuid primary key,
 conversation_id uuid not null references public.nora_conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 user_text text not null check(char_length(user_text) between 1 and 4000),
 assistant_text text check(char_length(assistant_text)<=20000),
 status text not null default 'pending' check(status in ('pending','completed','failed')),
 created_at timestamptz not null default now(),
 check(status <> 'completed' or assistant_text is not null)
);
create table public.nora_usage (
 user_id uuid primary key references auth.users(id) on delete cascade,
 usage_day date not null,
 requests integer not null,
 last_request_at timestamptz not null
);
create index nora_conversations_owner on public.nora_conversations(user_id,created_at desc);
create index nora_turns_history on public.nora_turns(conversation_id,created_at desc);
create index nora_turns_owner on public.nora_turns(user_id,created_at desc);
alter table public.nora_conversations enable row level security;
alter table public.nora_turns enable row level security;
alter table public.nora_usage enable row level security;
create policy nora_conversations_read on public.nora_conversations for select to authenticated
 using(user_id=(select auth.uid()) and (select auth.jwt())->'app_metadata'->>'role'='admin');
create policy nora_turns_read on public.nora_turns for select to authenticated
 using(user_id=(select auth.uid()) and (select auth.jwt())->'app_metadata'->>'role'='admin');
revoke all on public.nora_conversations,public.nora_turns,public.nora_usage from anon,authenticated;
grant select on public.nora_conversations,public.nora_turns to authenticated;
grant all on public.nora_conversations,public.nora_turns,public.nora_usage to service_role;

-- Only the authenticated Edge Function may reserve a turn; the browser cannot
-- forge assistant messages or reset quotas. Serializes concurrent tabs per user.
create function public.nora_begin_turn(p_user_id uuid,p_conversation_id uuid,p_request_id uuid,p_message text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c uuid; existing public.nora_turns; u public.nora_usage; d date := (now() at time zone 'Asia/Tokyo')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into existing from public.nora_turns where id=p_request_id;
 if found then
  if existing.user_id<>p_user_id or existing.user_text<>p_message or
    (p_conversation_id is not null and existing.conversation_id<>p_conversation_id) then
   raise exception 'invalid_request';
  end if;
  return to_jsonb(existing);
 end if;
 if char_length(btrim(p_message))=0 or char_length(p_message)>4000 then raise exception 'invalid_request'; end if;
 select * into u from public.nora_usage where user_id=p_user_id;
 if found and u.last_request_at>now()-interval '5 seconds' then raise exception 'rate_limit'; end if;
 if u.usage_day=d and u.requests>=100 then raise exception 'daily_limit'; end if;
 if exists(select 1 from public.nora_turns where user_id=p_user_id and status='pending' and created_at>now()-interval '2 minutes') then
  raise exception 'pending_request';
 end if;
 update public.nora_turns set status='failed' where user_id=p_user_id and status='pending' and created_at<=now()-interval '2 minutes';
 if p_conversation_id is null then
  insert into public.nora_conversations(user_id,title) values(p_user_id,left(p_message,36)) returning id into c;
 else
  select id into c from public.nora_conversations where id=p_conversation_id and user_id=p_user_id;
  if c is null then raise exception 'not_found'; end if;
 end if;
 if (select count(*) from public.nora_turns where conversation_id=c)>=100 then raise exception 'conversation_limit'; end if;
 insert into public.nora_usage(user_id,usage_day,requests,last_request_at) values(p_user_id,d,1,now())
 on conflict(user_id) do update set usage_day=d,requests=case when nora_usage.usage_day=d then nora_usage.requests+1 else 1 end,last_request_at=now();
 insert into public.nora_turns(id,conversation_id,user_id,user_text) values(p_request_id,c,p_user_id,p_message) returning * into existing;
 return to_jsonb(existing);
end $$;
revoke execute on function public.nora_begin_turn(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.nora_begin_turn(uuid,uuid,uuid,text) to service_role;
commit;
