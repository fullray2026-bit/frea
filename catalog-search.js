/* Public catalog search: category intent first, then weighted text matches. */
(function(){
  const normalize=value=>String(value??'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
  const synonyms=[['零食','點心','零嘴'],['調味料','調味品'],['馬克杯','馬克盃'],['襪子','短襪'],['護手霜','護手乳']];
  function search(products,categories,links,query){
    const tokens=normalize(query).split(' ').filter(Boolean);
    if(!tokens.length)return [];
    return products.filter(p=>p.is_active!==false).map((product,index)=>{
      const assigned=links.filter(l=>l.master_id===product.product_master_id).map(l=>l.category_id);
      const categoryText=normalize(categories.filter(c=>assigned.includes(c.id)).map(c=>c.name).join(' '));
      const name=normalize(product.name);
      const detail=normalize([product.description,product.specification,product.usage_flavor].join(' '));
      const variants=normalize((product.product_variants||[]).map(v=>v.option_value).join(' '));
      let score=0;
      for(const token of tokens){
        const terms=synonyms.find(group=>group.includes(token))||[token];
        // A container mentioning seasoning is not itself a seasoning product.
        if(terms.includes('調味料')){
          if(!assigned.includes('food')||!/(鹽|塩|胡椒|味噌|鹽麴|塩麹|香料|山葵|辣椒|唐辛子|醬油|醋|高湯|出汁)/.test(name)||/(一杯即享|烏龍麵|豆腐)/.test(name))return null;
          score+=80;continue;
        }
        if(terms.includes('零食')){
          if(!assigned.includes('snack'))return null;
          score+=80;continue;
        }
        const rank=Math.max(...terms.map(t=>name===t?120:name.includes(t)?100:categoryText.includes(t)?80:variants.includes(t)?60:detail.includes(t)?20:0));
        if(!rank)return null;
        score+=rank;
      }
      return {product,index,score};
    }).filter(Boolean).sort((a,b)=>b.score-a.score||a.index-b.index).map(x=>x.product);
  }
  window.FreaCatalogSearch={search};
})();
