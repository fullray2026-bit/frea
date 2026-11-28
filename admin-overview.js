(function(root){
"use strict";
const closed=new Set(["shipped","completed","cancelled"]),normalRevenue=new Set(["paid","processing","shipped","completed"]),personalRevenue=new Set(["confirmed","purchased","shipped","shipped_unpaid","payment_received","completed"]);
function monthKey(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit"}).format(date).slice(0,7);}
const paidAfterShipment=r=>r.status==="payment_received"&&r.quote_details?.fulfillment_shipped===true;
function counts(rows){return {total:rows.length,pending:rows.filter(r=>!closed.has(r.status)&&!paidAfterShipment(r)).length,completed:rows.filter(r=>r.status==="completed").length,shipped:rows.filter(r=>r.status==="shipped"||paidAfterShipment(r)).length};}
function revenueTotals({orders=[],personalRequests=[]}){
 const revenue={JPY:0,TWD:0};let revenueSkipped=0;
 const add=(r,type)=>{if(!(type==="order"?normalRevenue:personalRevenue).has(r.status))return;const raw=type==="order"?r.total_amount:r.quote_amount,currency=String((type==="order"?r.currency:r.quote_currency)||(type==="personal"&&r.service_direction==="tw_to_jp"?"JPY":"TWD")).toUpperCase();
 if(raw==null||raw===""||!Number.isFinite(Number(raw))||Number(raw)<0||!Object.hasOwn(revenue,currency)){revenueSkipped++;return;}revenue[currency]+=Math.round(Number(raw)*100);};
 orders.forEach(r=>add(r,"order"));personalRequests.forEach(r=>add(r,"personal"));for(const c of Object.keys(revenue))revenue[c]/=100;
 return {revenue,revenueSkipped};
}
function calculate({orders=[],personalRequests=[],members=0},now=new Date()){
 const month=monthKey(now),valid=r=>r.status!=="cancelled",inMonth=r=>monthKey(r.created_at)===month;
 const regular=orders.filter(r=>valid(r)&&inMonth(r)),personal=personalRequests.filter(r=>valid(r)&&inMonth(r)),{revenue,revenueSkipped}=revenueTotals({orders:regular,personalRequests:personal});
 const old=r=>{const key=monthKey(r.created_at);return key&&key<month&&!closed.has(r.status)&&!paidAfterShipment(r);};
 return {month,members,normal:counts(regular),personal:counts(personal),revenue,revenueSkipped,quoteWaiting:personal.filter(r=>["new","reviewing"].includes(r.status)).length,confirmWaiting:personal.filter(r=>r.status==="quoted").length,collectionWaiting:personal.filter(r=>r.status==="shipped_unpaid").length,cancelled:[...orders,...personalRequests].filter(r=>inMonth(r)&&!valid(r)).length,backlog:{normal:orders.filter(old).length,personal:personalRequests.filter(old).length}};
}
function render(data,now=new Date()){
 const s=calculate(data,now),put=(id,text)=>{const el=document.getElementById(id);if(el)el.textContent=text;},n=v=>Number(v).toLocaleString("zh-TW",{maximumFractionDigits:2}),split=key=>"一般 "+s.normal[key]+" 筆／代購 "+s.personal[key]+" 筆";
 put("overviewMonth",s.month.replace("-"," 年 ")+" 月｜依台灣時間下單月份");
 put("statMembers",n(s.members));
 for(const [id,key] of [["statOrders","total"],["statPending","pending"],["statCompleted","completed"]]){put(id,n(s.normal[key]+s.personal[key]));put(id+"Detail",split(key));}
 put("statRevenueJPY","¥"+n(s.revenue.JPY));put("statRevenueTWD","NT$"+n(s.revenue.TWD));
 put("statOrdersNote","含詢問／報價；排除取消 "+s.cancelled+" 筆");
 put("statPendingNote","代購待報價 "+s.quoteWaiting+"／待確認 "+s.confirmWaiting+" 筆；出貨待匯款 "+s.collectionWaiting+" 筆");
 put("statCompletedNote","另已出貨未完成：一般 "+s.normal.shipped+"／代購 "+s.personal.shipped+" 筆");
 put("overviewBacklog","跨月未結：一般 "+s.backlog.normal+" 筆／代購 "+s.backlog.personal+" 筆（出貨待匯款仍列未結；不含其他已出貨、已完成、已取消）");
 put("overviewRevenueNote","本月業績依已成立訂單金額，並非實收：一般已收款／備貨中／已出貨／已完成；代購已確認／已購買／已出貨（含待匯款）／款項已收到／已完成。待付款、詢問、僅報價與取消不計金額；兩種幣別分開加總。"+(s.revenueSkipped?"另有 "+s.revenueSkipped+" 筆已成立訂單缺少有效金額或幣別，尚未計入。":""));
 return s;
}
const api={calculate,render,monthKey,revenueTotals};root.FreaOverview=api;if(typeof module!=="undefined")module.exports=api;
})(typeof window!=="undefined"?window:globalThis);