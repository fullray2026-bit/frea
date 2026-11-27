begin;
do $$
declare pid bigint; idx integer; snap jsonb; po uuid; sku uuid; line uuid:=gen_random_uuid(); b uuid; original_master_count bigint; denied boolean:=false;
begin
 select count(*) into original_master_count from product_master;
 select p.id,(x.n-1)::integer into pid,idx from personal_shopping_requests p cross join lateral jsonb_array_elements(p.items) with ordinality x(item,n)
 where p.status<>'cancelled' and not exists(select 1 from inventory_bindings z where z.source_type='personal' and z.source_key=p.id::text||':'||(x.n-1)::text) limit 1;
 if pid is null then raise exception 'No unmatched personal source for isolated test'; end if;
 snap:=inventory_source_snapshot('personal',pid::text||':'||idx::text);
 select id into po from purchase_orders where status<>'cancelled' order by id limit 1;
 insert into inventory_skus(personal_request_id,personal_item_index,personal_snapshot,product_name,specification,unit)
 values(pid,idx,snap,snap->>'name',coalesce(nullif(snap->>'specification',''),'標準規格'),'件') returning id into sku;
 insert into purchase_order_items(id,purchase_order_id,personal_request_id,personal_item_index,personal_snapshot,inventory_sku_id,quantity,unit_cost,received_quantity,received_on)
 values(line,po,pid,idx,snap,sku,2,100,2,current_date);
 insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,received_quantity,received_on)
 values('purchase',line::text,inventory_source_snapshot('purchase',line::text),sku,2,current_date) returning id into b;
 if (select received_quantity from purchase_order_items where id=line)<>2 then raise exception 'Arrival not initialized'; end if;
 update inventory_bindings set received_quantity=0,received_on=null where id=b;
 if (select received_quantity from purchase_order_items where id=line)<>0 then raise exception 'Arrival sync failed'; end if;
 begin update inventory_bindings set received_quantity=3,received_on=current_date where id=b;
 exception when others then denied:=true; end;
 if not denied then raise exception 'Over receipt not rejected'; end if;
 insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id) values('personal',pid::text||':'||idx::text,snap,sku);
 if (select source_snapshot from inventory_bindings where id=b) is distinct from inventory_source_snapshot('purchase',line::text) then raise exception 'Direct snapshot mismatch'; end if;
 if (select count(*) from product_master)<>original_master_count then raise exception 'Unexpected FR master created'; end if;
 denied:=false;
 begin perform save_purchase_receipt(gen_random_uuid(),gen_random_uuid(),null,null,current_date,'','[]'::jsonb,'JPY','arrived');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'Non-admin receipt RPC not rejected'; end if;
end $$;
rollback;
select 'direct item, arrival sync, over-receipt guard, no FR creation, admin authorization: passed; test rolled back' result;