/* ================= storage ================= */
const local={
  get(p){try{const v=localStorage.getItem('plenty:'+p);return v?JSON.parse(v):null}catch(e){return null}},
  set(p,d){try{localStorage.setItem('plenty:'+p,JSON.stringify(d))}catch(e){}},
  del(p){try{localStorage.removeItem('plenty:'+p)}catch(e){}},
  list(prefix){const out={};try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);const pre='plenty:'+prefix+'/';if(k&&k.startsWith(pre)){const id=k.slice(pre.length);if(!id.includes('/'))out[id]=JSON.parse(localStorage.getItem(k))}}}catch(e){}return out}
};
const queues={};
function writeDoc(path,data){
  if(db){const prev=queues[path]||Promise.resolve();const p=prev.then(()=>db.doc(path).set(clone(data))).catch(e=>{console.warn('write failed',path,e);toast(e&&e.code==='quota_exceeded'?'Storage is full. Delete old weeks or recipes.':'Could not save. Check your connection.')});queues[path]=p;return p}
  if(Store.backend&&Store.profileId)return Store.set(path,data).catch(e=>{console.warn('store write failed',path,e);toast('Could not save on this device.')});return Promise.resolve()}
function deleteDoc(path){
  if(db){const prev=queues[path]||Promise.resolve();const p=prev.then(()=>db.doc(path).delete()).catch(e=>{console.warn(e);toast('Could not delete.')});queues[path]=p;return p}
  if(Store.backend&&Store.profileId)return Store.del(path).catch(e=>{console.warn(e);toast('Could not delete.')});return Promise.resolve()}
function saveSettings(patch){Object.assign(S.settings,patch);render();return writeDoc('app/settings',S.settings)}
function saveRecipe(r){r.updatedAt=Date.now();S.recipes[r.id]=r;render();return writeDoc('recipes/'+r.id,r)}
function deleteRecipe(id){delete S.recipes[id];render();return deleteDoc('recipes/'+id)}
function saveItem(it){it.updatedAt=Date.now();S.items[it.id]=it;render();return writeDoc('items/'+it.id,it)}
function deleteItem(id){delete S.items[id];render();return deleteDoc('items/'+id)}
function saveInv(v){v.updatedAt=Date.now();S.inventory[v.id]=v;render();return writeDoc('inventory/'+v.id,v)}
function deleteInv(id){delete S.inventory[id];render();return deleteDoc('inventory/'+id)}
function saveWeek(k){k=k||S.ui.weekKey;const w=week(k);render();return writeDoc('weeks/'+k,w)}
function chat(k){k=k||S.ui.weekKey;return S.chats[k]||(S.chats[k]={turns:[]})}
function saveChat(k){k=k||S.ui.weekKey;const c=chat(k);if(c.turns.length>30)c.turns=c.turns.slice(-30);render();return writeDoc('chat/'+k,c)}

let unsubChat=null;
function subscribeChat(){const k=S.ui.weekKey;if(!db)return;if(unsubChat)unsubChat();
  unsubChat=db.doc('chat/'+k).onSnapshot(snap=>{if(snap.exists)S.chats[k]=clone(snap.data());render()},e=>console.warn('chat',e))}
function setWeek(k){S.ui.weekKey=k;subscribeChat();render()}

async function boot(){
  if(typeof applyTheme==='function')applyTheme(currentTheme());
  try{const h=location.hash.replace('#','');if(ALL_TABS.includes(h))S.ui.tab=h}catch(e){}
  window.addEventListener('hashchange',()=>{const h=location.hash.replace('#','');if(ALL_TABS.includes(h)&&h!==S.ui.tab&&S.ui.mode==='app'){S.ui.tab=h;renderNav();render()}});
  renderNav();render();
  const use=n=>(window.claude&&typeof window.claude.use==='function')?window.claude.use(n):Promise.resolve(null);
  use('sample').then(s=>{sampleFn=s;if(s){document.documentElement.classList.add('ai');render()}});
  db=await use('db');
  const col=(name,target)=>db.collection(name).onSnapshot(snap=>{const o={};snap.docs.forEach(d=>{o[d.id]=clone(d.data());o[d.id].id=d.id});S[target]=o;render()},e=>console.warn(name,e));
  if(db){S.ui.storage='cloud';
    db.doc('app/settings').onSnapshot(snap=>{if(snap.exists)S.settings={...DEFAULT_SETTINGS,...clone(snap.data()),targets:{...DEFAULT_SETTINGS.targets,...((snap.data()||{}).targets||{})}};S.loaded=true;renderNav();render()},e=>console.warn(e));
    col('recipes','recipes');col('items','items');col('inventory','inventory');col('prices','prices');
    db.doc('app/health').onSnapshot(snap=>{if(snap.exists)S.health={...EMPTY_HEALTH(),...clone(snap.data())};render()},e=>console.warn(e));
    db.doc('app/checkins').onSnapshot(snap=>{if(snap.exists)S.checkins=clone(snap.data());render()},e=>console.warn(e));
    db.doc('app/history').onSnapshot(snap=>{if(snap.exists)S.history={viewed:[],cooked:[],...clone(snap.data())};render()},e=>console.warn(e));
    db.collection('weeks').onSnapshot(snap=>{const o={};snap.docs.forEach(d=>{o[d.id]=clone(d.data())});for(const k in S.weeks)if(!o[k]&&S.weeks[k]&&hasContent(S.weeks[k]))o[k]=S.weeks[k];S.weeks=o;render()},e=>console.warn(e));
    subscribeChat();
  }else{
    let backend;try{backend=await new IdbBackend().open()}catch(e){console.warn('IndexedDB unavailable; using in-memory storage for this session',e);backend=await new MemoryBackend().open()}
    await Store.init(backend);S.ui.storage=backend.kind==='idb'?'device':'memory';
    const proto=detectPrototypeLocalData();let migratedFlag=null;try{migratedFlag=localStorage.getItem('plenty:migrated')}catch(e){}
    if(!Store.profileId){S.ui.mode=Store.registry.profiles.length?'pick':'onboarding';if(proto.count&&!migratedFlag)S.ui.ob.proto=proto;S.loaded=true;renderNav();render();registerPWA();return}
    await loadProfileState();S.loaded=true;S.ui.mode='app';renderNav();render();registerPWA();
    if(proto.count&&!migratedFlag)openPrototypeMigration(proto)}
}
async function loadProfileState(){const s=await Store.get('app/settings');S.settings={...DEFAULT_SETTINGS,...(s||{}),targets:{...DEFAULT_SETTINGS.targets,...((s||{}).targets||{})}};
  const withId=o=>{for(const k in o)if(o[k]&&typeof o[k]==='object')o[k].id=o[k].id||k;return o};
  S.recipes=withId(await Store.list('recipes'));S.items=withId(await Store.list('items'));S.inventory=withId(await Store.list('inventory'));S.weeks=await Store.list('weeks');S.prices=await Store.list('prices');S.chats=await Store.list('chat');
  const hh=await Store.get('app/history');S.history={viewed:[],cooked:[],...(hh||{})};const hp=await Store.get('app/health');S.health=hp?{...EMPTY_HEALTH(),...hp}:null;S.checkins=await Store.get('app/checkins')}
const hasContent=w=>Object.keys(w.slots||{}).length||(w.extras||[]).length||(w.trips||[]).length||Object.keys(w.buy||{}).length;
if(hot&&typeof hot.snapshot==='function')hot.snapshot(()=>({tab:S.ui.tab,weekKey:S.ui.weekKey}));

/* ================= render shell ================= */
const TABS=[['home','Home'],['plan','Plan'],['discover','Recipes'],['groceries','Groceries'],['athome','At Home']];           // primary navigation
const SECONDARY=[['items','Regular items & pets'],['recipes','Recipe box list'],['health','Weekly Check-in'],['settings','Settings']]; // utility menu
const MOBILE_MAIN=TABS.map(t=>t[0]);
const ALL_TABS=['home','plan','discover','recipes','groceries','items','athome','health','coach','settings'];
const navKeyFor=tab=>tab==='recipes'?'discover':tab;
function renderNav(){const rail=document.getElementById('rail');const shell=document.querySelector('.shell');if(S.ui.mode!=='app'){rail.innerHTML='';rail.style.display='none';if(shell)shell.style.gridTemplateColumns='1fr';return}rail.style.display='';if(shell)shell.style.gridTemplateColumns='';
  const ub=document.getElementById('utilbtn');if(ub){ub.hidden=false;ub.textContent=(S.settings.profileName||'P').trim()[0].toUpperCase()}const fab=document.getElementById('fab');if(fab){fab.hidden=false;fab.innerHTML=ICONS.coach+'<span>Ask Plenty</span>'}
  rail.innerHTML=`
    <div class="brand"><div class="mark">P</div><div class="name">Plenty</div></div>
    <div class="navgroup" role="navigation" aria-label="Main">${TABS.map(([k,l])=>`<button class="tab ${navKeyFor(S.ui.tab)===k?'on':''}" data-tab="${k}" aria-current="${navKeyFor(S.ui.tab)===k?'page':'false'}">${ICONS[k==='athome'?'home2':k]}<span>${l}</span></button>`).join('')}</div>
    <div class="spacer"></div>
    <div class="navgroup util" role="navigation" aria-label="More">${SECONDARY.filter(([k])=>k!=='settings'&&k!=='recipes').map(([k,l])=>`<button class="tab sm ${S.ui.tab===k?'on':''}" data-tab="${k}">${ICONS[k==='health'?'health':k]}<span>${l}</span></button>`).join('')}<button class="tab ${S.ui.tab==='settings'?'on':''}" data-tab="settings" aria-current="${S.ui.tab==='settings'?'page':'false'}">${ICONS.settings}<span>Settings</span></button></div>
    <div class="storage ${S.ui.storage}"><span class="dot"></span>${S.ui.storage==='cloud'?'Saved to your Claude account':S.ui.storage==='device'?'Saved privately on this device':'Not saved: this browser blocks local storage'}</div>`}
function render(){
  const m=document.getElementById('main');const scroll=window.scrollY;
  const active=document.activeElement,keepId=active&&active.id&&m.contains(active)?active.id:null;
  const sel=keepId&&active.selectionStart!=null?[active.selectionStart,active.selectionEnd]:null;
  const ub=document.getElementById('utilbtn'),fb=document.getElementById('fab');if(ub)ub.hidden=S.ui.mode!=='app';if(fb)fb.hidden=S.ui.mode!=='app';
  if(S.ui.mode==='onboarding'){m.innerHTML=viewOnboarding();window.scrollTo(0,0);return}if(S.ui.mode==='pick'){m.innerHTML=viewProfilePick();return}
  const views={home:viewHome,plan:viewPlan,discover:viewDiscover,recipes:viewRecipes,groceries:viewGroceries,items:viewItems,athome:viewAtHome,coach:viewCoach,health:viewHealth,settings:viewSettings};
  m.innerHTML=(views[S.ui.tab]||viewHome)();if(typeof hydrateImages==='function')hydrateImages();
  document.querySelectorAll('.tab[data-tab]').forEach(t=>t.classList.toggle('on',t.dataset.tab===navKeyFor(S.ui.tab)||t.dataset.tab===S.ui.tab));
  if(S.ui.mode==='app'){try{if(location.hash!=='#'+S.ui.tab)history.replaceState(null,'','#'+S.ui.tab)}catch(e){}}
  if(S.ui.assistantOpen&&typeof renderAssistant==='function')renderAssistant();if(S.ui.checkinOpen&&typeof renderCheckinModal==='function')renderCheckinModal();
  if(keepId){const el=document.getElementById(keepId);if(el){el.focus({preventScroll:true});if(sel&&el.setSelectionRange)try{el.setSelectionRange(sel[0],sel[1])}catch(e){}}}
  window.scrollTo(0,scroll)}
function weekHead(eyebrow){const mon=parseISO(S.ui.weekKey);const isThis=iso(mondayOf(today()))===S.ui.weekKey;
  return `<div class="eyebrow">${eyebrow}</div><div class="weeknav"><button class="btn icon ghost" data-action="week" data-n="-1" aria-label="Previous week">${ICONS.left}</button><h1>Week of ${fmtDate(mon)}</h1><button class="btn icon ghost" data-action="week" data-n="1" aria-label="Next week">${ICONS.right}</button>${isThis?'':'<button class="btn sm ghost" data-action="week-today">This week</button>'}</div>`}
const isEmptyData=()=>!Object.keys(S.recipes).length&&!Object.keys(S.items).length;
function starterEmpty(){return `<div class="empty"><h3>Start with a full week</h3><div>Load a starter set: 16 recipes across breakfast, lunch, dinner and snacks, regular groceries, ${esc(petName())}'s supplies and a stocked pantry. Everything can be edited or deleted.</div><div class="actions"><button class="btn primary" data-action="load-starter">Load starter data</button><button class="btn" data-action="new-recipe">Add a recipe</button></div></div>`}

/* ================= Home ================= */
function viewHome(){
  const B=budgetSummary();const s=S.settings;const wk=week();const t=today();const mon=parseISO(S.ui.weekKey);
  const pct=B.budget?Math.min(100,(B.actual+B.buffer)/B.budget*100):0;
  const ok=B.overBy<=0;
  const pets=Object.values(S.items).filter(i=>i.kind==='pet');
  const meals=activeMeals();const entries=planEntries();
  const plannedCount=m=>entries.filter(e=>e.meal===m).length;
  const shop=nextShopDate();
  const gb=s.groupBudgets||{};
  const groupRows=GROUPS.map(k=>{const a=B.groups[k].actual,n=B.groups[k].normalized;const mx=Math.max(B.budget||1,B.actual);return `<div class="row"><span>${esc(GROUP_LABEL(k))}${gb[k]?`<span class="faint small"> · suggested ${money(gb[k])}</span>`:''}</span><span class="num"><b>${money(a)}</b>${Math.abs(n-a)>0.5?`<span class="faint small"> · ${money(n)}/wk avg</span>`:''}</span><div class="bbar"><i class="${k==='pet'?'pet':''}" style="width:${Math.min(100,a/mx*100)}%"></i></div></div>`}).join('')
    +`<div class="row"><span>Budget buffer</span><span class="num"><b>${money(B.buffer)}</b></span><div class="bbar"><i class="buf" style="width:${Math.min(100,B.buffer/Math.max(B.budget||1,B.actual)*100)}%"></i></div></div>`;
  const hist=[];for(let i=7;i>=0;i--){const k=iso(addDays(mon,-7*i));const w=S.weeks[k];const sum=w?budgetSummary(w,k):null;hist.push({k,label:fmtDate(parseISO(k)),actual:sum?sum.spent:0,est:sum?sum.actual:0})}
  const hmax=Math.max(1,...hist.map(h=>Math.max(h.actual,h.est)),B.budget*1.1);
  return `${pwaBannerHtml()}
  <div class="head"><div>${weekHead('Overview')}<div class="sub">${entries.length?`${entries.length} planned eating moments · shopping ${fmtDate(shop)} · ${s.store?esc(s.store):'any store'}`:'Nothing planned yet this week.'}</div></div>
    <div class="actions"><button class="btn" data-action="tab" data-tab="groceries">${ICONS.groceries} Grocery list</button><button class="btn primary ai-only" data-action="assistant">${ICONS.spark} Ask Plenty</button></div></div>
  ${isEmptyData()?starterEmpty()+'<div style="height:14px"></div>':''}
  <div class="tiles">
    <div class="tile hi"><div class="eyebrow">Weekly budget</div><div class="v num">${money(B.budget)}</div><div class="d">everything from the store</div></div>
    <div class="tile ${ok?'':'bad'}"><div class="eyebrow">Estimated checkout</div><div class="v num">${money(B.actual)}</div><div class="d">${B.toBuy.length} lines to buy · ${money(B.buffer)} buffer kept</div></div>
    <div class="tile"><div class="eyebrow">Normalized weekly</div><div class="v num">${money(B.normalized)}</div><div class="d">long-lasting items spread over their life</div></div>
    <div class="tile ${B.remaining<0?'bad':''}"><div class="eyebrow">${B.remaining>=0?'Remaining':'Over budget'}</div><div class="v num">${money(Math.abs(B.remaining))}</div><div class="d">after buffer${B.spent?` · ${money(B.spent)} spent so far`:''}</div></div>
  </div>
  <div class="card pad" style="margin-bottom:14px">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline"><h3>Where the week's money goes</h3><span class="small muted num">${Math.round(pct)}% of budget committed</span></div>
    <div class="stack" style="margin:12px 0 6px" role="img" aria-label="Budget split">${GROUPS.map(k=>`<i style="width:${B.groups[k].actual/Math.max(B.budget,B.actual+B.buffer,1)*100}%;background:${k==='pet'?'var(--pet)':k==='meals'?'var(--accent)':k==='staples'?'var(--accent-line)':k==='snacks'?'var(--warn)':k==='household'?'var(--ink3)':'var(--line2)'}" title="${esc(GROUP_LABEL(k))}: ${money(B.groups[k].actual)}"></i>`).join('')}<i style="width:${B.buffer/Math.max(B.budget,B.actual+B.buffer,1)*100}%;background:repeating-linear-gradient(45deg,var(--line2) 0 3px,transparent 3px 6px)" title="Buffer"></i></div>
    <div class="bd" style="margin-top:10px">${groupRows}
      <div class="kv total"><span>Total estimated grocery spend</span><b class="num">${money(B.actual)}</b></div>
      <div class="kv"><span>Available for planned recipes<span class="sub">budget − buffer − normalized cost of everything else</span></span><b class="num">${money(B.availableForMeals)}</b></div>
      <div class="kv"><span>Recipes in the plan cost</span><b class="num ${B.groups.meals.actual>B.availableForMeals?'':''}" style="${B.groups.meals.actual>B.availableForMeals?'color:var(--bad)':''}">${money(B.groups.meals.actual)}</b></div>
    </div>
    ${B.dueMulti.length?`<div class="note warn" style="margin-top:12px">${B.dueMulti.map(i=>`<b>${esc(i.name)}</b> (${money(i.packagePrice)}, lasts about ${Math.round(petStatus(i).weeksPer)} weeks)`).join(' and ')} must be bought this week, so checkout is higher than the normalized ${money(B.normalized)}. Adjust optional items rather than ${esc(petName())}'s essentials.</div>`:''}
    ${B.overBy>0?`<div class="note bad" style="margin-top:12px"><b>${money(B.overBy)} over</b> (including the buffer). ${B.suggestions.length?`Postponing ${B.suggestions.map(c=>`<b>${esc(c.line.name)}</b> (${money(c.line.cost)}, ${c.prio})`).join(', ')} would save ${money(B.saved)}. Essentials and ${esc(petName())}'s food are never suggested.`:'Nothing optional left to trim; consider a cheaper recipe.'} <button class="btn sm" data-action="tab" data-tab="groceries" style="margin-left:6px">Review list</button></div>`:''}
  </div>
  <div class="grid2" style="margin-bottom:14px">
    <div class="card pad"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h3>Food plan</h3><button class="btn sm ghost" data-action="tab" data-tab="plan">Open plan</button></div>
      <div class="progress" style="margin:8px 0 12px">${meals.map(m=>`<span><b>${plannedCount(m)}</b>/${s.targets[m]} ${plural(m,s.targets[m])}</span>`).join('')}</div>
      <div class="list" style="border-top:1px solid var(--line)">${[...Array(7).keys()].map(d=>{const es=entries.filter(e=>e.day===d);const isT=iso(addDays(mon,d))===iso(t);return `<div class="li" style="align-items:flex-start"><span style="width:38px;font-weight:600;${isT?'color:var(--accent)':''}">${DAYS[d]}</span><span class="grow" style="display:flex;flex-wrap:wrap;gap:4px">${es.length?es.map(e=>`<span class="chip ${e.type==='leftovers'?'warn':e.type==='item'?'':'acc'}" title="${MEAL_LABEL[e.meal]}">${e.type==='recipe'?esc(e.recipe.name):e.type==='leftovers'?'Leftovers'+(e.recipe?': '+esc(e.recipe.name):''):esc(e.item.name)}</span>`).join(''):'<span class="faint small">—</span>'}</span></div>`}).join('')}</div>
      <div class="small muted" style="margin-top:10px">${B.leftovers.length} leftover meal${B.leftovers.length===1?'':'s'} planned · ${B.reused.length} ingredient${B.reused.length===1?'':'s'} reused across recipes${B.reused.length?': '+B.reused.slice(0,5).map(l=>esc(l.name)).join(', ')+(B.reused.length>5?'…':''):''}</div>
    </div>
    <div class="card pad"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h3>${esc(petName())}</h3><button class="btn sm ghost" data-action="tab" data-tab="items">Manage</button></div>
      ${pets.length?`<div class="list" style="margin-top:8px">${pets.map(i=>{const st=isMulti(i)?petStatus(i):null;const d=itemDue(i);return `<div class="li" style="padding-left:0;padding-right:0"><span class="pri ${i.priority||'preferred'}" title="${i.priority}"></span><span class="grow"><b>${esc(i.name)}</b>${i.brand?` <span class="faint small">${esc(i.brand)}</span>`:''}<small>${st?`${fmtBase(st.remaining,famOf(i.packageUnit))} left · ${st.daysLeft<1?'run out':'runs out '+fmtDate(st.runOut)} · ${money(st.weekly)}/wk avg`:esc(d.why)}</small>${st?`<div class="meter"><i class="pet ${st.pct<20?'over':''}" style="width:${st.pct}%"></i></div>`:''}</span><span class="chip ${d.due?'pet':''}">${d.due?'Buy this week':'Stocked'}</span></div>`}).join('')}</div>
      <div class="small muted" style="margin-top:10px">Actual this week ${money(B.groups.pet.actual)} · average ${money(B.groups.pet.normalized)} a week. Kept separate from your own nutrition.</div>`
      :`<div class="empty" style="margin-top:8px"><div>No pet supplies yet.</div><div class="actions"><button class="btn sm" data-action="new-item" data-kind="pet">Add ${esc(petName())}'s food</button></div></div>`}
    </div>
    ${weeklyCheckinCardHtml()}
    <div class="card pad"><h3>Essentials due this week</h3>
      ${B.essentialsDue.length?`<div class="list" style="margin-top:8px">${B.essentialsDue.map(l=>`<div class="li" style="padding-left:0;padding-right:0"><span class="pri essential"></span><span class="grow">${esc(l.name)}<small>${esc(l.sources.join(', '))}</small></span><span class="amt num">${money(l.cost)}</span></div>`).join('')}</div>`:'<p class="small muted" style="margin-top:8px">No essential recurring items are due. Mark items essential on the Items tab.</p>'}
      ${B.postponed.length?`<div class="note" style="margin-top:10px">Postponed this week: ${B.postponed.map(i=>esc(i.name)).join(', ')}.</div>`:''}
    </div>
    <div class="card pad"><h3>Already at home</h3>
      ${B.atHome.length?`<p class="small muted" style="margin:6px 0 8px">${B.atHome.filter(a=>a.atHome.all).length} list lines skipped and ${B.atHome.filter(a=>!a.atHome.all).length} reduced because you have them.</p><div style="display:flex;flex-wrap:wrap;gap:6px">${B.atHome.map(l=>`<span class="chip good" title="${esc(l.atHome.label)}">${esc(l.name)}</span>`).join('')}</div>`:'<p class="small muted" style="margin-top:8px">Nothing on this week\'s list is in your At Home inventory yet.</p>'}
      <div class="actions" style="margin-top:10px"><button class="btn sm" data-action="tab" data-tab="athome">Update At Home</button></div>
    </div>
  </div>
  <div class="grid2">
    <div class="card pad"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h3>Shops this week</h3><span class="actions"><button class="btn sm ai-only" data-action="receipt-scan">${ICONS.spark} Scan receipt</button><button class="btn sm primary" data-action="log-shop" data-amount="${B.actual.toFixed(2)}">${ICONS.plus} Log checkout</button></span></div>
      ${(wk.trips||[]).length?`<div class="list" style="margin-top:8px">${[...wk.trips].sort((a,b)=>b.date.localeCompare(a.date)).map(tr=>`<div class="li" style="padding-left:0;padding-right:0"><span class="num small muted" style="width:56px">${fmtDate(parseISO(tr.date))}</span><span class="grow">${esc(tr.store||'Shop')}${tr.note?`<small>${esc(tr.note)}</small>`:''}</span><span class="amt num">${money(tr.amount)}</span>${tr.imageId?`<button class="btn sm ghost" data-action="trip-photo" data-id="${esc(tr.id)}">Photo</button>`:''}<button class="btn icon ghost" data-action="del-trip" data-id="${esc(tr.id)}" aria-label="Delete receipt">${ICONS.x}</button></div>`).join('')}<div class="kv total"><span>Actual spent</span><b class="num">${money(B.spent)}</b></div><div class="kv"><span>Versus estimate</span><b class="num" style="${B.spent>B.actual?'color:var(--bad)':'color:var(--good)'}">${B.spent>B.actual?'+':'−'}${money(Math.abs(B.spent-B.actual))}</b></div><div class="kv"><span>${B.spent+B.buffer>B.budget?'Over weekly budget':'Under weekly budget'}</span><b class="num" style="color:${B.spent+B.buffer>B.budget?'var(--bad)':'var(--good)'}">${money(Math.abs(B.budget-B.buffer-B.spent))}</b></div></div>${(()=>{const ct=receiptCategoryTotals(wk.trips);const ks=Object.keys(ct).sort((a,b)=>ct[b]-ct[a]);if(!ks.length)return '';const mx=Math.max(...ks.map(k=>ct[k]));return `<div class="eyebrow" style="margin:12px 0 6px">Actual spend by category</div><div class="bd">${ks.map(k=>`<div class="row"><span>${esc(k)}</span><span class="num"><b>${money(ct[k])}</b></span><div class="bbar"><i class="${k==='Pet'?'pet':''}" style="width:${ct[k]/mx*100}%"></i></div></div>`).join('')}</div>`})()}`
      :`<p class="small muted" style="margin-top:8px">After shopping, log the receipt total. It is pre-filled with the estimate so you can compare.</p>`}
    </div>
    <div class="card pad"><div style="display:flex;justify-content:space-between;gap:10px"><h3>Last eight weeks</h3><span class="small faint">budget ${money(B.budget)}</span></div>
      <div class="plot"><div class="ref" style="bottom:${Math.min(96,B.budget/hmax*100)}%"><span>budget</span></div>
      <div class="bars">${hist.map(h=>`<button class="bar ${h.k===S.ui.weekKey?'show':''}" data-action="goto-week" data-k="${h.k}" title="${h.label}: spent ${money(h.actual)}, estimate ${money(h.est)}"><span class="v num">${h.actual?money(h.actual):h.est?money(h.est):''}</span><span class="pair"><i class="est" style="height:${Math.max(2,h.est/hmax*100)}%"></i><i class="${h.actual>B.budget?'over':''}" style="height:${Math.max(2,h.actual/hmax*100)}%"></i></span><span class="l">${h.label.split(' ')[0]}</span></button>`).join('')}</div></div>
      <div class="legend" style="margin-top:8px"><span><i class="est"></i>Estimate</span><span><i></i>Actual checkout</span><span><i class="ref"></i>Weekly budget</span></div>
    </div>
  </div>`}

/* ================= Plan ================= */
function viewPlan(){
  const mon=parseISO(S.ui.weekKey),t=today(),wk=week();const meals=activeMeals();const entries=planEntries();const B=budgetSummary();
  const n=Object.keys(S.recipes).length;
  return `
  <div class="head"><div>${weekHead('Food plan')}<div class="sub">For <b>${S.settings.people}</b> · ${meals.map(m=>`${entries.filter(e=>e.meal===m).length}/${S.settings.targets[m]} ${plural(m,S.settings.targets[m])}`).join(' · ')}</div></div>
    <div class="actions"><button class="btn ghost" data-action="clear-week" ${entries.length?'':'disabled'}>Clear week</button><button class="btn" data-action="shuffle-week" ${n?'':'disabled'}>Fill empty slots</button><button class="btn primary" data-action="tab" data-tab="discover">${ICONS.search} Find recipes</button><button class="btn ai-only" data-action="assistant" data-draft="Plan my week within budget with breakfast, lunch, dinner and snacks.">${ICONS.spark} Ask Plenty</button></div></div>
  <div class="tiles">
    <div class="tile"><div class="eyebrow">Recipes in plan</div><div class="v num">${money(B.groups.meals.actual)}</div><div class="d">of ${money(B.availableForMeals)} available after essentials and buffer</div></div>
    <div class="tile ${B.overBy>0?'bad':''}"><div class="eyebrow">Whole week checkout</div><div class="v num">${money(B.actual)}</div><div class="d">budget ${money(B.budget)} · buffer ${money(B.buffer)}</div></div>
    <div class="tile"><div class="eyebrow">Leftovers planned</div><div class="v num">${B.leftovers.length}</div><div class="d">cook once, eat again</div></div>
    <div class="tile"><div class="eyebrow">Ingredients reused</div><div class="v num">${B.reused.length}</div><div class="d">${B.reused.slice(0,3).map(l=>esc(l.name)).join(', ')||'across recipes'}</div></div>
  </div>
  ${n?'':starterEmpty()+'<div style="height:14px"></div>'}
  <div class="days">${[...Array(7).keys()].map(d=>{const date=addDays(mon,d),isT=iso(date)===iso(t),nut=dayNutrition(d);const pct=Math.min(100,Math.round(nut.kcal/(S.settings.kcalTarget||2000)*100));
    return `<section class="day ${isT?'today':''}"><div class="dh"><b>${DAYS_LONG[d]}</b><span class="date">${isT?'Today':fmtDate(date)}</span></div><div class="slots">
      ${meals.map(m=>{const es=slotEntries(wk,d,m);const multi=['snack','drink','treat'].includes(m);
        return `<div class="slot ${es.length?'filled':''}"><div class="ml"><span>${m}</span>${es.length&&(multi||true)?`<button class="addmini" data-action="pick" data-day="${d}" data-meal="${m}" data-add="1" title="Add another">+</button>`:''}</div>
        ${es.map((e,i)=>{
          if(e.t==='r'){const r=S.recipes[e.id];if(!r)return `<div class="ent"><div class="rn"><span class="muted small">Deleted recipe</span><button class="rm" data-action="rm-entry" data-day="${d}" data-meal="${m}" data-i="${i}">×</button></div></div>`;const sv=e.sv||S.settings.people||1;
            return `<div class="ent"><div class="rn"><button class="nm" data-action="open-recipe" data-id="${r.id}">${esc(r.name)}</button><button class="rm" data-action="rm-entry" data-day="${d}" data-meal="${m}" data-i="${i}" aria-label="Remove">×</button></div><div class="meta"><span>${r.minutes||'?'} min</span>${r.nutrition?`<span>${r.nutrition.kcal} kcal</span>`:''}<span class="num">${money(recipeCost(r)*sv)}</span><span class="stepper" title="Servings to cook"><button data-action="serv" data-day="${d}" data-meal="${m}" data-i="${i}" data-n="-1">−</button><span>×${sv}</span><button data-action="serv" data-day="${d}" data-meal="${m}" data-i="${i}" data-n="1">+</button></span>${d<6?`<button class="btn sm ghost" style="padding:1px 5px;font-size:11.5px" data-action="leftover-next" data-day="${d}" data-meal="${m}" data-id="${r.id}" title="Plan leftovers for tomorrow's ${m==='dinner'?'lunch':m}">leftovers →</button>`:''}</div></div>`}
          if(e.t==='l'){const of=S.recipes[e.of];return `<div class="ent left"><div class="rn"><span>Leftovers${of?`: ${esc(of.name)}`:''}</span><button class="rm" data-action="rm-entry" data-day="${d}" data-meal="${m}" data-i="${i}" aria-label="Remove">×</button></div>${of&&of.nutrition?`<div class="meta"><span>${of.nutrition.kcal} kcal</span><span>no extra cost</span></div>`:''}</div>`}
          const it=S.items[e.id];return `<div class="ent item"><div class="rn"><span>${it?esc(it.name):'Deleted item'}</span><button class="rm" data-action="rm-entry" data-day="${d}" data-meal="${m}" data-i="${i}" aria-label="Remove">×</button></div>${it?`<div class="meta"><span>regular item · ${esc(itemDue(it).due?'on the list':itemDue(it).why.toLowerCase())}</span></div>`:''}</div>`}).join('')}
        ${es.length?'':`<button class="add" data-action="pick" data-day="${d}" data-meal="${m}">${ICONS.plus} Add ${m}</button>`}</div>`}).join('')}
      </div><div class="df">${nut.n?`<span class="num"><b>${nut.kcal}</b> kcal · <b>${nut.protein}</b> g protein</span> <span class="faint">from ${nut.n} recipe meal${nut.n===1?'':'s'}</span><div class="meter"><i style="width:${pct}%" class="${nut.kcal>S.settings.kcalTarget*1.1?'over':''}"></i></div>`:'<span class="faint">No recipe meals yet</span>'}</div></section>`}).join('')}</div>`}

/* ================= Recipes ================= */
function recipeList(){return Object.values(S.recipes).sort((a,b)=>(b.favorite?1:0)-(a.favorite?1:0)||a.name.localeCompare(b.name))}
function viewRecipes(){
  const q=S.ui.q.trim().toLowerCase(),tag=S.ui.tag,mf=S.ui.mealFilter;const all=recipeList();
  const list=all.filter(r=>(!q||r.name.toLowerCase().includes(q)||(r.ingredients||[]).some(i=>i.name.toLowerCase().includes(q)))&&(!tag||(r.tags||[]).includes(tag))&&(!mf||(r.mealTypes||['dinner']).includes(mf)));
  const usedTags=TAGS.filter(t=>all.some(r=>(r.tags||[]).includes(t)));
  return `<div class="head"><div><div class="eyebrow">Recipe box</div><h1>${all.length} recipe${all.length===1?'':'s'}</h1><div class="sub">Cost per serving comes from the ingredient prices, so it changes when prices do.</div></div>
    <div class="actions"><button class="btn" data-action="tab" data-tab="discover">${ICONS.search} Discover</button><button class="btn" data-action="url-import">Import from URL</button><button class="btn primary" data-action="create-chooser">${ICONS.plus} Create recipe</button></div></div>
  <div class="toolbar"><div class="search">${ICONS.search}<input id="rq" placeholder="Search recipes or ingredients" value="${esc(S.ui.q)}" data-input="q"></div></div>
  <div class="tagrow"><button class="tag pick ${!mf?'on':''}" data-action="mealf" data-m="">All meals</button>${MEAL_TYPES.map(m=>`<button class="tag pick ${mf===m?'on':''}" data-action="mealf" data-m="${m}">${MEAL_LABEL[m]}</button>`).join('')}</div>
  ${usedTags.length?`<div class="tagrow"><button class="tag pick ${!tag?'on':''}" data-action="tag" data-tag="">Any tag</button>${usedTags.map(t=>`<button class="tag pick ${tag===t?'on':''}" data-action="tag" data-tag="${t}">${t}</button>`).join('')}</div>`:''}
  ${all.length===0?starterEmpty():list.length===0?`<div class="empty"><h3>Nothing matches</h3><div>Try another word or clear the filters.</div></div>`
  :`<div class="rgrid">${list.map(r=>`<button class="rc" data-action="open-recipe" data-id="${r.id}"><div class="rn">${r.favorite?'<span class="fav">★</span> ':''}${esc(r.name)}</div>
    <div class="stats num"><span>${r.minutes||'?'} min</span><span>${r.nutrition&&r.nutrition.kcal?r.nutrition.kcal+' kcal':'— kcal'}</span><span>${money(recipeCost(r))} / serving</span><span>makes ${r.servings}</span></div>
    <div class="tags">${(r.mealTypes||['dinner']).map(m=>`<span class="tag" style="background:var(--accent-soft);color:var(--accent)">${MEAL_LABEL[m]}</span>`).join('')}${(r.tags||[]).slice(0,3).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div></button>`).join('')}</div>`}`}

/* ================= Groceries ================= */
function viewGroceries(){
  const B=budgetSummary();const L=B.lines;const toBuy=L.filter(l=>!(l.atHome&&l.atHome.all)&&!l.staple);const staples=L.filter(l=>l.staple&&!(l.atHome&&l.atHome.all));const home=L.filter(l=>l.atHome&&l.atHome.all);
  const done=toBuy.filter(l=>l.checked);const groups={};for(const l of toBuy)(groups[l.category]=groups[l.category]||[]).push(l);
  const line=l=>`<div class="gi ${l.checked?'done':''}"><label><input type="checkbox" data-action="check" data-key="${esc(l.key)}" ${l.checked?'checked':''}><span class="q num">${esc(fmtBase(l.needBase,l.fam))}</span><span class="n">${l.priority?`<span class="pri ${l.priority}" title="${l.priority}"></span> `:''}${esc(l.name)}${l.pack?` <span class="faint small">· ${esc(l.pack)}</span>`:''}<small>${esc(l.sources.join(', '))}${l.atHome?` · ${esc(l.atHome.label)}`:''}${l.items.length&&l.items[0].store?` · ${esc(l.items[0].store)}`:''}</small></span></label><span class="price num">${l.cost?money(l.cost):''}</span>${l.items.length?`<button class="mini" data-action="postpone" data-id="${esc(l.items[0].id)}" title="Skip this week">Postpone</button>`:l.extras?`<button class="mini" data-action="remove-extra" data-id="${esc(l.extras[0].id)}">Remove</button>`:`<button class="mini" data-action="have-line" data-name="${esc(l.name)}" data-cat="${esc(l.category)}" title="I already have this">Have it</button>`}</div>`;
  return `<div class="head"><div>${weekHead('Grocery list')}<div class="sub">${toBuy.length?`${done.length} of ${toBuy.length} picked up · one line per product · ${home.length} already at home`:'Plan meals or add items and the list builds itself.'}</div></div>
    <div class="actions"><button class="btn ghost" data-action="uncheck-all" ${done.length?'':'disabled'}>Uncheck all</button><button class="btn" data-action="copy-list" ${toBuy.length?'':'disabled'}>Copy list</button><button class="btn primary" data-action="log-shop" data-amount="${B.actual.toFixed(2)}">Log checkout</button></div></div>
  <div class="gwrap"><div>
    ${toBuy.length===0&&staples.length===0?`<div class="empty"><h3>Nothing to buy</h3><div>Add meals on the Plan tab, or an item on the right.</div></div>`:''}
    ${CATS.filter(c=>groups[c]).map(c=>`<section class="aisle card"><div class="ah"><span class="eyebrow">${c}</span><span class="small faint num">${money(groups[c].reduce((a,l)=>a+l.cost,0))}</span></div>${groups[c].map(line).join('')}</section>`).join('')}
    ${staples.length?`<section class="aisle card"><div class="ah"><span class="eyebrow">Pantry staples · check before you go</span><span class="small faint">used in recipes</span></div>${staples.map(line).join('')}</section>`:''}
    ${home.length?`<section class="aisle card" style="opacity:.8"><div class="ah"><span class="eyebrow">Already at home · not on the list</span><span class="small faint">${home.length}</span></div>${home.map(l=>`<div class="gi home"><span class="q num">${esc(fmtBase(l.qty,l.fam))}</span><span class="n">${esc(l.name)}<small>${esc(l.atHome.label)} · ${esc(l.sources.join(', '))}</small></span><button class="mini" data-action="need-line" data-canon="${esc(l.canon)}">Actually need it</button></div>`).join('')}</section>`:''}
    ${B.postponed.length?`<section class="aisle card" style="opacity:.8"><div class="ah"><span class="eyebrow">Postponed this week</span></div>${B.postponed.map(i=>`<div class="gi home"><span class="n">${esc(i.name)}<small>${esc(itemGroup(i)==='pet'?petName():i.category)} · ${money(itemCosts(i).actual)}</small></span><button class="mini" data-action="unpostpone" data-id="${i.id}">Put back</button></div>`).join('')}</section>`:''}
  </div>
  <aside class="side">
    <div class="card"><div class="eyebrow">This week</div>
      ${GROUPS.filter(k=>B.groups[k].actual>0).map(k=>`<div class="kv"><span>${esc(GROUP_LABEL(k))}</span><b class="num">${money(B.groups[k].actual)}</b></div>`).join('')}
      <div class="kv"><span>Buffer</span><b class="num">${money(B.buffer)}</b></div>
      <div class="kv total"><span>Estimated checkout</span><b class="num">${money(B.actual)}</b></div>
      <div class="kv"><span>${B.remaining>=0?'Under budget by':'Over budget by'}</span><b class="num" style="color:${B.remaining>=0?'var(--good)':'var(--bad)'}">${money(Math.abs(B.remaining))}</b></div>
      ${(()=>{const notes=listHealthNotes(L);return notes.length?`<div class="eyebrow" style="margin:10px 0 4px">Health notes</div><div style="display:flex;flex-wrap:wrap;gap:4px">${notes.map(n=>`<span class="chip ${/No |more sweets|Most proteins|reduce/.test(n)?'acc':'good'}">${esc(n)}</span>`).join('')}</div><div class="small faint" style="margin-top:4px">Notes only; nothing is removed from the list. <button class="btn sm ghost" data-action="tab" data-tab="health" style="padding:1px 5px">Health check</button></div>`:''})()}
      ${B.overBy>0&&B.suggestions.length?`<div class="note bad" style="margin-top:8px">Try postponing ${B.suggestions.map(c=>`<b>${esc(c.line.name)}</b>`).join(', ')} to save ${money(B.saved)}.</div>`:''}
    </div>
    <form class="card inline" id="extraForm" autocomplete="off"><div class="eyebrow">Add a one-off item</div>
      <div class="field"><label for="xn">Item</label><input id="xn" name="name" placeholder="e.g. birthday candles, lemons" required></div>
      <div class="row"><div class="field"><label for="xq">Qty</label><input id="xq" name="qty" type="number" step="any" min="0" placeholder="1"></div><div class="field"><label for="xu">Unit</label><select id="xu" name="unit">${UNITS.map(u=>`<option value="${u}" ${u==='pcs'?'selected':''}>${u||'—'}</option>`).join('')}</select></div></div>
      <div class="row"><div class="field"><label for="xa">Category</label><select id="xa" name="category">${CATS.map(a=>`<option>${a}</option>`).join('')}</select></div><div class="field"><label for="xp">Price (${esc(S.settings.currency)})</label><input id="xp" name="price" type="number" step="0.01" min="0" placeholder="0.00"></div></div>
      <div class="field"><label for="xpr">Priority</label><select id="xpr" name="priority">${PRIOS.map(p=>`<option ${p==='optional'?'selected':''}>${p}</option>`).join('')}</select></div>
      <button class="btn" type="submit">Add to list</button>
      <div class="small faint">Repeats every week? Add it on the Items tab instead.</div></form>
  </aside></div>`}
