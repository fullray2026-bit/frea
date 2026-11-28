(function(root){
"use strict";
const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function init(){
 const form=$("costForm");form.hidden=true;form.classList.add("compact-cost-form");
 const group=(title,ids,closed=false)=>{const el=document.createElement(closed?"details":"fieldset");el.className="cost-field-group";const heading=document.createElement(closed?"summary":"legend");heading.textContent=title;el.appendChild(heading);const grid=document.createElement("div");grid.className="cost-fields";el.appendChild(grid);ids.forEach(id=>grid.appendChild($(id).closest("label")));return {el,grid};};
 const basics=group("商品與進貨",["costProduct","costMsrp","costWholesaleRate","costPurchase","costQuantity","costRate"]);
 const shipping=group("運送與進口",["costJapanShipping","costWeight","costPackingWeight","costFreightRate","costCustoms","costDutyRate"],true);
 const box=group("材積計費設定（選填）",["costBoxCount","costBoxLength","costBoxWidth","costBoxHeight"],true);shipping.el.appendChild(box.el);
 const sale=group("售價與費用",["costSalePrice","costPlatform","costGroupAmount","costLocal","costMargin"]);
 form.querySelector(".cost-title-row").after(basics.el,shipping.el,sale.el);
 form.querySelectorAll(":scope>.cost-grid").forEach(e=>e.remove());
 const metrics=form.querySelector(".cost-metrics"),summary=document.createElement("div");summary.className="cost-summary";
 const metric=(label,id)=>{const item=document.createElement("div"),span=document.createElement("span");span.textContent=label;item.appendChild(span);let value=$(id);if(!value){value=document.createElement("strong");value.id=id;}item.appendChild(value);summary.appendChild(item);};
 metric("完整成本／件","costFull");metric("售價（TWD）","costSummarySale");metric("金流費＋抽成／件","costSummaryFees");metric("毛利／件","costProfit");metric("實際毛利率","costActualMargin");
 const detail=document.createElement("details");detail.className="cost-result-detail";detail.innerHTML="<summary>成本明細與計費重量</summary>";const dl=document.createElement("dl");dl.className="cost-breakdown";
 metrics.querySelectorAll("article").forEach(a=>{const value=a.querySelector("strong"),label=a.querySelector("span");if(!value||!label)return;const pair=document.createElement("div"),dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label.textContent;dd.appendChild(value);pair.append(dt,dd);dl.appendChild(pair);});detail.appendChild(dl);detail.appendChild($("costFreightHint"));
 metrics.replaceChildren(summary,detail);form.appendChild(form.querySelector(".cost-form-actions"));
 form.addEventListener("invalid",e=>{let node=e.target.closest("details");while(node&&form.contains(node)){node.open=true;node=node.parentElement.closest("details");}},true);
 const actions=document.querySelector(".cost-saved-actions"),newButton=document.createElement("button");newButton.id="costNew";newButton.type="button";newButton.className="admin-primary";newButton.textContent="＋ 新增試算";actions.prepend(newButton);
 $("exportScenariosExcel").textContent="方案 CSV";
 const filter=document.createElement("select");filter.id="costProductFilter";filter.setAttribute("aria-label","商品篩選");filter.innerHTML='<option value="">全部商品</option>';$("costSearch").after(filter);
 $("costSearch").setAttribute("aria-label","搜尋成本方案");
 const table=$("costRows").closest("table");table.classList.add("compact-cost-table");
 table.querySelector("thead").innerHTML="<tr><th>商品編號／品名</th><th>方案名稱</th><th>進貨價 JPY</th><th>完整成本／件</th><th>售價 TWD</th><th>毛利／件</th><th>毛利率</th><th>採用狀態</th><th>操作</th></tr>";
 const cols=document.createElement("colgroup");cols.innerHTML=[25,14,9,9,9,9,7,7,11].map(w=>'<col style="width:'+w+'%">').join("");table.prepend(cols);
}
function filters(scenarios,masters){
 const select=$("costProductFilter"),value=select.value,ids=new Set(scenarios.map(s=>s.product_master_id));select.innerHTML='<option value="">全部商品</option>'+masters.filter(m=>ids.has(m.id)).sort((a,b)=>String(a.product_code||"").localeCompare(String(b.product_code||""),"en",{numeric:true})).map(m=>'<option value="'+esc(m.id)+'">'+esc((m.product_code||"代購歷史")+"｜"+m.name)+'</option>').join("");if(ids.has(value))select.value=value;
}
function rows(scenarios,masters,values,money,yen){
 return scenarios.length?scenarios.map(s=>{const p=masters.find(p=>p.id===s.product_master_id),v=values(s),pairs=[["商品進貨成本／件",money(v.productUnit)],["國際運費／件",money(v.intlUnit)],["單件進貨成本",money(v.landed)],["團購主抽成／件",money(v.groupFee)],["平台＋金流費／件",money(v.platformFee)],["扣除抽成後實收",money(v.netReceipt)],["預估國際運費（整批）",yen(v.intlJpy)],["實際總重量",v.actualWeight.toFixed(2)+" kg"],["材積重量",v.hasDimensions?v.volumetricWeight.toFixed(2)+" kg":"未輸入尺寸"],["計費重量",v.billableWeight.toFixed(2)+" kg"],["目標毛利率",(Number(s.target_margin_rate||0)*100).toFixed(1)+"%"],["建議售價",money(v.suggested)]];
 return '<tr data-cost-id="'+esc(s.id)+'"><td><span class="cost-product-code">'+esc(p?.product_code||"代購歷史")+'</span><strong>'+esc(p?.name||"未知商品")+'</strong></td><td>'+esc(s.scenario_name||"成本方案")+'</td><td>'+yen(s.purchase_price_jpy)+'</td><td>'+money(v.full)+'</td><td>'+money(s.actual_sale_price_twd)+'</td><td class="'+(v.profit<0?"cost-negative":"")+'">'+money(v.profit)+'</td><td>'+v.margin.toFixed(1)+'%</td><td>'+(s.is_selected?"已採用":"未採用")+'</td><td><div class="cost-row-actions"><button type="button" data-detail-cost aria-expanded="false">明細</button><button type="button" data-edit-cost>編輯</button><button type="button" data-select-cost'+(s.is_selected?" disabled":"")+'>'+(s.is_selected?"已採用":"採用")+'</button></div></td></tr>'+
 '<tr data-cost-id="'+esc(s.id)+'" data-cost-detail hidden><td colspan="9"><dl class="cost-breakdown">'+pairs.map(p=>'<div><dt>'+esc(p[0])+'</dt><dd>'+esc(p[1])+'</dd></div>').join("")+'</dl><div class="cost-detail-actions"><button type="button" class="danger" data-delete-cost>刪除方案</button></div></td></tr>';
 }).join(""):'<tr><td colspan="9" class="admin-empty">沒有符合的成本方案。</td></tr>';
}
function toggle(row,button){const detail=row.nextElementSibling;if(!detail?.hasAttribute("data-cost-detail"))return;detail.hidden=!detail.hidden;button.setAttribute("aria-expanded",String(!detail.hidden));}
function show(){const form=$("costForm");form.hidden=false;$("costCancelEdit").hidden=false;form.scrollIntoView({behavior:"smooth",block:"start"});}
function hide(){$("costForm").hidden=true;}
function summary(v,sale,money){$("costSummarySale").textContent=money(sale);$("costSummaryFees").textContent=money(v.platformFee+v.groupFee);}
root.FreaCostLayout={init,filters,rows,toggle,show,hide,summary};
})(typeof window!=="undefined"?window:globalThis);