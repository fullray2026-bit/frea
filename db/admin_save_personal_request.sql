create or replace function public.admin_save_personal_request(p_id bigint,p_expected_updated_at timestamptz,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare existing public.personal_shopping_requests%rowtype; saved public.personal_shopping_requests%rowtype;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'Admin access required' using errcode='42501';end if;
 if p_expected_updated_at is null then raise exception 'Missing expected version' using errcode='22023';end if;
 if jsonb_typeof(p_changes) is distinct from 'object' or jsonb_typeof(p_changes->'items') is distinct from 'array' or jsonb_typeof(p_changes->'quote_details') is distinct from 'object' then raise exception 'Invalid personal request data' using errcode='22023';end if;
 if (p_changes->>'status') is null or (p_changes->>'status') not in ('new','reviewing','quoted','confirmed','purchased','shipped','completed','cancelled') then raise exception 'Invalid status' using errcode='22023';end if;
 if (p_changes->>'quote_amount') is null or (p_changes->>'quote_amount')::numeric<0 or (p_changes->>'quote_amount')::numeric<>trunc((p_changes->>'quote_amount')::numeric) then raise exception 'Invalid quote amount' using errcode='22023';end if;
 select * into existing from public.personal_shopping_requests where id=p_id for update;
 if not found then raise exception 'Personal request not found' using errcode='P0002';end if;
 if existing.updated_at<>p_expected_updated_at then raise exception '此代購單已被其他視窗更新，請保留目前輸入並重新核對。' using errcode='40001';end if;
 update public.personal_shopping_requests set status=p_changes->>'status',items=p_changes->'items',quote_amount=(p_changes->>'quote_amount')::integer,quote_details=p_changes->'quote_details',admin_note=coalesce(p_changes->>'admin_note',''),updated_at=greatest(clock_timestamp(),existing.updated_at+interval '1 microsecond') where id=p_id returning * into saved;
 return to_jsonb(saved);
end $$;
revoke all on function public.admin_save_personal_request(bigint,timestamptz,jsonb) from public,anon;
grant execute on function public.admin_save_personal_request(bigint,timestamptz,jsonb) to authenticated;
notify pgrst,'reload schema';
create or replace function private.set_personal_request_updated_at()
returns trigger language plpgsql security invoker set search_path='' as $$
begin new.updated_at=greatest(clock_timestamp(),old.updated_at+interval '1 microsecond');return new;end $$;
revoke all on function private.set_personal_request_updated_at() from public,anon,authenticated;
create trigger personal_request_version before update on public.personal_shopping_requests for each row execute function private.set_personal_request_updated_at();
