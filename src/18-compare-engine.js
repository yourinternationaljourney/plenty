/* ================= Price comparison engine (DOM-free) =================
   Models: Store, Product, StoreProduct, PriceObservation, Offer. Price truth: every displayed price carries source,
   observation date, price type, confidence and scope. Nothing is invented; when no real observation exists the line is
   "Price unavailable". Receipt-confirmed history (S.prices) stays separate from retailer observations. */
const STORE_REGISTRY=[
  {id:'albert-heijn',countryCode:'NL',name:'Albert Heijn',logoUrl:null,scope:'NL',sourceCapabilities:[]},
  {id:'jumbo',countryCode:'NL',name:'Jumbo',logoUrl:null,scope:'NL',sourceCapabilities:[]},
  {id:'lidl-nl',countryCode:'NL',name:'Lidl',logoUrl:null,scope:'NL',sourceCapabilities:[]},
  {id:'kroger',countryCode:'US',name:'Kroger',logoUrl:null,scope:'US',sourceCapabilities:[]},
  {id:'aldi-us',countryCode:'US',name:'Aldi',logoUrl:null,scope:'US',sourceCapabilities:[]},
  {id:'walmart',countryCode:'US',name:'Walmart',logoUrl:null,scope:'US',sourceCapabilities:[]},
  {id:'no-frills',countryCode:'CA',name:'No Frills',logoUrl:null,scope:'CA',sourceCapabilities:[]},
  {id:'walmart-ca',countryCode:'CA',name:'Walmart Canada',logoUrl:null,scope:'CA',sourceCapabilities:[]},
  {id:'save-on-foods',countryCode:'CA',name:'Save-On-Foods',logoUrl:null,scope:'CA',sourceCapabilities:[]}];
const COUNTRY_CODES={'Netherlands':'NL','United States':'US','Canada':'CA','Belgium':'BE','Germany':'DE','United Kingdom':'GB'};
const PRICE_TYPES=['regular','promotion','receipt_confirmed','predicted'];
const PRICE_LABEL={regular:'Current online price',promotion:'Promotion',receipt_confirmed:'Confirmed from your receipt',predicted:'Estimated from price history',manual:'Entered by you',unavailable:'Price unavailable'};
const PRICE_FRESH_DAYS=7;          // a retailer price older than this is no longer "current"
const RECEIPT_FRESH_DAYS=60;       // a receipt price older than this becomes an estimate
const MATCH_AUTO=0.8, MATCH_REVIEW=0.5;
const DEFAULT_MIN_SAVING={ '€':3, '$':3, '£':3, 'kr':30, 'CHF':3, 'R':40, 'A$':4, 'C$':4, '¥':400, '₹':200 };

const countryCode=()=>{const s=S.settings;return s.countryCode||COUNTRY_CODES[s.country]||(s.currency==='€'?'NL':s.currency==='C$'?'CA':s.currency==='$'?'US':'')};
function storesForCountry(cc){return STORE_REGISTRY.filter(st=>st.countryCode===(cc||countryCode()))}
function preferredStores(){const ids=S.settings.preferredStores||[];const cc=countryCode();return STORE_REGISTRY.filter(st=>st.countryCode===cc&&ids.includes(st.id))}
const storeById=id=>STORE_REGISTRY.find(s=>s.id===id)||(S.stores&&S.stores[id])||null;
const minSavingDefault=()=>DEFAULT_MIN_SAVING[S.settings.currency]||3;
const minSaving=()=>S.settings.minStoreSaving!=null?+S.settings.minStoreSaving:minSavingDefault();
const compareMode=()=>['one','two','any'].includes(S.settings.compareMode)?S.settings.compareMode:'two';

/* ---- normalization: price per kg / L / unit ---- */
function normalizeQuantity(qty,unit){const f=famOf(unit);return {base:(+qty||0)*f.factor,fam:f.key}}
function unitPriceOf(price,qty,unit){const n=normalizeQuantity(qty,unit);if(!(n.base>0)||!(price>=0))return null;return {unitPrice:price/n.base,fam:n.fam}}
function fmtUnitPrice(unitPrice,famKey){if(unitPrice==null)return '';if(famKey==='mass')return money(unitPrice*1000)+'/kg';if(famKey==='vol')return money(unitPrice*1000)+'/L';if(famKey==='spoon')return money(unitPrice*15)+'/tbsp';return money(unitPrice)+'/'+(famKey.startsWith('count:')?famKey.slice(6).replace('pcs','unit'):'unit')}

/* ---- models (documents) ---- */
function makeProduct(p){const n=normalizeQuantity(p.packageQuantity,p.packageUnit);return {id:p.id||uid('prod'),canonicalName:String(p.canonicalName||p.name||'').trim(),canon:canon(p.canonicalName||p.name||''),brand:p.brand||'',category:CATS.includes(p.category)?p.category:guessCat(p.canonicalName||p.name||''),packageQuantity:+p.packageQuantity||0,packageUnit:p.packageUnit||'',normalizedQuantity:n.base,fam:n.fam,imageUrl:p.imageUrl||null,imageSource:p.imageSource||'',identifiers:{ean:(p.identifiers&&p.identifiers.ean)||p.ean||'',upc:(p.identifiers&&p.identifiers.upc)||p.upc||''},favorite:!!p.favorite,createdAt:p.createdAt||Date.now()}}
function makeStoreProduct(sp){return {id:sp.id||uid('sp'),storeId:sp.storeId,retailerProductId:sp.retailerProductId||'',productId:sp.productId,retailerName:sp.retailerName||'',retailerUrl:sp.retailerUrl||''}}
function makeObservation(o,product){const up=product?unitPriceOf(+o.price,product.packageQuantity,product.packageUnit):null;return {id:o.id||uid('po'),storeProductId:o.storeProductId,price:Math.round((+o.price||0)*100)/100,currency:o.currency||S.settings.currency||'€',normalizedUnitPrice:o.normalizedUnitPrice!=null?+o.normalizedUnitPrice:(up?up.unitPrice:null),priceType:PRICE_TYPES.includes(o.priceType)?o.priceType:'regular',observedAt:o.observedAt||new Date().toISOString(),validFrom:o.validFrom||null,validUntil:o.validUntil||null,sourceName:o.sourceName||'',sourceUrl:o.sourceUrl||'',confidence:o.confidence==null?0.9:Math.max(0,Math.min(1,+o.confidence)),userConfirmed:!!o.userConfirmed,locationScope:o.locationScope||'',manual:!!o.manual}}
function makeOffer(f){return {id:f.id||uid('of'),storeProductId:f.storeProductId,description:f.description||'',originalPrice:+f.originalPrice||null,offerPrice:+f.offerPrice||null,mechanic:f.mechanic||'',validFrom:f.validFrom||null,validUntil:f.validUntil||null,loyaltyRequired:!!f.loyaltyRequired,sourceUrl:f.sourceUrl||''}}
function offerActive(o,onDate){const d=onDate||iso(today());if(o.validFrom&&d<o.validFrom)return false;if(o.validUntil&&d>o.validUntil)return false;return true}
const daysAgo=ts=>{if(!ts)return Infinity;const d=new Date(ts);return isNaN(d)?Infinity:Math.floor((today()-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/86400000)}
/* effective status of an observation today: which label it may carry and whether it can be used as a current price */
function observationStatus(ob){const age=daysAgo(ob.observedAt);if(ob.priceType==='promotion'){if(!offerActive({validFrom:ob.validFrom,validUntil:ob.validUntil}))return {usable:false,label:'Expired promotion',type:'expired'};return {usable:true,label:PRICE_LABEL.promotion,type:'promotion',current:true}}
  if(ob.priceType==='receipt_confirmed')return age<=RECEIPT_FRESH_DAYS?{usable:true,label:PRICE_LABEL.receipt_confirmed,type:'receipt_confirmed',current:false}:{usable:true,label:PRICE_LABEL.predicted,type:'predicted',current:false};
  if(ob.priceType==='predicted')return {usable:true,label:PRICE_LABEL.predicted,type:'predicted',current:false};
  if(ob.manual)return {usable:true,label:PRICE_LABEL.manual+(age>PRICE_FRESH_DAYS?' (older)':''),type:age>PRICE_FRESH_DAYS?'predicted':'manual',current:age<=PRICE_FRESH_DAYS};
  return age<=PRICE_FRESH_DAYS?{usable:true,label:PRICE_LABEL.regular,type:'regular',current:true}:{usable:true,label:PRICE_LABEL.predicted,type:'predicted',current:false}}

/* ---- matching seams (deterministic) ---- */
function matchScore(line,product,storeProduct){let score=0,reasons=[];if(line.ean&&product.identifiers&&product.identifiers.ean&&line.ean===product.identifiers.ean){score=1;reasons.push('barcode')}
  else if(line.retailerProductId&&storeProduct&&storeProduct.retailerProductId&&line.retailerProductId===storeProduct.retailerProductId){score=0.95;reasons.push('retailer id')}
  else{const lc=line.canon||canon(line.name);if(lc&&product.canon===lc){score=0.85;reasons.push('name')}else if(lc&&(product.canon.includes(lc)||lc.includes(product.canon))&&Math.min(lc.length,product.canon.length)>=4){score=0.55;reasons.push('partial name')}else return {score:0,reasons:[]};
    if(line.fam&&product.fam){if(line.fam.key===product.fam)score+=0.1;else score-=0.3}
    if(line.category&&product.category===line.category)score+=0.05}
  return {score:Math.max(0,Math.min(1,score)),reasons}}
const matchStatus=score=>score>=MATCH_AUTO?'matched':score>=MATCH_REVIEW?'review':'none';

/* ---- candidate prices for a grocery line at a store ---- */
function latestObservations(storeProductId){return Object.values(S.priceobs||{}).filter(o=>o.storeProductId===storeProductId).sort((a,b)=>String(b.observedAt).localeCompare(String(a.observedAt)))}
function receiptCandidate(line,store){const p=S.prices&&S.prices[line.canon];if(!p||p.fam!==line.fam.key)return null;const samples=(p.samples||[]).filter(s=>s.store&&store&&(s.store.toLowerCase()===store.name.toLowerCase()||s.store.toLowerCase().includes(store.name.toLowerCase().split(' ')[0])));if(!samples.length)return null;
  const up=robustUnitPrice(samples);const last=samples[samples.length-1];const age=daysAgo(last.date);const type=age<=RECEIPT_FRESH_DAYS?'receipt_confirmed':'predicted';return {storeId:store.id,cost:up*line.needBase,unitPrice:up,type,label:PRICE_LABEL[type],observedAt:last.date,confidence:samples.length>=3?0.8:0.6,source:'Your receipt',matchStatus:'matched',productName:line.name,packs:null}}
function storeCandidates(line,store){const out=[];for(const sp of Object.values(S.storeproducts||{})){if(sp.storeId!==store.id)continue;const prod=S.products&&S.products[sp.productId];if(!prod)continue;const m=matchScore(line,prod,sp);const st=matchStatus(m.score);if(st==='none')continue;
    const obs=latestObservations(sp.id).map(o=>({o,s:observationStatus(o)})).filter(x=>x.s.usable);if(!obs.length)continue;const promo=obs.find(x=>x.s.type==='promotion');const pick=promo||obs[0];const o=pick.o;
    let cost,packs=null;if(prod.normalizedQuantity>0&&prod.fam===line.fam.key){packs=Math.max(1,Math.ceil(line.needBase/prod.normalizedQuantity-1e-9));cost=packs*o.price}else if(o.normalizedUnitPrice!=null&&prod.fam===line.fam.key){cost=o.normalizedUnitPrice*line.needBase}else continue;
    out.push({storeId:store.id,cost,unitPrice:o.normalizedUnitPrice,type:pick.s.type,label:pick.s.label,current:!!pick.s.current,observedAt:o.observedAt,validUntil:o.validUntil,confidence:Math.min(o.confidence,m.score),source:o.sourceName||(o.manual?'Entered by you':'Retailer'),sourceUrl:o.sourceUrl,matchStatus:st,matchScore:m.score,reasons:m.reasons,productName:prod.canonicalName+(prod.packageQuantity?` ${prod.packageQuantity} ${prod.packageUnit}`:''),productId:prod.id,storeProductId:sp.id,packs,price:o.price})}
  const rc=receiptCandidate(line,store);if(rc)out.push(rc);
  out.sort((a,b)=>(a.matchStatus==='matched'?0:1)-(b.matchStatus==='matched'?0:1)||a.cost-b.cost);return out}
function bestCandidate(line,store){const c=storeCandidates(line,store).filter(x=>x.matchStatus==='matched');return c[0]||null}

/* ---- basket comparison ---- */
function comparableLines(lines){return (lines||buildList()).filter(l=>!(l.atHome&&l.atHome.all)&&l.needBase>0)}
function priceMatrix(lines,stores){const m={};for(const l of lines){m[l.key]={};for(const st of stores){const c=bestCandidate(l,st);if(c)m[l.key][st.id]=c}}return m}
function optionFor(storeIds,lines,matrix){const alloc={};let total=0,matched=0;const types={};let lastChecked=null;const unmatched=[];for(const l of lines){let best=null;for(const sid of storeIds){const c=matrix[l.key][sid];if(c&&(!best||c.cost<best.cost))best=c}if(!best){unmatched.push(l);continue}(alloc[best.storeId]=alloc[best.storeId]||[]).push({line:l,c:best});total+=best.cost;matched++;types[best.type]=(types[best.type]||0)+1;const t=String(best.observedAt||'');if(t&&(!lastChecked||t<lastChecked))lastChecked=t}
  const used=Object.keys(alloc).sort((a,b)=>alloc[b].length-alloc[a].length||((storeById(a)||{}).name||a).localeCompare((storeById(b)||{}).name||b));return {storeIds:used,total:Math.round(total*100)/100,matched,unmatched:unmatched.length,unmatchedLines:unmatched,alloc,types,lastChecked,complete:unmatched.length===0,coveredKeys:lines.filter(l=>storeIds.some(sid=>matrix[l.key][sid])).map(l=>l.key).sort().join('|')}}
function compareBaskets(opts){opts=opts||{};const stores=opts.stores||preferredStores();const lines=comparableLines(opts.lines);const minSave=opts.minSaving!=null?+opts.minSaving:minSaving();const matrix=priceMatrix(lines,stores);
  if(!stores.length||!lines.length)return {stores,lines,matrix,options:{},singles:[],reason:!stores.length?'no-stores':'no-lines'};
  const singles=stores.map(st=>optionFor([st.id],lines,matrix)).map((o,i)=>({...o,storeIds:[stores[i].id]})).sort((a,b)=>b.matched-a.matched||a.total-b.total);
  const easiest=singles[0];const cheapestSingle=[...singles].sort((a,b)=>b.matched-a.matched||a.total-b.total)[0];
  const pairs=[];for(let i=0;i<stores.length;i++)for(let j=i+1;j<stores.length;j++)pairs.push(optionFor([stores[i].id,stores[j].id],lines,matrix));
  const any=optionFor(stores.map(s=>s.id),lines,matrix);
  const bestPair=[...pairs].sort((a,b)=>b.matched-a.matched||a.total-b.total)[0]||easiest;
  // recommended: honour the mode and the minimum saving before adding a store
  let recommended=easiest,recNote='';const mode=opts.mode||compareMode();
  if(mode==='one')recommended=easiest;
  else{const cand=mode==='two'?bestPair:any;const gainCoverage=cand.matched>easiest.matched;const saving=easiest.total-cand.total;const extraStores=cand.storeIds.length-1;
    if(gainCoverage||(extraStores>0&&saving>=minSave*extraStores))recommended=cand;else{recommended=easiest;if(extraStores>0&&saving>0)recNote=`A second store would save only ${money(saving)}, below your ${money(minSave)} threshold.`}}
  const cheapest=any.total<=bestPair.total?any:bestPair;
  // savings versus the most expensive option with the same coverage
  const all=[...singles,...pairs,any];const withSavings=o=>{const same=all.filter(x=>x.coveredKeys===o.coveredKeys&&x.matched===o.matched);const maxTotal=Math.max(...same.map(x=>x.total),o.total);return {...o,savings:Math.round((maxTotal-o.total)*100)/100,priciest:maxTotal}};
  return {stores,lines,matrix,minSaving:minSave,mode,options:{easiest:withSavings(easiest),recommended:withSavings(recommended),cheapest:withSavings(cheapest)},singles:singles.map(withSavings),recNote,totalLines:lines.length}}
function allocationText(option){const parts=option.storeIds.map(sid=>{const st=storeById(sid);const n=(option.alloc[sid]||[]).length;return `${n} item${n===1?'':'s'} at ${st?st.name:sid}`});return option.storeIds.length>1?parts.slice(0,-1).join(', ')+' and '+parts[parts.length-1]:parts.join('')}
function coverageText(option,total){return option.unmatched?`Estimated total for ${option.matched} of ${total} items — ${option.unmatched} price${option.unmatched===1?'':'s'} unavailable`:`Estimated total for all ${total} items`}
function typesText(types){const parts=[];if(types.regular)parts.push(`${types.regular} current online`);if(types.promotion)parts.push(`${types.promotion} promotion`);if(types.receipt_confirmed)parts.push(`${types.receipt_confirmed} receipt-confirmed`);if(types.manual)parts.push(`${types.manual} entered by you`);if(types.predicted)parts.push(`${types.predicted} estimated`);return parts.join(', ')}

/* ---- product search over known products ---- */
function productPrices(product){const out=[];for(const sp of Object.values(S.storeproducts||{})){if(sp.productId!==product.id)continue;const st=storeById(sp.storeId);if(!st)continue;const obs=latestObservations(sp.id).map(o=>({o,s:observationStatus(o)}));const usable=obs.filter(x=>x.s.usable);const promo=usable.find(x=>x.s.type==='promotion');const regular=usable.find(x=>x.s.type!=='promotion');const offers=Object.values(S.offers||{}).filter(f=>f.storeProductId===sp.id&&offerActive(f));
    out.push({store:st,storeProduct:sp,regular:regular?{...regular.o,status:regular.s}:null,promotion:promo?{...promo.o,status:promo.s}:null,offers,unavailable:!usable.length})}
  return out.sort((a,b)=>a.store.name.localeCompare(b.store.name))}
function searchProducts(q,f){f=f||{};const ql=String(q||'').trim().toLowerCase();const cc=countryCode();const pref=new Set((f.storeIds&&f.storeIds.length?f.storeIds:preferredStores().map(s=>s.id)));
  let list=Object.values(S.products||{}).filter(p=>!ql||p.canonicalName.toLowerCase().includes(ql)||p.canon.includes(canon(ql))||(p.brand||'').toLowerCase().includes(ql));if(f.category)list=list.filter(p=>p.category===f.category);
  const rows=list.map(p=>{const prices=productPrices(p).filter(x=>x.store.countryCode===cc&&pref.has(x.store.id));const best=prices.filter(x=>!x.unavailable).map(x=>(x.promotion||x.regular)).sort((a,b)=>a.price-b.price)[0]||null;return {product:p,prices,best,bestUnit:best?best.normalizedUnitPrice:null}});
  const sort=f.sort||'price';rows.sort((a,b)=>{if(sort==='unit')return (a.bestUnit==null)-(b.bestUnit==null)||(a.bestUnit||0)-(b.bestUnit||0);if(sort==='name')return a.product.canonicalName.localeCompare(b.product.canonicalName);return (a.best==null)-(b.best==null)||((a.best?a.best.price:0)-(b.best?b.best.price:0))});return rows}

/* ---- provider seams: the client consumes normalized responses; only LocalProvider is live in this phase ---- */
const PriceProviderInterface=['searchProducts','getProduct','getPrices','getOffers','getSourceMetadata'];
const LocalProvider={id:'local',live:true,
  async searchProducts(query,storeId){return searchProducts(query,{storeIds:storeId?[storeId]:null}).map(r=>r.product)},
  async getProduct(productId){return (S.products||{})[productId]||null},
  async getPrices(productIds,storeId){const out=[];for(const id of productIds){const p=(S.products||{})[id];if(!p)continue;for(const row of productPrices(p))if(!storeId||row.store.id===storeId)out.push({productId:id,storeId:row.store.id,regular:row.regular,promotion:row.promotion})}return out},
  async getOffers(storeId){return Object.values(S.offers||{}).filter(f=>offerActive(f)&&(!storeId||((S.storeproducts||{})[f.storeProductId]||{}).storeId===storeId))},
  async getSourceMetadata(){return {id:'local',name:'Your receipts and prices you entered',live:true,retailers:[],note:'Prices come from receipts you confirmed and prices you entered by hand. No retailer is contacted.'}}};
/* Future Netlify Functions provider: normalized JSON from /api/prices/*. Not live until authorized retailer sources exist server-side. */
const RemoteProvider={id:'remote',live:false,base(){return String(S.settings.apiBase||'').replace(/\/$/,'')},
  async call(path){if(!this.base())throw {code:'not_configured',message:'No price service is connected.'};const r=await fetch(this.base()+'/api/prices/'+path,{headers:{Accept:'application/json'}});if(!r.ok)throw {code:'http_'+r.status,message:'Price service answered '+r.status};return r.json()},
  async searchProducts(query,storeId,location){return (await this.call('search?q='+encodeURIComponent(query)+'&store='+encodeURIComponent(storeId||'')+'&location='+encodeURIComponent(location||''))).products||[]},
  async getProduct(productId,storeId){return (await this.call('product?id='+encodeURIComponent(productId)+'&store='+encodeURIComponent(storeId||''))).product||null},
  async getPrices(productIds,storeId){return (await this.call('prices?ids='+encodeURIComponent(productIds.join(','))+'&store='+encodeURIComponent(storeId||''))).prices||[]},
  async getOffers(storeId){return (await this.call('offers?store='+encodeURIComponent(storeId||''))).offers||[]},
  async getSourceMetadata(){return {id:'remote',name:'Retailer price service',live:false,note:'Connects to authenticated Netlify Functions with authorized retailer sources. Not available yet.'}}};
const RETAILER_ADAPTERS=STORE_REGISTRY.map(st=>({storeId:st.id,countryCode:st.countryCode,name:st.name,status:'planned',provider:'remote',note:'No authorized data source connected; nothing is fetched.'}));
/* apply normalized provider records into the local documents (used by manual entry now, remote later) */
async function ingestProviderRecords(rec){const written=[];for(const p of (rec.products||[])){const prod=makeProduct(p);S.products[prod.id]=prod;await writeDoc('products/'+prod.id,prod);written.push(prod.id)}for(const sp of (rec.storeProducts||[])){const s=makeStoreProduct(sp);S.storeproducts[s.id]=s;await writeDoc('storeproducts/'+s.id,s)}for(const o of (rec.observations||[])){const sp=S.storeproducts[o.storeProductId];const prod=sp?S.products[sp.productId]:null;const ob=makeObservation(o,prod);S.priceobs[ob.id]=ob;await writeDoc('priceobs/'+ob.id,ob)}for(const f of (rec.offers||[])){const of=makeOffer(f);S.offers[of.id]=of;await writeDoc('offers/'+of.id,of)}return written}
/* manual observation: the user saw a price in a store */
async function recordManualPrice(input){const cc=countryCode();const store=storeById(input.storeId);if(!store)throw new Error('Choose a store');let prod=Object.values(S.products).find(p=>p.canon===canon(input.name)&&Math.abs(p.normalizedQuantity-normalizeQuantity(input.packageQuantity,input.packageUnit).base)<1e-9);
  if(!prod)prod=makeProduct({canonicalName:input.name,brand:input.brand,category:input.category,packageQuantity:input.packageQuantity,packageUnit:input.packageUnit,ean:input.ean});
  let sp=Object.values(S.storeproducts).find(s=>s.productId===prod.id&&s.storeId===store.id);if(!sp)sp=makeStoreProduct({storeId:store.id,productId:prod.id,retailerName:input.retailerName||prod.canonicalName,retailerProductId:input.retailerProductId||''});
  const ob=makeObservation({storeProductId:sp.id,price:input.price,priceType:input.promotion?'promotion':'regular',validFrom:input.promotion?iso(today()):null,validUntil:input.promotion?(input.validUntil||null):null,sourceName:'Entered by you',confidence:0.9,userConfirmed:true,manual:true,locationScope:cc,currency:S.settings.currency},prod);
  await ingestProviderRecords({products:[prod],storeProducts:[sp],observations:[ob]});return {product:prod,storeProduct:sp,observation:ob}}
