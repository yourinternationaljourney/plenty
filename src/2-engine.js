/* ================= constants ================= */
const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAYS_LONG=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MEAL_TYPES=['breakfast','lunch','dinner','snack','drink','treat'];
const MEAL_LABEL={breakfast:'Breakfast',lunch:'Lunch',dinner:'Dinner',snack:'Snack',drink:'Drink',treat:'Treat'};
const CATS=['Produce','Meat & seafood','Dairy & eggs','Bakery','Breakfast','Snacks & treats','Coffee & tea','Drinks','Pantry','Frozen','Pet','Household','Personal care','Other'];
const GROUPS=['meals','staples','snacks','pantry','pet','household'];
const CAT_GROUP={'Produce':'snacks','Meat & seafood':'staples','Dairy & eggs':'staples','Bakery':'staples','Breakfast':'staples','Snacks & treats':'snacks','Coffee & tea':'snacks','Drinks':'snacks','Pantry':'pantry','Frozen':'pantry','Pet':'pet','Household':'household','Personal care':'household','Other':'pantry'};
const LOCS=['Pantry','Fridge','Freezer','Drinks','Pet','Household'];
const CAT_LOC={'Produce':'Fridge','Meat & seafood':'Fridge','Dairy & eggs':'Fridge','Bakery':'Pantry','Breakfast':'Pantry','Snacks & treats':'Pantry','Coffee & tea':'Pantry','Drinks':'Drinks','Pantry':'Pantry','Frozen':'Freezer','Pet':'Pet','Household':'Household','Personal care':'Household','Other':'Pantry'};
const PRIOS=['essential','preferred','optional'];
const FREQS=[['weekly','Every week'],['biweekly','Every two weeks'],['monthly','Monthly'],['asneeded','Only when needed']];
const FREQ_FACTOR={weekly:1,biweekly:.5,monthly:.25,asneeded:0};
const UNITS=['g','kg','ml','l','pcs','tbsp','tsp','cup','clove','slice','can','pack','bag','bottle','loaf','bunch','handful','pinch',''];
const UFAM={g:['mass',1],kg:['mass',1000],ml:['vol',1],l:['vol',1000],cup:['vol',240],tsp:['spoon',1],tbsp:['spoon',3],pinch:['pinch',1]};
const TAGS=['quick','budget','high-protein','vegetarian','vegan','light','comfort','meal-prep','fish','chicken','beef','pork','gluten-free','dairy-free','work-snack'];
const CURRENCIES=['$','€','£','kr','CHF','R','A$','C$','¥','₹'];
const DEFAULT_SETTINGS={people:1,currency:'$',weeklyBudget:70,buffer:5,groupBudgets:{},shopDay:6,store:'',pets:[],targets:{breakfast:7,lunch:5,dinner:5,snack:5,drink:0,treat:2},kcalTarget:2000,proteinTarget:100,diet:'',allergies:[],apiBase:''};
const STAPLES=new Set(['salt','black pepper','olive oil','vegetable oil','sunflower oil','sugar','flour','soy sauce','vinegar','baking powder','stock cube','honey','oregano','cumin','paprika','smoked paprika','curry powder','chilli flake','cinnamon','turmeric','garlic powder','sesame oil','cornflour','mustard']);
const PACKS={egg:['count',[6,12]],milk:['vol',[1000,2000]],'greek yogurt':['mass',[500,1000]],yogurt:['mass',[500,1000]],'rolled oat':['mass',[500,1000]],oat:['mass',[500,1000]],rice:['mass',[500,1000]],'basmati rice':['mass',[500,1000]],pasta:['mass',[500]],spaghetti:['mass',[500]],'chicken breast':['mass',[300,500,650,1000]],'chicken thigh':['mass',[500,1000]],spinach:['mass',[200,400]],'cherry tomato':['mass',[250,500]],butter:['mass',[250,500]],cheddar:['mass',[200,400]],feta:['mass',[200]],'frozen pea':['mass',[500,900]],banana:['count',[5,6,7]],apple:['count',[4,6]],'tortilla wrap':['count',[6,8]],'salmon fillet':['count',[2,4]],'peanut butter':['mass',[340,500]],'chickpea':['count:can',[1]],'protein bar':['count',[1,6,12]]};

const ICONS={
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  recipes:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12a3 3 0 0 1 3 3v13H6a2 2 0 0 1-2-2V4z"/><path d="M4 17a2 2 0 0 1 2-2h13M8 8h6M8 11h4"/></svg>',
  groceries:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.5L21 8H6"/><circle cx="10" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/></svg>',
  items:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l8-4 8 4v10l-8 4-8-4z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>',
  home2:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 10h16M9 7h.01M9 14h.01M12 14h5"/></svg>',
  coach:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></svg>',
  settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  more:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  spark:'<svg class="spark" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 5.7L19.5 9.5l-5.7 1.8L12 17l-1.8-5.7L4.5 9.5l5.7-1.8L12 2zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15zM5 14l.7 1.8 1.8.7-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14z"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  left:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  right:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  send:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>',
};

ICONS.discover=ICONS.search;ICONS.health='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.4 3.3 5 6.8 5c1.9 0 3.4 1 4.2 2.4C11.8 6 13.3 5 15.2 5c3.5 0 5.6 3.4 4.3 6.7C17.5 16.4 12 21 12 21z"/><path d="M7 12h3l1.5-3 2 6 1.5-3h2"/></svg>';

/* ================= state ================= */
const S={settings:{...DEFAULT_SETTINGS},recipes:{},items:{},inventory:{},weeks:{},chats:{},prices:{},history:{viewed:[],cooked:[]},external:{},products:{},storeproducts:{},priceobs:{},offers:{},stores:{},health:null,checkins:null,ui:{tab:'home',weekKey:null,q:'',tag:'',mealFilter:'',storage:'local',chatDraft:'',busy:false,mode:'app'},loaded:false};
let db=null,sampleFn=null;
const hot=window.claude&&window.claude.hot;const restored=(hot&&hot.data)||{};
if(restored.tab)S.ui.tab=restored.tab;

/* ================= dates ================= */
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
function mondayOf(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
function parseISO(s){const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d||1)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
const today=()=>{const t=new Date();t.setHours(0,0,0,0);return t};
const daysBetween=(a,b)=>Math.round((b-a)/86400000);
S.ui.weekKey=restored.weekKey||iso(mondayOf(today()));
const fmtDate=d=>d.getDate()+' '+MONTHS[d.getMonth()].slice(0,3);
function nextShopDate(){const sd=S.settings.shopDay==null?6:S.settings.shopDay;const t=today();let d=new Date(t);for(let i=0;i<7;i++){if(((d.getDay()+6)%7)===sd)return d;d=addDays(d,1)}return t}

/* ================= formatting ================= */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function money(n){const c=S.settings.currency||'$';const v=(Math.round(Math.abs(n||0)*100)/100).toFixed(2);const sign=n<-0.004?'−':'';return sign+(c.length>1&&!/^[A-Z]\$$/.test(c)?v+' '+c:c+v)}
const plural=(m,n)=>n===1?m:(m==='lunch'?'lunches':m+'s');
const cap=s=>s?s[0].toUpperCase()+s.slice(1):'';
const uid=p=>(p||'r')+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const clone=o=>JSON.parse(JSON.stringify(o));
const petName=()=>{const ps=Array.isArray(S.settings.pets)?S.settings.pets:[];return (ps[0]&&ps[0].name)||S.settings.petName||'Pet'};
const GROUP_LABEL=g=>({meals:'Planned recipes',staples:'Breakfast & lunch staples',snacks:'Fruit, snacks & drinks',pantry:'Pantry restocking',pet:(typeof petNames==='function'&&petNames())||petName(),household:'Household & personal care'})[g]||g;
function fmtFrac(q){const whole=Math.floor(q+1e-9),frac=q-whole;const f=frac<0.125?'':frac<0.375?'¼':frac<0.625?'½':frac<0.875?'¾':'';const w=frac>=0.875?whole+1:whole;const s=(w?w:'')+(f&&w?' ':'')+f;return s||(Math.round(q*100)/100).toString()}
function famOf(unit){const u=UFAM[unit||''];if(u)return {key:u[0],factor:u[1]};return {key:'count:'+(unit||'pcs'),factor:1}}
function fmtBase(q,fam){ // q in base units
  if(!q&&q!==0)return '';
  const k=typeof fam==='string'?fam:fam.key;
  if(k==='mass')return q>=1000?(Math.round(q/100)/10)+' kg':Math.round(q>=50?Math.round(q/5)*5:q)+' g';
  if(k==='vol')return q>=1000?(Math.round(q/100)/10)+' l':Math.round(q>=50?Math.round(q/5)*5:q)+' ml';
  if(k==='spoon')return q>=3&&Math.abs(q/3-Math.round(q/3*4)/4)<0.01?fmtFrac(q/3)+' tbsp':fmtFrac(q)+' tsp';
  if(k==='pinch')return 'pinch';
  const unit=k.slice(6);return fmtFrac(q)+(unit==='pcs'?'':' '+unit);
}
const fmtQty=(q,unit)=>{const f=famOf(unit);return fmtBase((q||0)*f.factor,f.key)};

/* ================= canonical names ================= */
const STRIP=/\b(fresh|baby|large|small|medium|ripe|organic|free[- ]range|chopped|diced|sliced|minced|grated|crushed|boneless|skinless|raw|cooked|plain|natural|extra[- ]virgin|virgin|finely|roughly|peeled|trimmed|halved|whole|of|a|the)\b/g;
const ALIAS={'scallion':'spring onion','green onion':'spring onion','cilantro':'coriander','coriander leaf':'coriander','garbanzo bean':'chickpea','courgette':'zucchini','aubergine':'eggplant','arugula':'rocket','yoghurt':'yogurt','natural yogurt':'yogurt','greek yoghurt':'greek yogurt','sea salt':'salt','kosher salt':'salt','table salt':'salt','pepper':'black pepper','ground black pepper':'black pepper','cracked black pepper':'black pepper','spinach leaf':'spinach','mixed berry':'berry','frozen berry':'berry','frozen mixed berry':'berry','chicken breast fillet':'chicken breast','chicken fillet':'chicken breast','tortilla':'tortilla wrap','wrap':'tortilla wrap','wholegrain bread':'bread','wholemeal bread':'bread','sourdough':'bread','sourdough bread':'bread','white bread':'bread','seeded bread':'bread','sparkling water':'sparkling water','fizzy water':'sparkling water','rolled oat':'oat','porridge oat':'oat','oats':'oat','tea bag':'tea','black tea':'tea','english breakfast tea':'tea','ground coffee':'coffee','coffee bean':'coffee','instant coffee':'coffee','dark chocolate':'dark chocolate','chocolate bar':'dark chocolate','dog food':'dry dog food','kibble':'dry dog food','dry food':'dry dog food'};
function singular(w){if(/ies$/.test(w)&&w.length>4)return w.slice(0,-3)+'y';if(/(oes|shes|ches|xes|sses)$/.test(w))return w.replace(/es$/,'');if(/(ss|us|is|ous)$/.test(w))return w;if(/s$/.test(w)&&w.length>3)return w.slice(0,-1);return w}
function canon(name){let n=String(name||'').toLowerCase().replace(/\(.*?\)/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(STRIP,' ').replace(/\s+/g,' ').trim();n=n.split(' ').filter(Boolean).map(singular).join(' ');if(ALIAS[n])n=ALIAS[n];return n}
function guessCat(name){const n=String(name).toLowerCase();
  const map=[[/dog|puppy|kibble|dental chew|pet|cat food|litter|waste bag/,'Pet'],[/paper towel|detergent|toilet|bin bag|dish soap|washing up|cleaner|sponge|bleach|foil|cling/,'Household'],[/toothpaste|shampoo|soap|deodorant|razor|floss|conditioner|body wash|tampon|pad/,'Personal care'],[/tea|coffee|espresso/,'Coffee & tea'],[/sparkling water|juice|soda|cola|kombucha|oat milk|almond milk|water/,'Drinks'],[/chocolate|crisps|chips|protein bar|granola bar|biscuit|cookie|nuts|popcorn|hummus|snack/,'Snacks & treats'],[/oat|cereal|granola|muesli/,'Breakfast'],[/chicken|beef|pork|turkey|mince|salmon|tuna|fish|prawn|shrimp|lamb|bacon|sausage|steak|cod/,'Meat & seafood'],[/milk|cheese|yogurt|yoghurt|butter|egg|cream|halloumi|parmesan|feta|mozzarella|cheddar/,'Dairy & eggs'],[/bread|wrap|tortilla|pitta|pita|bagel|bun|roll|loaf/,'Bakery'],[/frozen|ice cream/,'Frozen'],[/rice|pasta|spaghetti|noodle|flour|sugar|oil|vinegar|soy|sauce|tinned|canned|bean|lentil|chickpea|stock|honey|pesto|salsa|seed|breadcrumb|cornflour|dressing|olive|salt|pepper|cumin|paprika|oregano|basil|chilli|cinnamon|turmeric|curry|spice|peanut butter|jam/,'Pantry'],[/onion|garlic|lemon|lime|tomato|pepper|broccoli|spinach|potato|carrot|cucumber|lettuce|rocket|avocado|banana|apple|berry|berries|parsley|coriander|ginger|mushroom|courgette|zucchini|orange|grape|pear|kale|cabbage|celery|salad/,'Produce']];
  for(const [re,c] of map)if(re.test(n))return c;return 'Other'}
function packHint(cn,famKey,base){const p=PACKS[cn];if(!p||base<=0)return '';const [f,sizes]=p;if(f!==(famKey==='count:pcs'?'count':famKey))return '';const mx=sizes[sizes.length-1];const fit=sizes.find(s=>s>=base-1e-9);const show=s=>fmtBase(s,famKey);if(fit)return `buy 1 × ${show(fit)}`;const n=Math.ceil(base/mx);return `buy ${n} × ${show(mx)}`}
const prioRank=p=>PRIOS.indexOf(p||'preferred');
const higherPrio=(a,b)=>!a?b:!b?a:prioRank(a)<=prioRank(b)?a:b;

/* ================= week / plan ================= */
function week(k){k=k||S.ui.weekKey;return S.weeks[k]||(S.weeks[k]={slots:{},buy:{},checked:{},extras:[],trips:[]})}
function activeMeals(){const t=S.settings.targets||DEFAULT_SETTINGS.targets;return MEAL_TYPES.filter(m=>(t[m]||0)>0)}
function slotEntries(wk,d,m){return ((wk.slots||{})[d]||{})[m]||[]}
function planEntries(wk){wk=wk||week();const out=[];for(let d=0;d<7;d++)for(const m of MEAL_TYPES)for(const e of slotEntries(wk,d,m)){
  if(e.t==='r'){const r=S.recipes[e.id];if(r)out.push({day:d,meal:m,type:'recipe',e,recipe:r,servings:e.sv||S.settings.people||1})}
  else if(e.t==='l'){out.push({day:d,meal:m,type:'leftovers',e,recipe:S.recipes[e.of]||null})}
  else if(e.t==='i'){const it=S.items[e.id];if(it)out.push({day:d,meal:m,type:'item',e,item:it})}}return out}
function recipeHasPrices(r){return (r.ingredients||[]).some(i=>+i.price>0)}
function recipeCost(r){const ings=r.ingredients||[];if(recipeHasPrices(r))return ings.reduce((a,i)=>a+(+i.price||0),0)/(r.servings||1);return +r.costPerServing||0}
function recipeLines(r,servings,meal){const scale=servings/(r.servings||1);const ings=r.ingredients||[];const hp=recipeHasPrices(r);const each=hp?0:((+r.costPerServing||0)*(r.servings||1))/(ings.length||1);
  return ings.map(i=>({name:i.name,unit:i.unit||'',qty:(+i.qty||0)*scale,cost:(hp?(+i.price||0):each)*scale,category:i.category||i.aisle||guessCat(i.name),group:'meals',meal,source:r.name,recipeId:r.id}))}

/* ================= items ================= */
const isMulti=it=>+it.packageSize>0&&+it.usePerDay>0;
function petStatus(it){const asOf=it.remainingAsOf?parseISO(it.remainingAsOf):today();const days=Math.max(0,daysBetween(asOf,today()));const remaining=Math.max(0,(+it.remaining||0)-(+it.usePerDay)*days);const daysLeft=remaining/(+it.usePerDay);const runOut=addDays(today(),Math.floor(daysLeft));const weeksPer=(+it.packageSize)/(+it.usePerDay)/7;
  return {remaining,daysLeft,runOut,weeksPer,weekly:weeksPer>0?(+it.packagePrice||0)/weeksPer:0,pct:Math.max(0,Math.min(100,remaining/(+it.packageSize)*100))}}
function itemDue(it,wk,wkKey){wk=wk||week();wkKey=wkKey||S.ui.weekKey;const ov=(wk.buy||{})[it.id];
  if(ov===true)return {due:true,why:'Added for this week',override:true};if(ov===false)return {due:false,why:'Postponed',override:true};
  if(isMulti(it)){const st=petStatus(it);const weekEnd=addDays(parseISO(wkKey),6);const lastShop=addDays(weekEnd,7);if(st.runOut<=addDays(weekEnd,1))return {due:true,why:st.daysLeft<1?'Run out':'Runs out '+fmtDate(st.runOut)};if(st.runOut<=lastShop)return {due:false,why:'Runs out '+fmtDate(st.runOut)+', next week'};return {due:false,why:'Lasts until '+fmtDate(st.runOut)}}
  if(it.inStock)return {due:false,why:'In stock'};
  const lb=it.lastBought?parseISO(it.lastBought):null;const ws=parseISO(wkKey);const since=lb?daysBetween(lb,ws):999;
  switch(it.frequency||'weekly'){case 'weekly':return {due:true,why:'Every week'};case 'biweekly':return since>=13?{due:true,why:'Every two weeks'}:{due:false,why:'Bought '+fmtDate(lb)};case 'monthly':return since>=27?{due:true,why:'Monthly'}:{due:false,why:'Bought '+fmtDate(lb)};default:return {due:true,why:'Out of stock'}}}
function itemCosts(it){if(isMulti(it)){const st=petStatus(it);return {actual:+it.packagePrice||0,normalized:st.weekly}}const f=FREQ_FACTOR[it.frequency||'weekly'];return {actual:+it.price||0,normalized:(+it.price||0)*(it.frequency==='asneeded'?0:f)}}
const itemGroup=it=>it.group||(it.kind==='pet'?'pet':CAT_GROUP[it.category]||'pantry');

/* ================= inventory ================= */
function invIndex(){const idx={};for(const v of Object.values(S.inventory)){const c=canon(v.name);(idx[c]=idx[c]||[]).push({...v,fam:famOf(v.unit),base:(+v.qty||0)*famOf(v.unit).factor})}return idx}

/* ================= consolidated list ================= */
function newLine(key,cn,fam,category){return {key,canon:cn,fam,names:{},qty:0,recipeBase:0,recipeCost:0,extraBase:0,extraCost:0,itemBase:0,itemCost:0,cost:0,sources:[],groups:{},meals:{},category,priority:null,items:[],recipes:new Set(),extras:null}}
function mergeInto(t,l,f){t.qty+=l.qty*f;t.recipeBase+=l.recipeBase*f;t.extraBase+=l.extraBase*f;t.itemBase+=l.itemBase*f;t.recipeCost+=l.recipeCost;t.extraCost+=l.extraCost;t.itemCost+=l.itemCost;t.cost+=l.cost;
  for(const n in l.names)t.names[n]=(t.names[n]||0)+l.names[n];l.sources.forEach(s=>{if(!t.sources.includes(s))t.sources.push(s)});for(const g in l.groups)t.groups[g]=(t.groups[g]||0)+l.groups[g];for(const m in l.meals)t.meals[m]=(t.meals[m]||0)+l.meals[m];
  t.items.push(...l.items);l.recipes.forEach(r=>t.recipes.add(r));if(l.extras)t.extras=[...(t.extras||[]),...l.extras];t.priority=higherPrio(t.priority,l.priority)}
function packPlan(cn,famKey,need,packBase,mustBuyOne){const p=PACKS[cn];const sizes=(p&&p[0]===(famKey==='count:pcs'?'count':famKey)&&p[1].length)?[...p[1]].sort((a,b)=>a-b):(packBase>0?[packBase]:[]);
  const show=s=>famKey.startsWith('count')?fmtBase(s,famKey):fmtBase(s,famKey);
  if(!sizes.length)return {total:Math.max(0,need),label:''};
  if(need<=1e-9)return mustBuyOne?{total:sizes.find(s=>s>=packBase)||packBase||sizes[0],label:`buy 1 × ${show(sizes.find(s=>s>=packBase)||packBase||sizes[0])}`}:{total:0,label:''};
  const mx=sizes[sizes.length-1];let n=Math.floor(need/mx+1e-9);let rem=need-n*mx;const parts=[];let total=n*mx;
  if(rem>1e-9){const small=sizes.find(s=>s>=rem-1e-9);if(small){total+=small;if(small===mx)n++;else parts.push(`1 × ${show(small)}`)}}
  if(n>0)parts.unshift(`${n} × ${show(mx)}`);return {total,label:'buy '+parts.join(' + ')}}
function buildList(wk,wkKey){wk=wk||week();wkKey=wkKey||S.ui.weekKey;const lines={};
  const add=o=>{const fam=famOf(o.unit);const cn=canon(o.name)||String(o.name).toLowerCase();const key=cn+'|'+fam.key;let L=lines[key];if(!L)L=lines[key]=newLine(key,cn,fam,o.category||guessCat(o.name));
    const base=(+o.qty||0)*fam.factor,cost=+o.cost||0;L.names[o.name]=(L.names[o.name]||0)+1;L.qty+=base;L.cost+=cost;
    if(o.item){L.itemBase+=base;L.itemCost+=cost;L.items.push(o.item)}else if(o.extra){L.extraBase+=base;L.extraCost+=cost;(L.extras=L.extras||[]).push(o.extra)}else{L.recipeBase+=base;L.recipeCost+=cost;if(o.recipeId)L.recipes.add(o.recipeId)}
    if(o.source&&!L.sources.includes(o.source))L.sources.push(o.source);L.groups[o.group]=(L.groups[o.group]||0)+cost;if(o.meal)L.meals[o.meal]=(L.meals[o.meal]||0)+cost;if(o.priority)L.priority=higherPrio(L.priority,o.priority)};
  for(const e of planEntries(wk))if(e.type==='recipe')for(const l of recipeLines(e.recipe,e.servings,e.meal))add(l);
  for(const it of Object.values(S.items)){const d=itemDue(it,wk,wkKey);if(!d.due)continue;const c=itemCosts(it);
    add({name:it.name,unit:isMulti(it)?(it.packageUnit||''):(it.unit||''),qty:isMulti(it)?+it.packageSize:(+it.qty||1),cost:c.actual,category:it.category||guessCat(it.name),group:itemGroup(it),source:it.kind==='pet'?petName():(it.brand?it.brand:'Regular item'),priority:it.priority||'preferred',item:it})}
  for(const x of (wk.extras||[]))add({name:x.name,unit:x.unit||'',qty:+x.qty||0,cost:+x.price||0,category:x.category||guessCat(x.name),group:x.group||CAT_GROUP[x.category]||'pantry',source:'Added by you',priority:x.priority||'optional',extra:x});
  // pass 2: merge unit families that describe the same product (spoons into weight/volume, slices into loaves)
  const byCanon={};for(const k in lines)(byCanon[lines[k].canon]=byCanon[lines[k].canon]||[]).push(lines[k]);
  for(const cn in byCanon){const arr=byCanon[cn];if(arr.length<2)continue;const tgt=arr.find(l=>l.fam.key==='mass')||arr.find(l=>l.fam.key==='vol');
    if(tgt)for(const l of arr){if(l===tgt||l.fam.key!=='spoon')continue;mergeInto(tgt,l,5);delete lines[l.key]}
    const loaf=arr.find(l=>l.fam.key==='count:loaf'),slice=arr.find(l=>l.fam.key==='count:slice');if(loaf&&slice){mergeInto(loaf,slice,1/16);delete lines[slice.key]}
    const pcs=arr.find(l=>l.fam.key==='count:pcs');for(const l of arr){if(pcs&&l!==pcs&&(l.fam.key==='count:can'||l.fam.key==='count:bottle'||l.fam.key==='count:pack'||l.fam.key==='count:bag')&&l.items.length===0&&pcs.items.length){mergeInto(pcs,l,1);delete lines[l.key]}}}
  const inv=invIndex();const out=[];
  for(const L of Object.values(lines)){
    L.name=cap(Object.entries(L.names).sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length)[0][0]);L.fullCost=L.cost;L.atHome=null;
    const multi=L.items.some(isMulti);const have=inv[L.canon];let haveQ=0,untracked=false;
    if(have&&!multi){const same=have.filter(h=>h.fam.key===L.fam.key&&h.base>0);untracked=have.some(h=>!(+h.qty>0));haveQ=same.reduce((a,h)=>a+h.base,0)}
    let need=L.recipeBase+L.extraBase;
    if(L.items.length&&!multi){const it=L.items.find(i=>+i.price>0)||L.items[0];const packBase=Math.max(1e-9,(+it.qty||1)*famOf(it.unit).factor);
      if(untracked||(haveQ>=packBase-1e-9&&haveQ>=need-1e-9)){L.atHome={all:true,label:untracked?'At home':'At home: '+fmtBase(haveQ,L.fam)};L.needBase=0;L.cost=0;L.pack=''}
      else{const needAfter=Math.max(0,need-haveQ);if(haveQ>0)L.atHome={all:false,label:'Have '+fmtBase(haveQ,L.fam)+' at home'};
        const plan=packPlan(L.canon,L.fam.key,needAfter,packBase,true);L.needBase=plan.total;L.pack=plan.label;
        const unitPrice=+it.price>0?(+it.price)/packBase:(L.itemCost+L.recipeCost+L.extraCost)/Math.max(L.qty,1e-9);L.cost=plan.total*unitPrice}}
    else if(multi){L.needBase=L.qty;L.pack=''}
    else{let needAfter=need;if(untracked){L.atHome={all:true,label:'At home'};needAfter=0}else if(haveQ>=need-1e-9&&haveQ>0){L.atHome={all:true,label:'At home: '+fmtBase(haveQ,L.fam)};needAfter=0}else if(haveQ>0){needAfter=need-haveQ;L.atHome={all:false,label:'Have '+fmtBase(haveQ,L.fam)+' at home'}}
      L.needBase=needAfter;L.cost=need>0?L.fullCost*(needAfter/need):0;L.pack=needAfter>0?packHint(L.canon,L.fam.key,needAfter):''}
    const pm=priceMemoryFor(L.canon,L.fam.key);if(pm&&L.needBase>0&&!(L.atHome&&L.atHome.all)){L.cost=L.needBase*pm.unitPrice;L.priced=pm.store||"receipt";L.priceMemory=pm}
    L.checked=!!(wk.checked||{})[L.key];L.group=Object.entries(L.groups).sort((a,b)=>b[1]-a[1])[0][0];
    L.staple=L.items.length===0&&!L.extras&&(STAPLES.has(L.canon)||L.fam.key==='pinch'||(L.fam.key==='spoon'&&L.category==='Pantry'));
    L.recipes=[...L.recipes];out.push(L)}
  out.sort((a,b)=>(a.staple-b.staple)||CATS.indexOf(a.category)-CATS.indexOf(b.category)||a.name.localeCompare(b.name));return out}

/* ================= budget summary ================= */
function budgetSummary(wk,wkKey){wk=wk||week();wkKey=wkKey||S.ui.weekKey;const s=S.settings;const L=buildList(wk,wkKey);
  const g={};GROUPS.forEach(x=>g[x]={actual:0,normalized:0});const meals={};MEAL_TYPES.forEach(m=>meals[m]=0);
  for(const l of L){if(l.atHome&&l.atHome.all)continue;const tot=Object.values(l.groups).reduce((a,b)=>a+b,0)||1;for(const k in l.groups){const share=l.groups[k]/tot*l.cost;g[k].actual+=share;if(!l.items.length)g[k].normalized+=share}const mt=Object.values(l.meals).reduce((a,b)=>a+b,0)||1;for(const m in l.meals)meals[m]+=l.meals[m]/mt*(l.groups.meals||0)/tot*l.cost}
  for(const it of Object.values(S.items)){const c=itemCosts(it);g[itemGroup(it)].normalized+=c.normalized}
  const actual=GROUPS.reduce((a,k)=>a+g[k].actual,0),normalized=GROUPS.reduce((a,k)=>a+g[k].normalized,0);
  const budget=+s.weeklyBudget||0,buffer=+s.buffer||0;
  const remaining=budget-buffer-actual;const nonMealNorm=GROUPS.filter(k=>k!=='meals').reduce((a,k)=>a+g[k].normalized,0);const availableForMeals=budget-buffer-nonMealNorm;
  const overBy=Math.max(0,actual+buffer-budget);
  const dueMulti=Object.values(S.items).filter(it=>isMulti(it)&&itemDue(it,wk,wkKey).due);
  const cand=L.filter(l=>!(l.atHome&&l.atHome.all)&&l.cost>0&&!l.staple).map(l=>({line:l,prio:l.priority||(l.items.length?'preferred':'essential'),pet:l.items.some(i=>i.kind==='pet')})).filter(c=>c.prio!=='essential'&&!(c.pet&&c.prio==='essential'));
  cand.sort((a,b)=>prioRank(b.prio)-prioRank(a.prio)||b.line.cost-a.line.cost);
  const suggestions=[];let saved=0;for(const c of cand){if(saved>=overBy)break;suggestions.push(c);saved+=c.line.cost}
  const reused=L.filter(l=>l.recipes.length>=2);const leftovers=planEntries(wk).filter(e=>e.type==='leftovers');const atHome=L.filter(l=>l.atHome);
  const essentialsDue=L.filter(l=>l.priority==='essential'&&l.items.length&&!(l.atHome&&l.atHome.all));
  const postponed=Object.values(S.items).filter(it=>(wk.buy||{})[it.id]===false);
  const spent=(wk.trips||[]).reduce((a,t)=>a+(+t.amount||0),0);
  return {lines:L,groups:g,meals,actual,normalized,budget,buffer,remaining,availableForMeals,overBy,dueMulti,suggestions,saved,reused,leftovers,atHome,essentialsDue,postponed,spent,toBuy:L.filter(l=>!(l.atHome&&l.atHome.all))}}
function dayNutrition(d,wk){wk=wk||week();let kcal=0,protein=0,n=0;for(const m of MEAL_TYPES)for(const e of slotEntries(wk,d,m)){let r=null;if(e.t==='r')r=S.recipes[e.id];else if(e.t==='l')r=S.recipes[e.of];if(!r||!r.nutrition)continue;kcal+=+r.nutrition.kcal||0;protein+=+r.nutrition.protein||0;n++}return {kcal,protein,n}}

/* ================= plan entries ================= */
function addEntry(day,meal,entry,replace,wk){const w=wk||week();w.slots=w.slots||{};w.slots[day]=w.slots[day]||{};const multi=['snack','drink','treat'].includes(meal);const cur=w.slots[day][meal]||[];w.slots[day][meal]=(replace&&!multi)?[entry]:[...cur,entry];return w}

/* ================= price memory (from confirmed receipts) ================= */
function robustUnitPrice(samples){const vals=(samples||[]).map(s=>+s.unitPrice).filter(v=>v>0);if(!vals.length)return null;const sorted=[...vals].sort((a,b)=>a-b);const med=sorted[Math.floor(sorted.length/2)];const kept=vals.length>=3?vals.filter(v=>Math.abs(v-med)/med<=0.4):vals;if(!kept.length)return med;const s2=[...kept].sort((a,b)=>a-b);return s2[Math.floor(s2.length/2)]}
function priceMemoryFor(cn,famKey){const p=S.prices&&S.prices[cn];if(!p||p.fam!==famKey)return null;const samples=(p.samples||[]).filter(s=>+s.unitPrice>0);const up=robustUnitPrice(samples);if(!up)return null;const last=samples[samples.length-1]||{},prev=samples[samples.length-2]||{};const changePct=prev.unitPrice?((+last.unitPrice-(+prev.unitPrice))/(+prev.unitPrice))*100:null;return {unitPrice:up,lastUnitPrice:+last.unitPrice||up,previousUnitPrice:+prev.unitPrice||null,changePct:Number.isFinite(changePct)?changePct:null,store:last.store||'',date:last.date||'',samples:samples.length,confidence:samples.length>=4?'high':samples.length>=2?'medium':'low'}}
function recordPrice(cn,famKey,unitPrice,store,date){if(!(unitPrice>0))return null;const p=S.prices[cn]&&S.prices[cn].fam===famKey?clone(S.prices[cn]):{id:cn,fam:famKey,samples:[]};p.samples.push({unitPrice:Math.round(unitPrice*1e6)/1e6,store:store||'',date:date||iso(today())});if(p.samples.length>8)p.samples=p.samples.slice(-8);p.updatedAt=Date.now();S.prices[cn]=p;return p}

/* ================= allergens & dietary ================= */
const ALLERGENS=['gluten','dairy','eggs','peanuts','tree nuts','soy','fish','shellfish','sesame'];
const ALLERGEN_WORDS={gluten:/\b(wheat|flour|bread|pasta|spaghetti|noodle|couscous|bulgur|barley|rye|breadcrumb|tortilla|wrap|pitta|pita|oat|oats|seitan|soy sauce)\b/i,dairy:/\b(milk|cheese|cheddar|parmesan|feta|halloumi|mozzarella|yogurt|yoghurt|butter|cream|ghee|paneer)\b/i,eggs:/\b(egg|eggs|mayonnaise|mayo|caesar dressing)\b/i,peanuts:/\b(peanut|peanuts|peanut butter|satay)\b/i,'tree nuts':/\b(almond|walnut|cashew|pecan|hazelnut|pistachio|macadamia|pine nut|nuts?)\b/i,soy:/\b(soy|soya|tofu|tempeh|edamame|miso|soy sauce)\b/i,fish:/\b(salmon|tuna|cod|haddock|anchov|sardine|mackerel|trout|fish)\b/i,shellfish:/\b(prawn|shrimp|crab|lobster|mussel|clam|scallop|oyster|squid)\b/i,sesame:/\b(sesame|tahini)\b/i};
function recipeAllergens(r){const found=new Set((r.allergens||[]).filter(a=>ALLERGENS.includes(a)));for(const i of (r.ingredients||[]))for(const a of ALLERGENS)if(ALLERGEN_WORDS[a].test(i.name||''))found.add(a);return [...found]}
function violatesAllergies(r,allergies){const al=(allergies||S.settings.allergies||[]);if(!al.length)return [];const has=recipeAllergens(r);return al.filter(a=>has.includes(a))}
function recipeDiets(r){const tags=new Set(r.tags||[]);const names=(r.ingredients||[]).map(i=>i.name||'').join(' ');const meat=/\b(chicken|beef|pork|turkey|mince|lamb|bacon|sausage|steak|ham)\b/i.test(names);const fish=ALLERGEN_WORDS.fish.test(names)||ALLERGEN_WORDS.shellfish.test(names);const dairy=ALLERGEN_WORDS.dairy.test(names);const eggs=ALLERGEN_WORDS.eggs.test(names);const gluten=ALLERGEN_WORDS.gluten.test(names);
  if(!meat&&!fish)tags.add('vegetarian');if(!meat&&!fish&&!dairy&&!eggs&&!/\bhoney\b/i.test(names))tags.add('vegan');if(!gluten)tags.add('gluten-free');if(!dairy)tags.add('dairy-free');if(r.nutrition&&+r.nutrition.protein>=25)tags.add('high-protein');return [...tags]}

/* ================= recipe defaults ================= */
function enrichRecipe(r){if(!r)return r;if(!r.mealTypes||!r.mealTypes.length)r.mealTypes=['dinner'];if(!r.source)r.source={type:r.id&&String(r.id).startsWith('s_')?'starter':'manual',name:r.id&&String(r.id).startsWith('s_')?'Plenty starter recipe':'My recipes'};if(r.prepMinutes==null&&r.cookMinutes==null&&r.minutes){r.prepMinutes=Math.max(2,Math.round(r.minutes*0.35));r.cookMinutes=Math.max(0,r.minutes-r.prepMinutes)}if(!r.minutes&&(r.prepMinutes||r.cookMinutes))r.minutes=(+r.prepMinutes||0)+(+r.cookMinutes||0);return r}
