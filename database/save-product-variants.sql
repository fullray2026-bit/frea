CREATE OR REPLACE FUNCTION public.save_product_variants(p_product_id uuid,p_variants jsonb) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF coalesce(auth.jwt()->'app_metadata'->>'role','') <> 'admin' THEN RAISE EXCEPTION '僅管理員可儲存規格'; END IF;
 IF jsonb_typeof(p_variants) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION '規格格式錯誤'; END IF;
 PERFORM id FROM public.products WHERE id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '商品不存在'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p_variants) AS v(option_value text,sku text) WHERE coalesce(trim(option_value),'')='' OR coalesce(trim(sku),'')='') THEN RAISE EXCEPTION '請填寫款式名稱與編號'; END IF;
 DELETE FROM public.product_variants WHERE product_id=p_product_id;
 INSERT INTO public.product_variants(id,product_id,option_name,option_value,sku,image_url,stock_quantity,sort_order,is_active)
 SELECT id,p_product_id,'規格/款式',trim(option_value),trim(sku),coalesce(image_url,''),coalesce(stock_quantity,0),coalesce(sort_order,0),coalesce(is_active,true)
 FROM jsonb_to_recordset(p_variants) AS v(id uuid,option_value text,sku text,image_url text,stock_quantity integer,sort_order integer,is_active boolean);
END; $$;
REVOKE ALL ON FUNCTION public.save_product_variants(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_variants(uuid,jsonb) TO authenticated;

