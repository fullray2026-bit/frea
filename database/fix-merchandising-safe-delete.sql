-- Applied to production 2026-10-05.
-- Preserve function privileges, admin authorization and optimistic revision guard.
-- Verified under authenticated admin with safeupdate enabled, then rolled back:
-- category reordering, category/activity mapping preservation, stale revision rejection.
DO $repair$
DECLARE definition text;
BEGIN
 definition := pg_get_functiondef('public.save_storefront_merchandising(jsonb,integer)'::regprocedure);
 definition := replace(definition,
  'delete from public.storefront_product_categories;',
  'delete from public.storefront_product_categories where category_id in (select value->>''id'' from jsonb_array_elements(p_config->''categories''));');
 definition := replace(definition,
  'delete from public.storefront_activity_products;',
  'delete from public.storefront_activity_products where activity_id in (select value->>''id'' from jsonb_array_elements(p_config->''activities''));');
 EXECUTE definition;
END $repair$;
