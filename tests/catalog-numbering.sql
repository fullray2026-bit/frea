begin;
do $$ declare n bigint; c text; personal_code text;
begin
 select next_value into n from identifier_counters where counter_key='product_FR';
 if n<>107 then raise exception 'Unexpected regular counter %',n; end if;
 insert into product_master(name,catalog_type,status) values('庫存分類測試－單次代購','personal','pending_review') returning product_code into personal_code;
 if personal_code is not null then raise exception 'Personal history received FR code'; end if;
 if (select next_value from identifier_counters where counter_key='product_FR')<>n then raise exception 'Personal history advanced counter'; end if;
 insert into product_master(name,catalog_type,status) values('庫存分類測試－常態商品','regular','pending_review') returning product_code into c;
 if c<>'FR-000107' then raise exception 'Wrong regular code %',c; end if;
end $$;
rollback;
select 'personal rows use no FR code; next regular is FR-000107; isolated test rolled back' result;