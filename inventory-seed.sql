
-- Import only explicit, unambiguous receipt/product specifications. Arrival is deliberately unconfirmed.
insert into inventory_skus(product_master_id,specification,unit)
select id,case product_code when 'FR-000060' then '150g×3／博多うまか・Mild・豆香洞（2026/09/28批次）' when 'FR-000140' then 'G028六款書籤／單個' else specification end,
case when product_code='FR-000140' then '個' else '件' end
from product_master where product_code in (
'FR-000002','FR-000008','FR-000011','FR-000014','FR-000016','FR-000022','FR-000023','FR-000027','FR-000029','FR-000031','FR-000033','FR-000050','FR-000052','FR-000053','FR-000054','FR-000055','FR-000060','FR-000076','FR-000079','FR-000094','FR-000095','FR-000098','FR-000099','FR-000100','FR-000101','FR-000102','FR-000103','FR-000107','FR-000128','FR-000130','FR-000131','FR-000132','FR-000134','FR-000135','FR-000136','FR-000138','FR-000140','FR-000141','FR-000148','FR-000149','FR-000150','FR-000151','FR-000152','FR-000153','FR-000154','FR-000155','FR-000156','FR-000157','FR-000158','FR-000159','FR-000160','FR-000161','FR-000164','FR-000165','FR-000166','FR-000167','FR-000168','FR-000169'
) and length(trim(specification))>0 on conflict do nothing;
insert into inventory_skus(product_master_id,specification,unit)
select m.id,v.spec,'件' from (values
('FR-000020','深灰綠／500ml'),('FR-000020','沙米色／500ml'),
('FR-000044','琥珀／500ml'),('FR-000044','煙燻灰／500ml'),
('FR-000056','銅色／350ml'),('FR-000056','銀色／350ml'),('FR-000056','黑色／350ml'),
('FR-000057','橘色／2入'),('FR-000057','奶油色／2入'),
('FR-000058','銀色／雙入附底座'),('FR-000058','黑色／雙入附底座'),
('FR-000059','沙米色／350ml'),('FR-000059','不鏽鋼／350ml'),('FR-000059','卡其色／350ml'),('FR-000059','郊狼棕／350ml'),('FR-000059','深灰綠／350ml'),
('FR-000073','薰衣草／100g'),('FR-000073','迷迭香／100g'),
('FR-000093','晶金かすり／三件組'),('FR-000093','晶銀かすり／三件組'),
('FR-000097','黑／0.8L'),('FR-000097','灰／0.8L')
) v(code,spec) join product_master m on m.product_code=v.code on conflict do nothing;
-- Single-spec purchase master records
insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,quantity_factor,note)
select 'purchase',i.id::text,inventory_source_snapshot('purchase',i.id::text),s.id,
case when m.product_code='FR-000140' then 6 else 1 end,
'歷史資料初始化：依已核對商品主檔及收據規格；尚未確認實際到貨。'
from purchase_order_items i join product_master m on m.id=i.product_master_id
join inventory_skus s on s.product_master_id=m.id
where (select count(*) from inventory_skus x where x.product_master_id=m.id)=1
on conflict do nothing;
-- Exclude known expenses and tasting samples.
insert into inventory_bindings(source_type,source_key,source_snapshot,purpose,note)
select 'purchase',i.id::text,inventory_source_snapshot('purchase',i.id::text),
case when m.product_code in ('FR-000133','FR-000137') then 'sample' else 'expense' end,
'依既有收據備註：試喝／物流／包材，不計銷售庫存。'
from purchase_order_items i join product_master m on m.id=i.product_master_id
where m.product_code in ('FR-000129','FR-000133','FR-000137','FR-000139','FR-000147') on conflict do nothing;
insert into inventory_bindings(source_type,source_key,source_snapshot,purpose,note)
select 'order',id::text,inventory_source_snapshot('order',id::text),'expense','訂單物流作業費，不計商品需求'
from order_items where product_name='台灣國內運費及作業費' on conflict do nothing;
-- Purchase variants: equal-quantity repeated rows are interchangeable; total per receipt color is explicit.
with mapping(po,code,qty,spec,n) as (values
('PO-000004','FR-000057',10,'橘色／2入',1),('PO-000004','FR-000057',10,'奶油色／2入',2),
('PO-000004','FR-000056',4,'銅色／350ml',1),('PO-000004','FR-000056',2,'銀色／350ml',1),
('PO-000004','FR-000044',2,'琥珀／500ml',1),('PO-000004','FR-000044',2,'煙燻灰／500ml',2),
('PO-000004','FR-000020',1,'深灰綠／500ml',1),('PO-000004','FR-000020',1,'沙米色／500ml',2),
('PO-000004','FR-000059',2,'沙米色／350ml',1),('PO-000004','FR-000059',2,'不鏽鋼／350ml',2),('PO-000004','FR-000059',2,'卡其色／350ml',3),('PO-000004','FR-000059',2,'郊狼棕／350ml',4),
('PO-000004','FR-000058',1,'銀色／雙入附底座',1),('PO-000004','FR-000058',1,'黑色／雙入附底座',2),
('PO-000013','FR-000056',3,'黑色／350ml',1),('PO-000013','FR-000056',6,'銅色／350ml',1),('PO-000013','FR-000056',3,'銀色／350ml',2),
('PO-000013','FR-000093',2,'晶金かすり／三件組',1),('PO-000013','FR-000093',2,'晶銀かすり／三件組',2),
('PO-000013','FR-000073',6,'迷迭香／100g',1),('PO-000013','FR-000073',6,'薰衣草／100g',2),
('PO-000013','FR-000097',1,'黑／0.8L',1),('PO-000013','FR-000097',1,'灰／0.8L',2),
('PO-000013','FR-000058',3,'銀色／雙入附底座',1)
), lines as (
select i.*,p.order_number,m.product_code,row_number() over(partition by p.id,m.id,i.quantity order by i.created_at,i.id) n
from purchase_order_items i join purchase_orders p on p.id=i.purchase_order_id join product_master m on m.id=i.product_master_id
)
insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,note)
select 'purchase',i.id::text,inventory_source_snapshot('purchase',i.id::text),s.id,'依原收據／採購明細顏色總量對應。同商品同數量重複行依固定順序分配；未確認到貨。'
from lines i join mapping v on v.po=i.order_number and v.code=i.product_code and v.qty=i.quantity and v.n=i.n
join inventory_skus s on s.product_master_id=i.product_master_id and s.specification=v.spec on conflict do nothing;
-- Normal orders: match names only for already reviewed single-spec masters, with explicit legacy aliases.
with matched as (
select i.*,m.id mid from order_items i join product_master m on
m.name=case i.product_name
when '茅乃舍經典高湯（30袋入）' then '茅乃舍高湯（30袋入）'
when 'KINTO 防滑托盤 36×28cm' then 'KINTO 柳木防滑托盤 36×28cm'
when '柳宗理 雙耳深型鍋 22cm（霧面）' then '柳宗理 IH 雙耳深型鍋 22cm（霧面）'
else i.product_name end
)
insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,note)
select 'order',i.id::text,inventory_source_snapshot('order',i.id::text),s.id,'依既有已核對商品名稱／單一規格對應'
from matched i join inventory_skus s on s.product_master_id=i.mid
where (select count(*) from inventory_skus x where x.product_master_id=i.mid)=1 on conflict do nothing;
-- Explicit color token after 顏色：, not the preceding list of available colors.
insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,note)
select 'order',i.id::text,inventory_source_snapshot('order',i.id::text),s.id,'依訂單「顏色：」選項對應，容量沿用商品主檔'
from order_items i join product_master m on m.name=i.product_name
join inventory_skus s on s.product_master_id=m.id
where i.specification like '%顏色：%' and split_part(s.specification,'／',1)=trim(split_part(i.specification,'顏色：',2))
on conflict do nothing;
-- Personal orders with exact reviewed single-spec names.
insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,note)
select 'personal',p.id::text||':'||(x.n-1)::text,inventory_source_snapshot('personal',p.id::text||':'||(x.n-1)::text),s.id,
'依既有已核對代購商品名稱／單一規格對應'
from personal_shopping_requests p cross join lateral jsonb_array_elements(p.items) with ordinality x(item,n)
join product_master m on m.name=x.item->>'name'
join inventory_skus s on s.product_master_id=m.id
where (select count(*) from inventory_skus z where z.product_master_id=m.id)=1 on conflict do nothing;

with mapping(number,n,code) as (values ('PS20260921-7349F87475E',0,'FR-000134'),('PS20260921-7349F87475E',1,'FR-000135'),('PS20260921-7349F87475E',2,'FR-000136'),('PS20260921-7349F87475E',3,'FR-000128'),('PS20261010-B2AFAEBED73',0,'FR-000107'),('PS20261103-1CAA01A54FCE',0,'FR-000164'),('PS20261103-1CAA01A54FCE',1,'FR-000165'),('PS20261103-1CAA01A54FCE',2,'FR-000166'),('PS20261103-1CAA01A54FCE',3,'FR-000141'),('PS20261103-1CAA01A54FCE',4,'FR-000167'),('PS20261104-2ED264A3E28A',0,'FR-000157'),('PS20261104-2ED264A3E28A',1,'FR-000158'),('PS20261104-2ED264A3E28A',2,'FR-000153'),('PS20261104-2ED264A3E28A',3,'FR-000154'),('PS20261104-2ED264A3E28A',4,'FR-000148'),('PS20261104-2ED264A3E28A',5,'FR-000149'),('PS20261104-2ED264A3E28A',6,'FR-000156'),('PS20261104-2ED264A3E28A',7,'FR-000155'),('PS20261104-2ED264A3E28A',8,'FR-000152'),('PS20261104-2ED264A3E28A',9,'FR-000151'),('PS20261104-2ED264A3E28A',10,'FR-000150'),('PS20261106-03F172682C5',0,'FR-000128'),('PS20261106-03F172682C5',1,'FR-000130'),('PS20261106-03F172682C5',2,'FR-000131'),('PS20261106-03F172682C5',3,'FR-000132'),('PS20261108-1035C086575',0,'FR-000159'),('PS20261108-1035C086575',1,'FR-000161'),('PS20261108-1035C086575',2,'FR-000168'),('PS20261108-CE48D173393',0,'FR-000140'),('PS20261108-CE48D173393',1,'FR-000138'),('PS20261112-4D6E92F7207A',0,'FR-000160'))
insert into inventory_bindings(source_type,source_key,source_snapshot,sku_id,note)
select 'personal',p.id::text||':'||v.n::text,inventory_source_snapshot('personal',p.id::text||':'||v.n::text),s.id,'依先前收據與指定訂單逐項核對；不同容量、顏色、尺寸分開。'
from mapping v join personal_shopping_requests p on p.request_number=v.number
join product_master m on m.product_code=v.code join inventory_skus s on s.product_master_id=m.id
where (select count(*) from inventory_skus x where x.product_master_id=m.id)=1
and p.items->v.n is not null
on conflict do nothing;
with changed as (
 update purchase_orders set status='ordered'
 where status='draft' and order_number in ('PO-000003-1','PO-000001','PO-000002','PO-000003','PO-000004','PO-000005','PO-000006','PO-000007','PO-000008','PO-000009','PO-000010','PO-000011','PO-000012','PO-000013','PO-000014','PO-000015','PO-000016','PO-000017','PO-000018','PO-000019','PO-000020','PO-000021','PO-000022','PO-000023','PO-000024','PO-000025','PO-000026','PO-000027','PO-000028','PO-000029','PO-000030','PO-000031')
 returning id,order_number,status
)
insert into inventory_history(entity,record_id,before_value,after_value)
select 'purchase_orders',id::text,jsonb_build_object('status','draft'),jsonb_build_object('order_number',order_number,'status',status,'reason','既有收據改為正式已購買紀錄；實際到貨另按明細確認') from changed;
update inventory_bindings b set received_quantity=i.quantity,received_on=p.ordered_at,
note=b.note||'【實體購買收據】依門市當日交付登記到貨；可依實際盤點更正。'
from purchase_order_items i join purchase_orders p on p.id=i.purchase_order_id
where b.source_type='purchase' and b.source_key=i.id::text and b.purpose='sale' and b.received_quantity=0
and p.order_number in ('PO-000003','PO-000014','PO-000016','PO-000018','PO-000019','PO-000025','PO-000026','PO-000027','PO-000028','PO-000029');