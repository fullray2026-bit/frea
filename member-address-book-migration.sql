alter table public.member_addresses add column if not exists label text not null default '常用地址';
create or replace function public.save_member_address(p_id bigint,p_label text,p_name text,p_phone text,p_postal text,p_address text,p_default boolean)
returns bigint language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid(); result_id bigint; make_default boolean;
begin
 if u is null then raise exception '請先登入'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,42));
 if length(trim(coalesce(p_name,'')))=0 or length(trim(coalesce(p_phone,'')))=0 or length(trim(coalesce(p_postal,'')))=0 or length(trim(coalesce(p_address,'')))=0 then raise exception '請填寫完整收件資料'; end if;
 if length(coalesce(p_label,''))>30 then raise exception '地址名稱限30字'; end if;
 if p_id is not null and not exists(select 1 from public.member_addresses where id=p_id and user_id=u) then raise exception '找不到此收件資料，請重新整理'; end if;
 if p_id is null and (select count(*) from public.member_addresses where user_id=u)>=3 then raise exception '已儲存3組地址，請選擇要更新的地址'; end if;
 make_default:=coalesce(p_default,false) or not exists(select 1 from public.member_addresses where user_id=u and is_default and (p_id is null or id<>p_id));
 if make_default then update public.member_addresses set is_default=false where user_id=u and is_default; end if;
 if p_id is null then
 insert into public.member_addresses(user_id,label,recipient_name,recipient_phone,postal_code,address,is_default) values(u,coalesce(nullif(trim(p_label),''),'常用地址'),trim(p_name),trim(p_phone),trim(p_postal),trim(p_address),make_default) returning id into result_id;
 else
 update public.member_addresses set label=coalesce(nullif(trim(p_label),''),'常用地址'),recipient_name=trim(p_name),recipient_phone=trim(p_phone),postal_code=trim(p_postal),address=trim(p_address),is_default=make_default,updated_at=now() where id=p_id and user_id=u returning id into result_id;
 end if;
 return result_id;
end $$;
create or replace function public.delete_member_address(p_id bigint)
returns void language plpgsql security invoker set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception '請先登入'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,42));
 delete from public.member_addresses where id=p_id and user_id=u;
 if not found then raise exception '找不到此收件資料'; end if;
 if not exists(select 1 from public.member_addresses where user_id=u and is_default) then update public.member_addresses set is_default=true where id=(select id from public.member_addresses where user_id=u order by id limit 1); end if;
end $$;
revoke all on function public.save_member_address(bigint,text,text,text,text,text,boolean) from public,anon;
revoke all on function public.delete_member_address(bigint) from public,anon;
grant execute on function public.save_member_address(bigint,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.delete_member_address(bigint) to authenticated;

create or replace function public.enforce_member_address_capacity() returns trigger language plpgsql security invoker set search_path='' as $$ begin perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,42)); if (select count(*) from public.member_addresses where user_id=new.user_id and id<>new.id)>=3 then raise exception '最多可儲存3組收件資料'; end if; return new; end $$;
create trigger member_address_capacity before insert or update of user_id on public.member_addresses for each row execute function public.enforce_member_address_capacity();
revoke all on function public.enforce_member_address_capacity() from public,anon;
