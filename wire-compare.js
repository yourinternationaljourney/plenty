// Migration script (v2.3): price comparison inside Groceries, new document collections, settings, events.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
function patch(file, pairs) { const p = path.join(root, file); let s = fs.readFileSync(p, 'utf8'); for (const [a, b] of pairs) { if (!s.includes(a)) throw new Error(file + ' missing: ' + a.slice(0, 90)); s = s.replace(a, b); } fs.writeFileSync(p, s); }

patch('src/2-engine.js', [["prices:{},history:{viewed:[],cooked:[]},external:{},", "prices:{},history:{viewed:[],cooked:[]},external:{},products:{},storeproducts:{},priceobs:{},offers:{},stores:{},"]]);

// groceries view: segments, per-line compare, basket line in the side panel
{
  const p = path.join(root, 'src/3-store-views.js'); let s = fs.readFileSync(p, 'utf8');
  const fnStart = s.indexOf('function viewGroceries(){'); const retStart = s.indexOf("  return `<div class=\"head\"><div>${weekHead('Grocery list')}", fnStart); const gwrap = s.indexOf('<div class="gwrap">', retStart);
  if (fnStart < 0 || retStart < 0 || gwrap < 0) throw new Error('viewGroceries anchors');
  const headTpl = s.slice(retStart + '  return `'.length, gwrap); // head markup up to gwrap
  const rest = s.slice(gwrap); // starts with <div class="gwrap">...`}
  const before = s.slice(0, retStart);
  const newReturn = "  const seg=S.ui.gseg||'list';const head=`" + headTpl + "`+groceriesSegmentsHtml(seg);\n  if(seg==='compare')return head+compareViewHtml(B);if(seg==='search')return head+searchViewHtml();\n  return head+`";
  s = before + newReturn + rest;
  // per-line compare action
  s = s.replace("<span class=\"price num\">${l.cost?money(l.cost):''}</span>${l.items.length?", "<span class=\"price num\">${l.cost?money(l.cost):''}</span><button class=\"mini\" data-action=\"line-compare\" data-key=\"${esc(l.key)}\" title=\"Compare prices at your stores\">Compare</button>${l.items.length?");
  if (!s.includes('data-action="line-compare"')) throw new Error('line compare');
  // side panel + home budget: selected basket
  s = s.replace("      <div class=\"kv total\"><span>Estimated checkout</span><b class=\"num\">${money(B.actual)}</b></div>\n      <div class=\"kv\"><span>${B.remaining>=0?'Under budget by':'Over budget by'}</span>", "      <div class=\"kv total\"><span>Estimated checkout</span><b class=\"num\">${money(B.actual)}</b></div>${basketBudgetLineHtml()}\n      <div class=\"kv\"><span>${B.remaining>=0?'Under budget by':'Over budget by'}</span>");
  if (!s.includes('${basketBudgetLineHtml()}')) throw new Error('side basket line');
  s = s.replace("      <div class=\"kv total\"><span>Total estimated grocery spend</span><b class=\"num\">${money(B.actual)}</b></div>", "      <div class=\"kv total\"><span>Total estimated grocery spend</span><b class=\"num\">${money(B.actual)}</b></div>${basketBudgetLineHtml()}");
  // loaders
  s = s.replace("    col('recipes','recipes');col('items','items');col('inventory','inventory');col('prices','prices');", "    col('recipes','recipes');col('items','items');col('inventory','inventory');col('prices','prices');col('products','products');col('storeproducts','storeproducts');col('priceobs','priceobs');col('offers','offers');");
  s = s.replace("S.prices=await Store.list('prices');S.chats=await Store.list('chat');", "S.prices=await Store.list('prices');S.chats=await Store.list('chat');S.products=withId(await Store.list('products'));S.storeproducts=withId(await Store.list('storeproducts'));S.priceobs=withId(await Store.list('priceobs'));S.offers=withId(await Store.list('offers'));");
  if (!s.includes("S.priceobs=withId")) throw new Error('loaders');
  fs.writeFileSync(p, s);
}
// settings card
patch('src/4-views2.js', [["    <div class=\"card pad\"><h3 style=\"margin-bottom:12px\">Household & shopping</h3>", "    ${storesSettingsCardHtml()}\n    <div class=\"card pad\"><h3 style=\"margin-bottom:12px\">Household & shopping</h3>"]]);
// onboarding: map typed stores + country to registry
patch('src/13-onboarding.js', [["store:(a.stores||[])[0]||'',stores:a.stores||[],", "store:(a.stores||[])[0]||'',stores:a.stores||[],countryCode:COUNTRY_CODES[a.country]||'',preferredStores:STORE_REGISTRY.filter(st=>st.countryCode===(COUNTRY_CODES[a.country]||'')&&(a.stores||[]).some(n=>n.toLowerCase().replace(/[^a-z]/g,'')===st.name.toLowerCase().replace(/[^a-z]/g,'')||st.name.toLowerCase().startsWith(n.toLowerCase().split(' ')[0]))).map(st=>st.id),"]]);
// events
patch('src/7-events-starter.js', [
  ["main.addEventListener('input',e=>{", "main.addEventListener('input',e=>{if(e.target.dataset.input==='pq'){psState().q=e.target.value;clearTimeout(window.__pqT);window.__pqT=setTimeout(render,250);return}"],
  ["  if(t.dataset.allergy){", "  if(t.dataset.prefStore){const set=new Set(S.settings.preferredStores||[]);if(t.checked)set.add(t.dataset.prefStore);else set.delete(t.dataset.prefStore);saveSettings({preferredStores:[...set]});return}\n  if(t.dataset.compareMode){saveSettings({compareMode:t.dataset.compareMode});return}\n  if(t.dataset.ps){psState()[t.dataset.ps]=t.value;render();return}\n  if(t.dataset.allergy){"],
  ["    case 'pwa-update':applyUpdate();break;", "    case 'gseg':S.ui.gseg=d.seg;render();window.scrollTo(0,0);break;\n    case 'line-compare':openLineCompare(d.key);break;\n    case 'cmp-select':S.ui.cmpSel=d.k;render();break;\n    case 'basket-use':{const cmp=compareBaskets();const o=cmp.options[d.k];if(!o||!o.matched){toast('No priced option to use yet.');return}const w=week();w.basketChoice={optionKey:d.k,storeIds:o.storeIds,total:o.total,matched:o.matched,unmatched:o.unmatched,totalLines:cmp.totalLines,at:new Date().toISOString()};saveWeek();toast('Budget now shows this basket estimate; your list is unchanged.');break}\n    case 'basket-clear':{const w=week();delete w.basketChoice;saveWeek();break}\n    case 'how-prices':openHowPrices();break;\n    case 'price-manual':closeModal();openManualPrice({name:d.name,cat:d.cat,pid:d.pid});break;\n    case 'ps-store':{const set=new Set(psState().stores);if(!set.size){preferredStores().forEach(s=>set.add(s.id))}set.has(d.id)?set.delete(d.id):set.add(d.id);psState().stores=set.size===preferredStores().length?[]:[...set];render();break}\n    case 'prod-fav':{const p=S.products[d.id];if(!p)return;p.favorite=!p.favorite;writeDoc('products/'+p.id,p);render();break}\n    case 'prod-add':{const p=S.products[d.id];if(!p)return;const best=searchProducts(p.canonicalName,{}).find(r=>r.product.id===p.id);const price=best&&best.best?best.best.price:0;const w=week();w.extras=w.extras||[];w.extras.push({id:uid('x'),name:p.canonicalName,qty:p.packageQuantity||1,unit:p.packageUnit||'pcs',category:p.category,price,priority:'preferred',productId:p.id});saveWeek();toast(`${p.canonicalName} added to your list${price?' at '+money(price):''}`);break}\n    case 'pwa-update':applyUpdate();break;"],
]);
// assistant context: explain comparison without inventing prices
patch('src/6-coach.js', [["GROCERY LIST TO BUY (consolidated, at-home already excluded): ${list||'empty'}\n${healthCoachContext()}`}", "GROCERY LIST TO BUY (consolidated, at-home already excluded): ${list||'empty'}\n${(()=>{try{const c=compareBaskets();if(!c.options.recommended)return 'PRICE COMPARISON: no preferred stores or no priced items yet.';const o=c.options.recommended;return `PRICE COMPARISON (deterministic, from confirmed receipts and prices the user entered; NEVER invent or guess prices): recommended ${o.matched} of ${c.totalLines} items priced at ${money(o.total)} across ${o.storeIds.map(s=>(storeById(s)||{}).name||s).join(' + ')||'no store'}; ${o.unmatched} prices unavailable; price types: ${typesText(o.types)||'none'}.`}catch(e){return ''}})()}\n${healthCoachContext()}`}"]]);
patch('tests/harness.js', [["'12-storage.js', '13-onboarding.js', '14-backup.js'];", "'12-storage.js', '13-onboarding.js', '14-backup.js', '18-compare-engine.js'];"]]);
console.log('wired compare');
