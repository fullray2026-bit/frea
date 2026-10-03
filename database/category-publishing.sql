CREATE OR REPLACE FUNCTION private.guard_master_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare linked public.products; adopted boolean; missing text[];
begin
 if new.status='archived' then return new; end if;
 select * into linked from public.products where product_master_id=new.id limit 1;
 if found then
   new.published_product_id:=linked.id;
   new.status:=case when linked.is_active then 'published' else 'ready_to_publish' end;
 else
   new.published_product_id:=null;
   if tg_op='UPDATE' and old.published_product_id is not null then
     if cardinality((select array_remove(array[
case when nullif(trim(pname),'') is null then '商品名稱' end,
case when nullif(trim(brand),'') is null then '品牌名稱' end,
case when nullif(trim(image),'') is null then '商品圖片' end,
case when not exists(select 1 from public.storefront_product_categories where master_id=readiness.mid and is_primary) then '主要分類' end,
case when not exists(select 1 from public.cost_scenarios where product_master_id=readiness.mid and is_selected and actual_sale_price_twd>0) then '已採用且售價大於 0 的成本方案' end],null)
from (values (new.id,new.name,new.brand_name,new.image_url)) as readiness(mid,pname,brand,image)))=0 then new.status:='ready_to_publish';
     elsif exists(select 1 from public.cost_scenarios where product_master_id=new.id) then new.status:='costed';
     else new.status:='confirmed'; end if;
   end if;
   if new.status='published' then
     if tg_op='UPDATE' and old.published_product_id is not null then new.status:='costed';
     else raise exception '請從商品管理確認上架，不能直接將主檔設為已上架。'; end if;
   end if;
   if new.status='ready_to_publish' then
     missing:=(select array_remove(array[
case when nullif(trim(pname),'') is null then '商品名稱' end,
case when nullif(trim(brand),'') is null then '品牌名稱' end,
case when nullif(trim(image),'') is null then '商品圖片' end,
case when not exists(select 1 from public.storefront_product_categories where master_id=readiness.mid and is_primary) then '主要分類' end,
case when not exists(select 1 from public.cost_scenarios where product_master_id=readiness.mid and is_selected and actual_sale_price_twd>0) then '已採用且售價大於 0 的成本方案' end],null)
from (values (new.id,new.name,new.brand_name,new.image_url)) as readiness(mid,pname,brand,image));
     if cardinality(missing)>0 then raise exception '上架前尚缺：%',array_to_string(missing,'、');end if;
   end if;
 end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION private.sync_workflow_master()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare mid uuid; mids uuid[]; desired text;
begin
 if tg_op='INSERT' then mids:=array[new.product_master_id];
 elsif tg_op='DELETE' then mids:=array[old.product_master_id];
 else mids:=array[old.product_master_id,new.product_master_id]; end if;
 for mid in select distinct x from unnest(mids) x where x is not null loop
   if exists(select 1 from public.products where product_master_id=mid and is_active) then desired:='published';
   elsif exists(select 1 from public.products where product_master_id=mid) then desired:='ready_to_publish';
   elsif exists(select 1 from public.cost_scenarios s join public.product_master m on m.id=s.product_master_id where s.product_master_id=mid and s.is_selected and s.actual_sale_price_twd>0 and cardinality((select array_remove(array[
case when nullif(trim(pname),'') is null then '商品名稱' end,
case when nullif(trim(brand),'') is null then '品牌名稱' end,
case when nullif(trim(image),'') is null then '商品圖片' end,
case when not exists(select 1 from public.storefront_product_categories where master_id=readiness.mid and is_primary) then '主要分類' end,
case when not exists(select 1 from public.cost_scenarios where product_master_id=readiness.mid and is_selected and actual_sale_price_twd>0) then '已採用且售價大於 0 的成本方案' end],null)
from (values (m.id,m.name,m.brand_name,m.image_url)) as readiness(mid,pname,brand,image)))=0) then desired:='ready_to_publish';
   elsif exists(select 1 from public.cost_scenarios where product_master_id=mid) then desired:='costed';
   else desired:='confirmed'; end if;
   update public.product_master set status=desired,updated_at=now() where id=mid and status<>'archived';
 end loop;
 return null;
end $function$
;
CREATE OR REPLACE FUNCTION private.guard_product_workflow()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare adopted uuid; master_status text; missing text[];
begin
 if new.product_master_id is null then return new; end if;
 select status into master_status from public.product_master where id=new.product_master_id for update;
 if new.cost_scenario_id is not null and not exists(select 1 from public.cost_scenarios where id=new.cost_scenario_id and product_master_id=new.product_master_id) then
   raise exception '成本方案與商品主檔不一致。';
 end if;
 if tg_op='INSERT' or (tg_op='UPDATE' and (not old.is_active and new.is_active or old.product_master_id is distinct from new.product_master_id)) then
   if master_status='archived' then raise exception '已封存主檔不可新增或上架商品。'; end if;
   select id into adopted from public.cost_scenarios where product_master_id=new.product_master_id and is_selected and actual_sale_price_twd>0;
   select (select array_remove(array[
case when nullif(trim(pname),'') is null then '商品名稱' end,
case when nullif(trim(brand),'') is null then '品牌名稱' end,
case when nullif(trim(image),'') is null then '商品圖片' end,
case when not exists(select 1 from public.storefront_product_categories where master_id=readiness.mid and is_primary) then '主要分類' end,
case when not exists(select 1 from public.cost_scenarios where product_master_id=readiness.mid and is_selected and actual_sale_price_twd>0) then '已採用且售價大於 0 的成本方案' end],null)
from (values (m.id,m.name,m.brand_name,coalesce(nullif(new.image_url,''),m.image_url))) as readiness(mid,pname,brand,image)) into missing from public.product_master m where m.id=new.product_master_id;
   if cardinality(missing)>0 then raise exception '上架前尚缺：%',array_to_string(missing,'、');end if;
   if adopted is null then raise exception '請先採用實際銷售價大於 0 的成本方案。'; end if;
   new.cost_scenario_id:=adopted;
 end if;
 if new.is_active and new.price<=0 then raise exception '上架商品售價必須大於 0。'; end if;
 return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.save_product_master_classification(p_id uuid, p_product jsonb, p_primary text, p_extra text[], p_activities text[], p_revision integer, p_updated_at timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v public.product_master; saved_id uuid; rev integer; requested_status text;
begin
 if coalesce(auth.jwt()->'app_metadata'->>'role','')<>'admin' then raise exception 'Admin access required' using errcode='42501'; end if;
 if jsonb_typeof(p_product) is distinct from 'object' or nullif(trim(p_product->>'name'),'') is null or nullif(trim(p_product->>'brand_name'),'') is null then raise exception '請填寫商品及品牌名稱';end if;
 if nullif(p_primary,'') is not null and not exists(select 1 from public.storefront_categories where id=p_primary) then raise exception '請選擇主要分類';end if;
 update public.storefront_revision set revision=revision+1,updated_at=now() where id and revision=p_revision returning revision into rev;
 if rev is null then raise exception '分類或活動已被其他視窗更新，請重新載入分類與活動後再儲存。' using errcode='40001';end if;
 select * into v from jsonb_populate_record(null::public.product_master,p_product);
 requested_status:=v.status;
 if requested_status='ready_to_publish' then v.status:='confirmed';end if;
 if p_id is null then
 insert into public.product_master(source_url,brand_name,storefront_brand_code,name,specification,usage_flavor,description,model,barcode,reference_price_jpy,weight_g,notes,status,image_url,storage_path) values(v.source_url,v.brand_name,v.storefront_brand_code,v.name,v.specification,v.usage_flavor,v.description,v.model,v.barcode,v.reference_price_jpy,v.weight_g,v.notes,v.status,v.image_url,v.storage_path) returning id into saved_id;
 else
 update public.product_master set source_url=v.source_url,brand_name=v.brand_name,storefront_brand_code=v.storefront_brand_code,name=v.name,specification=v.specification,usage_flavor=v.usage_flavor,description=v.description,model=v.model,barcode=v.barcode,reference_price_jpy=v.reference_price_jpy,weight_g=v.weight_g,notes=v.notes,status=v.status,image_url=v.image_url,storage_path=v.storage_path,updated_at=now() where id=p_id and updated_at=p_updated_at returning id into saved_id;
 if saved_id is null then raise exception '商品資料已變更，請關閉表單並重新開啟後再修改。' using errcode='40001';end if;
 end if;
 delete from public.storefront_product_categories where master_id=saved_id;
 if nullif(p_primary,'') is not null then insert into public.storefront_product_categories values(saved_id,p_primary,true);end if;
 insert into public.storefront_product_categories select saved_id,x,false from (select distinct unnest(coalesce(p_extra,'{}'::text[])) x) s where x is distinct from nullif(p_primary,'');
 delete from public.storefront_activity_products where master_id=saved_id and not(activity_id=any(coalesce(p_activities,'{}'::text[])));
 insert into public.storefront_activity_products(activity_id,master_id,sort_order) select x,saved_id,coalesce((select max(sort_order) from public.storefront_activity_products where activity_id=x),0)+1 from (select distinct unnest(coalesce(p_activities,'{}'::text[])) x) s where not exists(select 1 from public.storefront_activity_products where activity_id=x and master_id=saved_id);
 if requested_status='ready_to_publish' then update public.product_master set status='ready_to_publish' where id=saved_id;
 elsif requested_status not in ('pending_review','archived','published') and cardinality((select array_remove(array[
case when nullif(trim(pname),'') is null then '商品名稱' end,
case when nullif(trim(brand),'') is null then '品牌名稱' end,
case when nullif(trim(image),'') is null then '商品圖片' end,
case when not exists(select 1 from public.storefront_product_categories where master_id=readiness.mid and is_primary) then '主要分類' end,
case when not exists(select 1 from public.cost_scenarios where product_master_id=readiness.mid and is_selected and actual_sale_price_twd>0) then '已採用且售價大於 0 的成本方案' end],null)
from (values (saved_id,v.name,v.brand_name,v.image_url)) as readiness(mid,pname,brand,image)))=0 then
 update public.product_master set status='ready_to_publish' where id=saved_id;
 end if;
 return saved_id;
end $function$
;
alter table public.products drop constraint products_brand_code_check;
alter table public.products add constraint products_brand_code_check check (brand_code in ('kayanoya','kinto','kajidonya','akomeya','fukuoka-coffee','lifestyle-picks','catalog'));
