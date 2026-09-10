window.freaSupabaseConfig = Object.freeze({
  url: "https://ixxatlyckbtihlnmlqnw.supabase.co",
  publishableKey: "sb_publishable_gJQS7kcCxMeyx37OAhjfqg_Zf-cEV3n"
});

if (document.body && document.body.classList.contains("admin-page")) {
  const script = document.createElement("script");
  script.src = "admin-payment-proof.js?v=20260910";
  script.defer = true;
  document.head.appendChild(script);
}

if (/\/brand-kinto\.html$/.test(location.pathname)) {
  const script = document.createElement("script");
  script.src = "tableware-coffee-page.js?v=20260911";
  script.defer = true;
  document.head.appendChild(script);
}
