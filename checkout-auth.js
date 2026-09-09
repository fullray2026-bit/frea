(function(){
  "use strict";
  const config=window.freaSupabaseConfig,sdk=window.supabase;
  const client=config&&sdk?sdk.createClient(config.url,config.publishableKey):null;
  const registrationUrl="register.html?view=register&return=checkout.html";
  async function requireMember(){
    if(!client)throw new Error("auth unavailable");
    const {data,error}=await client.auth.getUser();
    if(error&&error.name!=="AuthSessionMissingError"&&![401,403].includes(error.status))throw error;
    if(error||!data?.user||data.user.is_anonymous){
      window.location.replace(registrationUrl);
      return null;
    }
    return data.user;
  }
  window.freaCheckoutAuth={client,requireMember};
})();
