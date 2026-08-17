(async function () {
  "use strict";

  const config = window.freaSupabaseConfig;
  const sdk = window.supabase;
  const loginUrl = "register.html?view=login&return=personal-shopping.html";

  if (!config || !sdk) {
    window.location.replace(loginUrl);
    return;
  }

  const client = sdk.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const { data, error } = await client.auth.getUser();

  if (error || !data.user) {
    window.location.replace(loginUrl);
  }
})();
