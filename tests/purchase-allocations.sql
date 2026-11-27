begin;
do $$
declare a purchase_order_allocations;i purchase_order_items;pb inventory_bindings;temp_id uuid:=gen_random_uuid();denied boolean;
begin
 select x.* into a from purchase_order_allocations x join purchase_order_items p on p.id=x.purchase_item_id
 where x.sku_id is not null and x.quantity=x.order_quantity and x.quantity=trunc(x.quantity)
 and abs((select sum(quantity) from purchase_order_allocations z where z.purchase_item_id=p.id)-p.quantity)<0.00001 limit 1;
 if a.id is null then raise exception 'No complete allocation fixture';end if;
 select * into i from purchase_order_items where id=a.purchase_item_id;
 select * into pb from inventory_bindings where source_type='purchase' and source_key=i.id::text;
 denied:=false;
 begin
  insert into purchase_order_allocations(purchase_item_id,order_item_id,personal_request_id,personal_item_index,quantity,order_quantity,purchase_snapshot,order_snapshot)
  values(a.purchase_item_id,a.order_item_id,a.personal_request_id,a.personal_item_index,a.quantity,a.order_quantity,a.purchase_snapshot,a.order_snapshot);
 exception when others then if position('超過進貨數量' in sqlerrm)>0 then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Duplicate purchase allocation accepted';end if;
 insert into purchase_order_items(id,purchase_order_id,product_master_id,quantity,unit_cost,inventory_sku_id)
 values(temp_id,i.purchase_order_id,i.product_master_id,i.quantity,i.unit_cost,pb.sku_id);
 insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,quantity_factor) values('purchase',temp_id::text,inventory_source_snapshot('purchase',temp_id::text),pb.sku_id,pb.quantity_factor);
 denied:=false;
 begin
  insert into purchase_order_allocations(purchase_item_id,order_item_id,personal_request_id,personal_item_index,quantity,order_quantity,purchase_snapshot,order_snapshot)
  values(temp_id,a.order_item_id,a.personal_request_id,a.personal_item_index,a.quantity,a.order_quantity,inventory_source_snapshot('purchase',temp_id::text),a.order_snapshot);
 exception when others then if position('超過需求' in sqlerrm)>0 then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Duplicate destination allocation accepted';end if;
 denied:=false;
 begin update purchase_order_allocations set order_snapshot='{}'::jsonb where id=a.id;
 exception when others then if position('重新載入核對' in sqlerrm)>0 then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Stale snapshot accepted';end if;
 denied:=false;
 begin update purchase_order_items set quantity=0 where id=i.id;
 exception when others then if position('先調整對應數量' in sqlerrm)>0 then denied:=true;else raise;end if;end;
 if not denied then raise exception 'Allocated receipt quantity reduction accepted';end if;
 denied:=false;
 begin perform save_purchase_allocation(jsonb_build_object('id',gen_random_uuid()),null);exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous admin operation accepted';end if;
end $$;
rollback;
select 'allocation limits, destination limits, stale snapshot, receipt quantity guard and authorization passed; test rolled back' result;