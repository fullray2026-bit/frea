-- Authenticated RPC entry points still require a real signed-in admin identity.
do $$ declare f regprocedure; definition text; begin
 foreach f in array array['social_private.social_generate_now(uuid)'::regprocedure,'social_private.social_send_draft(uuid)'::regprocedure,'social_private.social_pipeline_status()'::regprocedure,'social_private.social_toggle_pipeline(boolean)'::regprocedure] loop
 definition:=pg_get_functiondef(f);
 definition:=replace(definition,'if coalesce((select auth.jwt())','if (select auth.uid()) is null or coalesce((select auth.jwt())');
 execute definition;
 end loop;
end $$;
