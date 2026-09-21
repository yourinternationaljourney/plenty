/* ================= misc ================= */
let toastT=null;function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),3400)}
function shuffleWeek(){const list=recipeList();if(!list.length)return;const wk=week();const people=S.settings.people||1;const used=new Set(planEntries().filter(e=>e.type==='recipe').map(e=>e.recipe.id));let n=0;
  const order=['dinner','lunch','breakfast','snack','treat','drink'].filter(m=>activeMeals().includes(m));
  const pick=pool=>{const fresh=pool.filter(r=>!used.has(r.id));const src=fresh.length?fresh:pool;const r=src[Math.floor(Math.random()*src.length)];used.add(r.id);return r};
  for(const m of order){const target=+S.settings.targets[m]||0;let have=planEntries().filter(e=>e.meal===m).length;const pool=list.filter(r=>(r.mealTypes||['dinner']).includes(m));
    if(m==='lunch'){for(let d=1;d<7&&have<target;d++){if(slotEntries(wk,d,m).length)continue;const din=slotEntries(wk,d-1,'dinner').find(e=>e.t==='r'&&S.recipes[e.id]&&(S.recipes[e.id].servings||1)>=2);
        if(din&&d%2===1){addEntry(d,m,{t:'l',of:din.id},true);if((din.sv||people)<people*2)din.sv=people*2;have++;n++}else if(pool.length){addEntry(d,m,{t:'r',id:pick(pool).id,sv:people},true);have++;n++}}
      for(let d=0;d<7&&have<target;d++){if(slotEntries(wk,d,m).length||!pool.length)continue;addEntry(d,m,{t:'r',id:pick(pool).id,sv:people},true);have++;n++}continue}
    if(!pool.length)continue;
    if(m==='breakfast'){const r=pick(pool);for(let d=0;d<7&&have<target;d++){if(slotEntries(wk,d,m).length)continue;addEntry(d,m,{t:'r',id:r.id,sv:people},true);have++;n++}continue}
    for(let d=0;d<7&&have<target;d++){if(slotEntries(wk,d,m).length)continue;addEntry(d,m,{t:'r',id:pick(pool).id,sv:people},true);have++;n++}}
  saveWeek();toast(n?`Filled ${n} slot${n===1?'':'s'}`:'Nothing to fill')}
async function loadStarter(){let n=0;const put=(coll,arr,target)=>{for(const o of arr){if(target[o.id])continue;const c=clone(o);c.createdAt=Date.now();if(c.lastBought)c.lastBought=iso(addDays(today(),-7));if(c.remainingAsOf)c.remainingAsOf=iso(today());target[c.id]=c;n++;writeDoc(coll+'/'+c.id,c)}};
  put('recipes',STARTER.recipes,S.recipes);put('items',STARTER.items.filter(it=>it.kind!=='pet'),S.items);put('inventory',STARTER.inventory,S.inventory);render();toast(n?`Loaded ${n} starter entries`:'Starter data is already loaded')}

/* ================= events ================= */
document.getElementById('rail').addEventListener('click',e=>{const m=e.target.closest('[data-action="more"]');if(m){openMore();return}const b=e.target.closest('[data-tab]');if(!b)return;S.ui.tab=b.dataset.tab;renderNav();render();window.scrollTo(0,0)});
document.getElementById('modal').addEventListener('click',e=>{if(e.target.matches('.overlay')||e.target.closest('[data-close]')){closeModal();return}const b=e.target.closest('[data-action]');if(b)handleAction(b,e)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalOpen())closeModal();if(e.key==='Enter'&&!e.shiftKey&&e.target.id==='chatIn'){e.preventDefault();sendChat(e.target.value)}});
const main=document.getElementById('main');
main.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.matches('input[type=checkbox]'))return;handleAction(b,e)});
main.addEventListener('change',e=>{const t=e.target;
  if(t.matches('[data-action="check"]')){const w=week();w.checked=w.checked||{};if(t.checked)w.checked[t.dataset.key]=true;else delete w.checked[t.dataset.key];saveWeek();return}
  if(t.dataset.setting){let v=t.value;if(t.type==='number'||t.dataset.setting==='shopDay'){v=parseFloat(v);if(isNaN(v))return;if(t.dataset.setting==='people')v=Math.max(1,Math.min(12,Math.round(v)))}saveSettings({[t.dataset.setting]:v});toast('Saved');return}
  if(t.dataset.groupBudget){const gb={...(S.settings.groupBudgets||{})};const v=parseFloat(t.value);if(isNaN(v))delete gb[t.dataset.groupBudget];else gb[t.dataset.groupBudget]=v;saveSettings({groupBudgets:gb});return}
  if(t.dataset.allergy){const set=new Set(S.settings.allergies||[]);if(t.checked)set.add(t.dataset.allergy);else set.delete(t.dataset.allergy);saveSettings({allergies:ALLERGENS.filter(a=>set.has(a))});toast('Allergies saved and enforced');return}
  if(t.dataset.target){const tg={...S.settings.targets};tg[t.dataset.target]=Math.max(0,Math.min(21,Math.round(parseFloat(t.value)||0)));saveSettings({targets:tg});return}});
main.addEventListener('input',e=>{if(e.target.dataset.ob||e.target.dataset.obm||e.target.dataset.oba||e.target.dataset.obg||e.target.dataset.obb){obRead();return}if(e.target.dataset.input==='q'){S.ui.q=e.target.value;render()}if(e.target.dataset.input==='dq'){discSearchInput(e.target.value)}if(e.target.dataset.input==='chat'){S.ui.chatDraft=e.target.value;e.target.style.height='auto';e.target.style.height=Math.min(160,e.target.scrollHeight)+'px'}});
main.addEventListener('submit',e=>{e.preventDefault();const f=e.target;
  if(f.id==='extraForm'){const name=f.name.value.trim();if(!name)return;const w=week();w.extras=w.extras||[];w.extras.push({id:uid('x'),name,qty:parseFloat(f.qty.value)||1,unit:f.unit.value,category:f.category.value,price:parseFloat(f.price.value)||0,priority:f.priority.value});saveWeek();toast('Added '+name)}
  if(f.id==='invQuick'){const name=f.name.value.trim();if(!name)return;const q=parseFloat(f.qty.value);saveInv({id:uid('h'),name,qty:isNaN(q)?0:q,unit:f.unit.value,location:f.location.value,note:''});toast('Added to At Home')}});
function handleAction(b,e){const a=b.dataset.action,d=b.dataset;
  switch(a){
    case 'tab':closeModal();S.ui.tab=d.tab;renderNav();render();window.scrollTo(0,0);if(d.tab==='discover')loadLive();break;
    case 'more':openMore();break;
    case 'week':setWeek(iso(addDays(parseISO(S.ui.weekKey),7*+d.n)));break;
    case 'week-today':setWeek(iso(mondayOf(today())));break;
    case 'goto-week':setWeek(d.k);break;
    case 'pick':openPicker(+d.day,d.meal,!!d.add);break;
    case 'rm-entry':{const w=week();const arr=slotEntries(w,d.day,d.meal).slice();arr.splice(+d.i,1);w.slots[d.day][d.meal]=arr;saveWeek();break}
    case 'serv':{const w=week();const en=slotEntries(w,d.day,d.meal)[+d.i];if(!en)return;en.sv=Math.max(1,Math.min(12,(en.sv||S.settings.people||1)+ +d.n));saveWeek();break}
    case 'leftover-next':{const nd=+d.day+1;const tm=d.meal==='dinner'&&activeMeals().includes('lunch')?'lunch':d.meal;const cur=slotEntries(week(),nd,tm);const go=()=>{addEntry(nd,tm,{t:'l',of:d.id},true);const en=slotEntries(week(),d.day,d.meal).find(x=>x.t==='r'&&x.id===d.id);if(en&&(en.sv||1)<(S.settings.people||1)*2)en.sv=(S.settings.people||1)*2;saveWeek();toast(`Leftovers planned for ${DAYS_LONG[nd]} ${tm}`)};
      if(cur.length)confirmModal(`Replace ${DAYS_LONG[nd]} ${tm}?`,`That slot already has something planned. Replace it with leftovers?`,'Replace',go);else go();break}
    case 'clear-week':confirmModal('Clear this week?','Removes every planned meal, list tick, one-off item and postponement for the week. Logged checkouts stay.','Clear week',()=>{const w=week();w.slots={};w.checked={};w.extras=[];w.buy={};saveWeek()},true);break;
    case 'shuffle-week':shuffleWeek();break;
    case 'load-starter':closeModal();loadStarter();break;
    case 'new-recipe':closeModal();openEditor(null,d.day!=null?{then:r=>{addEntry(+d.day,d.meal,{t:'r',id:r.id,sv:S.settings.people||1},true);saveWeek();S.ui.tab='plan';render()}}:{});break;
    case 'ai-import':openAiRecipe('import');break;
    case 'ai-generate':closeModal();openAiRecipe('generate',d.day!=null?{day:+d.day,meal:d.meal}:null);break;
    case 'open-recipe':openRecipe(d.id);break;
    case 'add-flow':openAddFlow(d.id,{sv:d.sv?+d.sv:undefined});break;
    case 'fav-card':{const r=getRecipe(d.id);if(!r)return;const saved=ensureSaved(r);saved.favorite=!saved.favorite;saveRecipe(saved);if(modalOpen()&&document.querySelector('.modal[data-recipe]'))openRecipe(d.id);toast(saved.favorite?'Added to favorites':'Removed from favorites');break}
    case 'hide-recipe':{const r=S.recipes[d.id];if(!r)return;closeModal();r.hidden=true;saveRecipe(r);toast(`${r.name} will not be recommended again (undo in Settings)`);break}
    case 'unhide-all':{for(const r of Object.values(S.recipes))if(r.hidden){r.hidden=false;saveRecipe(r)}toast('All recipes visible again');break}
    case 'cooked':{const r=S.recipes[d.id];if(!r)return;closeModal();openModal(`${mhead('Cooked '+esc(r.name),'How was it? This tunes your recommendations.')}<div class="mb"><div class="actions"><button class="btn primary" data-liked="1">Liked it</button><button class="btn" data-liked="0">Not for me</button><button class="btn ghost" data-liked="">Just log it</button></div></div>`,'narrow');document.querySelectorAll('[data-liked]').forEach(b=>b.onclick=()=>{const v=b.dataset.liked;r.liked=v===''?r.liked:v==='1';r.cookedCount=(r.cookedCount||0)+1;r.lastCooked=iso(today());saveRecipe(r);noteCooked(r.id,v===''?null:v==='1');closeModal();toast('Logged')});break}
    case 'add-missing':addMissingToGroceries(d.id,+d.sv||0);break;
    case 'ai-similar':{const r=getRecipe(d.id);closeModal();openAiRecipe('generate');setTimeout(()=>{const ta=document.getElementById('aiIn');if(ta&&r)ta.value=`Something similar to "${r.name}" (${(r.ingredients||[]).slice(0,5).map(i=>i.name).join(', ')}) but with a twist, same meal type, similar cost.`},0);break}
    case 'ask-coach':{const r=getRecipe(d.id);closeModal();S.ui.chatDraft=r?`About "${r.name}": does it fit this week's budget and plan? Where would you put it, and what should I swap out?`:'';S.ui.tab='coach';renderNav();render();break}
    case 'create-chooser':closeModal();openCreateChooser(d.day!=null?{day:+d.day,meal:d.meal}:null);break;
    case 'ai-create':closeModal();openAiCreate(d.day!=null?{day:+d.day,meal:d.meal}:null);break;
    case 'url-import':closeModal();openUrlImport(d.day!=null?{day:+d.day,meal:d.meal}:null);break;
    case 'disc-slot':closeModal();S.ui.disc.slot={day:+d.day,meal:d.meal};S.ui.disc.filters={...EMPTY_FILTERS(),meal:d.meal};S.ui.disc.q='';S.ui.disc.shown=12;S.ui.tab='discover';renderNav();render();window.scrollTo(0,0);loadLive();break;
    case 'disc-clear-slot':S.ui.disc.slot=null;S.ui.disc.filters=EMPTY_FILTERS();render();break;
    case 'disc-chip':{const f=S.ui.disc.filters;const k=d.k,v=d.v;if(k==='diet'){const set=new Set(f.diet||[]);set.has(v)?set.delete(v):set.add(v);f.diet=[...set]}else if(k==='meal'){f.meal=f.meal===v?'':v}else if(k==='oneServing'||k==='usesPantry'){f[k]=!f[k]}else{f[k]=f[k]===+v?0:+v}S.ui.disc.shown=12;render();loadLive();break}
    case 'disc-filters':openFilters();break;
    case 'disc-reset':S.ui.disc.filters=EMPTY_FILTERS();S.ui.disc.q='';S.ui.disc.shown=12;render();loadLive();break;
    case 'disc-more':S.ui.disc.shown+=12;render();break;
    case 'disc-retry':loadLive(true);break;
    case 'disc-collection':{const key=d.k;const map={featured:{},recommended:{},budget:{maxCost:Math.ceil(discoverContext().threshold)},quick:{maxMinutes:20},breakfast:{meal:'breakfast'},lunch:{meal:'lunch'},dinner:{meal:'dinner'},snacks:{meal:'snack'},one:{oneServing:true},pantry:{usesPantry:true},overlap:{overlap:true},favorites:{},viewed:{},cooked:{}};S.ui.disc.filters={...EMPTY_FILTERS(),...(map[key]||{})};S.ui.disc.shown=48;render();break}
    case 'receipt-scan':closeModal();openReceiptScan();break;
    case 'health-profile':closeModal();openHealthProfile();break;
    case 'health-ask':S.ui.chatDraft='Am I eating reasonably balanced this week? Give me at most three practical changes that fit my budget.';S.ui.tab='coach';renderNav();render();break;
    case 'checkin':{const date=iso(today());const c=checkins();const a={...(c.days[date]||{})};a[d.k]=d.v==='1';saveCheckin(date,a);render();break}
    case 'checkin-dismiss':dismissCheckin(d.date);render();toast('Skipped for today');break;
    case 'swap':{const sug=sweetSwapSuggestions();const s=sug[+d.i];if(!s)return;const res=applySweetSwap(s.line,d.c,s.alternatives[0]);if(res.changed.some(x=>x.startsWith('added')||x.startsWith('postponed')||x.startsWith('removed')))saveWeek();else render();toast(d.c==='keep'?'Kept as it is':d.c==='dismiss'?'Will not suggest this again':d.c==='both'?`${s.alternatives[0].name} added; ${s.line.name} kept`:`${s.line.name} postponed, ${s.alternatives[0].name} added`);break}
    case 'edit-recipe':closeModal();openEditor(S.recipes[d.id]);break;
    case 'fav':{const r=S.recipes[d.id];if(!r)return;r.favorite=!r.favorite;saveRecipe(r);openRecipe(d.id);break}
    case 'delete-recipe':{const r=S.recipes[d.id];closeModal();confirmModal('Delete recipe?',`<b>${esc(r.name)}</b> will be removed. Planned slots using it will show as deleted.`,'Delete',()=>{deleteRecipe(d.id);toast('Deleted')},true);break}
    case 'add-to-plan':closeModal();openAddToPlan(d.id);break;
    case 'tag':S.ui.tag=d.tag;render();break;
    case 'mealf':S.ui.mealFilter=d.m;render();break;
    case 'have-line':{saveInv({id:uid('h'),name:d.name,qty:0,unit:'',location:CAT_LOC[d.cat]||'Pantry',note:'added from the list'});toast(`${d.name} marked as at home`);break}
    case 'need-line':{for(const v of Object.values(S.inventory))if(canon(v.name)===d.canon)deleteInv(v.id);toast('Back on the list');break}
    case 'postpone':{const it=S.items[d.id];if(!it)return;if((it.priority||'preferred')==='essential'){toast(it.kind==='pet'?`${petName()}'s essentials are never postponed. Change its priority first if you really mean it.`:'Essential items are never postponed. Change the priority first.');return}const w=week();w.buy=w.buy||{};w.buy[d.id]=false;saveWeek();toast('Postponed to a later week');break}
    case 'unpostpone':{const w=week();w.buy=w.buy||{};delete w.buy[d.id];saveWeek();break}
    case 'remove-extra':{const w=week();w.extras=(w.extras||[]).filter(x=>x.id!==d.id);saveWeek();break}
    case 'uncheck-all':{const w=week();w.checked={};saveWeek();break}
    case 'copy-list':{const L=buildList().filter(l=>!(l.atHome&&l.atHome.all)&&!l.checked);const groups={};for(const l of L)(groups[l.staple?'Pantry staples (check)':l.category]=groups[l.staple?'Pantry staples (check)':l.category]||[]).push(l);const text=Object.keys(groups).map(c=>c.toUpperCase()+'\n'+groups[c].map(l=>'• '+fmtBase(l.needBase,l.fam)+' '+l.name+(l.pack?' ('+l.pack+')':'')+(l.cost?' ~'+money(l.cost):'')).join('\n')).join('\n\n')+`\n\nEstimated checkout ${money(budgetSummary().actual)}`;(navigator.clipboard?navigator.clipboard.writeText(text):Promise.reject()).then(()=>toast('List copied'),()=>{openModal(`${mhead('Your list','Select and copy')}<div class="mb"><textarea style="min-height:280px;width:100%;${fieldCss}" readonly>${esc(text)}</textarea></div><div class="mf"><button class="btn" data-close>Done</button></div>`);document.querySelector('.modal textarea').select()});break}
    case 'log-shop':openLogShop(d.amount&&+d.amount>0?d.amount:'');break;
    case 'del-trip':{const w=week();const tr=(w.trips||[]).find(t=>t.id===d.id);confirmModal('Remove this receipt?',`${esc((tr&&tr.store)||'This shop')} on ${tr?fmtDate(parseISO(tr.date)):''}: the amount, line items and any photo are removed from this device.`,'Remove',()=>{if(tr&&tr.imageId&&Store.backend)Store.delBlob(tr.imageId).catch(()=>{});w.trips=(w.trips||[]).filter(t=>t.id!==d.id);saveWeek();toast('Receipt removed')},true);break}
    case 'trip-photo':openTripPhoto(d.id);break;
    case 'trip-photo-remove':closeModal();confirmModal('Remove the receipt photo?','The photo is deleted from this device. The receipt itself stays.','Remove photo',()=>removeTripPhoto(d.id),true);break;
    case 'receipt-manual':{const st=document.getElementById('tStore')?document.getElementById('tStore').value:'';const dt=document.getElementById('tDate')?document.getElementById('tDate').value:iso(today());const tot=document.getElementById('tAmt')?parseFloat(document.getElementById('tAmt').value):null;closeModal();openReceiptConfirm({store:st,date:dt||iso(today()),total:isNaN(tot)?null:tot,tax:0,discount:0,lines:[]});break}
    case 'ob-back':obRead();S.ui.ob.step=Math.max(0,S.ui.ob.step-1);render();break;
    case 'ob-next':{obRead();const a=S.ui.ob.a;if(S.ui.ob.step===0&&!String(a.name||'').trim()){toast('Tell Plenty what to call you.');const el=document.getElementById('ob_name');if(el)el.focus();return}S.ui.ob.step=Math.min(OB_STEPS.length-1,S.ui.ob.step+1);render();break}
    case 'ob-finish':obRead();finishOnboarding();break;
    case 'ob-pet-add':{obRead();const n=document.getElementById('ob_petName').value.trim();if(!n){toast('Give the pet a name.');return}S.ui.ob.a.pets.push({id:uid('pet'),name:n,type:document.getElementById('ob_petType').value});render();break}
    case 'ob-pet-remove':obRead();S.ui.ob.a.pets.splice(+d.i,1);render();break;
    case 'pick-profile':Store.switchProfile(d.id).then(async()=>{await loadProfileState();S.ui.mode='app';renderNav();render();toast('Switched profile')});break;
    case 'profile-switch':confirmModal('Switch profile?',`Plenty reloads with <b>${esc((Store.registry.profiles.find(p=>p.id===d.id)||{}).name||'that profile')}</b>'s plans, lists, receipts, pets and health data. Nothing is combined between profiles.`,'Switch',async()=>{await Store.switchProfile(d.id);await loadProfileState();S.ui.tab='home';renderNav();render();toast('Switched profile')});break;
    case 'profile-rename':{const p=Store.registry.profiles.find(x=>x.id===d.id);openModal(`${mhead('Rename profile')}<div class="mb"><div class="field"><label for="prName">Name</label><input id="prName" value="${esc(p?p.name:'')}"></div></div><div class="mf"><button class="btn ghost" data-close>Cancel</button><div class="actions"><button class="btn primary" id="prGo">Save</button></div></div>`,'narrow');document.getElementById('prGo').onclick=async()=>{await Store.renameProfile(d.id,document.getElementById('prName').value);closeModal();render()};break}
    case 'profile-delete':{const p=Store.registry.profiles.find(x=>x.id===d.id);confirmModal('Delete this profile?',`Everything belonging to <b>${esc(p?p.name:'this profile')}</b> on this device is deleted: plans, recipes, receipts and photos, pets, health data. Export a backup first if you want to keep it.`,'Delete profile',async()=>{const wasActive=Store.profileId===d.id;await Store.deleteProfile(d.id);if(wasActive){await deleteAllPlentyDataAfterProfileRemoval()}else render();toast('Profile deleted')},true);break}
    case 'profile-new':S.ui.ob={step:0,a:{currency:S.settings.currency||'€',people:1,household:1,weeklyBudget:70,buffer:5,meals:['breakfast','lunch','dinner','snack'],allergies:[],goals:[],pets:[],petStarter:true,starter:true,language:'en',shopDay:6}};S.ui.mode='onboarding';renderNav();render();break;
    case 'pet-add':{const n=document.getElementById('petNameNew').value.trim();if(!n){toast('Give the pet a name.');return}const ps=[...pets(),{id:uid('pet'),name:n,type:document.getElementById('petTypeNew').value}];saveSettings({pets:ps});toast(`${n} added. Add food and supplies on the Items tab.`);break}
    case 'pet-remove':{const p=pets().find(x=>x.id===d.id);confirmModal('Remove this pet?',`${esc(p?p.name:'The pet')} is removed from your household. Its supply items stay on the Items tab until you delete them.`,'Remove',()=>{saveSettings({pets:pets().filter(x=>x.id!==d.id)})},true);break}
    case 'backup-export':openExport();break;
    case 'backup-import':openImport();break;
    case 'delete-history':confirmModal('Delete all shopping history?','Every logged checkout, receipt line and receipt photo in every week is removed from this device. Plans and recipes stay.','Delete history',async()=>{for(const k in S.weeks){for(const t of (S.weeks[k].trips||[]))if(t.imageId&&Store.backend)await Store.delBlob(t.imageId).catch(()=>{});S.weeks[k].trips=[];writeDoc('weeks/'+k,S.weeks[k])}render();toast('Shopping history deleted')},true);break;
    case 'delete-all':confirmModal('Delete all Plenty data on this device?','This removes the current profile completely: settings, plans, recipes, grocery lists, inventory, pets, receipts and photos, price history, health profile and check-ins. There is no undo. Export a backup first if you are unsure.','Delete everything',()=>{deleteAllPlentyData();toast('All Plenty data for this profile was deleted')},true);break;
    case 'pwa-update':applyUpdate();break;
    case 'pwa-install':promptInstall();break;
    case 'pwa-dismiss':setUiPref('installDismissed',true);render();break;
    case 'pwa-check':if(swReg)swReg.update().then(()=>toast(S.ui.updateReady?'An update is ready.':'You have the latest version.')).catch(()=>toast('Could not check right now.'));else toast('Updates are checked automatically when installed.');break;
    case 'new-item':openItemEditor(null,d.kind);break;
    case 'edit-item':openItemEditor(S.items[d.id]);break;
    case 'new-inv':openInvEditor(null);break;
    case 'edit-inv':openInvEditor(S.inventory[d.id]);break;
    case 'del-inv':deleteInv(d.id);toast('Used up');break;
    case 'quick':S.ui.chatDraft=d.q;render();{const ta=document.getElementById('chatIn');if(ta){ta.focus();ta.style.height='auto';ta.style.height=Math.min(160,ta.scrollHeight)+'px'}}break;
    case 'send':{const ta=document.getElementById('chatIn');if(ta)sendChat(ta.value);break}
    case 'apply-turn':{const c=chat();const t=c.turns[+d.turn];if(!t||t.applied)return;const picks=[...document.querySelectorAll(`input[data-turn="${d.turn}"]`)];const chosen=t.actions.filter((a,j)=>{const cb=picks.find(p=>+p.dataset.j===j);return cb&&cb.checked});const results=t.actions.map(()=>({ok:false,why:'Not selected'}));const applied=applyActions(chosen);let k=0;t.actions.forEach((a,j)=>{const cb=picks.find(p=>+p.dataset.j===j);if(cb&&cb.checked)results[j]=applied[k++]});t.results=results;t.applied=true;saveChat();const okN=results.filter(r=>r.ok).length;toast(`Applied ${okN} change${okN===1?'':'s'}. Totals recalculated.`);break}
    case 'dismiss-turn':{const c=chat();const t=c.turns[+d.turn];if(!t)return;t.applied=true;t.results=t.actions.map(()=>({ok:false,why:'Dismissed'}));saveChat();break}
    case 'clear-chat':confirmModal('Clear conversation?','The coach forgets this week\'s chat. Applied changes stay.','Clear',()=>{S.chats[S.ui.weekKey]={turns:[]};saveChat()},true);break;
    case 'wipe-weeks':confirmModal('Delete all weekly plans?','Every week\'s meals, ticks, extras and logged checkouts are removed. Recipes, items and At Home stay.','Delete plans',async()=>{const keys=new Set(Object.keys(S.weeks));if(db){try{const snap=await db.collection('weeks').get();snap.docs.forEach(x=>keys.add(x.id))}catch(e){}}for(const k of keys)deleteDoc('weeks/'+k);S.weeks={};render();toast('Plans deleted')},true);break;
  }}

/* ================= starter data ================= */
function ING(s){return s.split('\n').map(l=>l.trim()).filter(Boolean).map(l=>{const [qty,unit,name,category,price]=l.split('|').map(x=>x.trim());return {qty:parseFloat(qty)||0,unit,name,category,price:parseFloat(price)||0}})}
const STARTER={recipes:[
{id:'s_oats',name:'Overnight Oats with Berries',mealTypes:['breakfast'],tags:['vegetarian','meal-prep','budget'],minutes:5,servings:1,nutrition:{kcal:380,protein:16,carbs:58,fat:9},ingredients:ING(`50|g|rolled oats|Breakfast|0.15
150|ml|milk|Dairy & eggs|0.20
100|g|Greek yogurt|Dairy & eggs|0.55
1|tbsp|chia seeds|Pantry|0.25
80|g|frozen mixed berries|Frozen|0.60
1|tsp|honey|Pantry|0.08`),steps:['Stir oats, milk, yogurt and chia in a jar.','Top with berries and honey, lid on, fridge overnight.','Make three or four jars at once for the week.'],notes:'Repeat Monday to Thursday; the jars keep four days.'},
{id:'s_eggs_toast',name:'Eggs on Toast with Avocado',mealTypes:['breakfast'],tags:['vegetarian','quick'],minutes:10,servings:1,nutrition:{kcal:430,protein:18,carbs:34,fat:24},ingredients:ING(`2|pcs|eggs|Dairy & eggs|0.60
2|slice|wholegrain bread|Bakery|0.30
0.5|pcs|avocado|Produce|0.70
1|pinch|chilli flakes|Pantry|0.02
1|pinch|salt|Pantry|0.01`),steps:['Toast the bread. Mash avocado with salt.','Fry or poach the eggs.','Spread avocado, top with eggs and chilli flakes.'],notes:'Good for Friday to Sunday when there is more time.'},
{id:'s_yogurt_bowl',name:'Greek Yogurt Bowl with Banana & Peanut Butter',mealTypes:['breakfast','snack'],tags:['vegetarian','quick','high-protein'],minutes:3,servings:1,nutrition:{kcal:360,protein:22,carbs:38,fat:13},ingredients:ING(`200|g|Greek yogurt|Dairy & eggs|1.10
1|pcs|banana|Produce|0.25
1|tbsp|peanut butter|Pantry|0.20
1|tsp|honey|Pantry|0.08`),steps:['Spoon yogurt into a bowl, slice banana on top.','Add peanut butter and honey.'],notes:''},
{id:'s_chicken_rice',name:'Lemon Garlic Chicken with Rice & Green Beans',mealTypes:['dinner','lunch'],tags:['chicken','quick','high-protein','meal-prep'],minutes:25,servings:2,nutrition:{kcal:520,protein:42,carbs:55,fat:12},ingredients:ING(`300|g|chicken breast|Meat & seafood|3.60
150|g|basmati rice|Pantry|0.35
1|pcs|lemon|Produce|0.40
3|clove|garlic|Produce|0.15
150|g|green beans|Produce|1.10
1|tbsp|olive oil|Pantry|0.12
1|tsp|dried oregano|Pantry|0.05
1|pinch|salt|Pantry|0.01
1|pinch|black pepper|Pantry|0.01`),steps:['Rinse rice, cook in 300 ml salted water 12 minutes, rest covered.','Slice chicken, season with salt, pepper, oregano and lemon zest.','Sear in oil on high heat 5 to 6 minutes.','Add sliced garlic and beans, 3 minutes, squeeze in lemon juice.','Serve over rice. The second portion is tomorrow\'s lunch.'],notes:'Cook two servings, eat one, box one.'},
{id:'s_chickpea_curry',name:'Chickpea & Spinach Curry',mealTypes:['dinner','lunch'],tags:['vegan','budget','meal-prep'],minutes:30,servings:4,nutrition:{kcal:410,protein:15,carbs:58,fat:13},ingredients:ING(`2|can|chickpeas (400 g)|Pantry|1.60
1|can|tinned chopped tomatoes (400 g)|Pantry|0.80
1|can|coconut milk (400 ml)|Pantry|1.40
200|g|spinach|Produce|1.50
1|pcs|onion|Produce|0.30
3|clove|garlic|Produce|0.15
2|tbsp|curry powder|Pantry|0.20
250|g|basmati rice|Pantry|0.60
1|tbsp|vegetable oil|Pantry|0.06
1|pinch|salt|Pantry|0.01`),steps:['Cook rice. Fry diced onion in oil 6 minutes.','Add garlic and curry powder, 1 minute.','Add tomatoes, coconut milk and drained chickpeas; simmer 15 minutes.','Stir in spinach until wilted, season.','Portion into four boxes with rice. Freezes well.'],notes:'Four portions: two dinners, two lunches, or freeze half.'},
{id:'s_salmon_tray',name:'Salmon Traybake with Potatoes & Broccoli',mealTypes:['dinner'],tags:['fish','light','high-protein'],minutes:35,servings:2,nutrition:{kcal:560,protein:38,carbs:42,fat:24},ingredients:ING(`2|pcs|salmon fillets|Meat & seafood|7.00
400|g|baby potatoes|Produce|1.00
1|pcs|broccoli|Produce|1.20
1|pcs|lemon|Produce|0.40
2|tbsp|olive oil|Pantry|0.24
1|tsp|smoked paprika|Pantry|0.05
1|pinch|salt|Pantry|0.01`),steps:['Oven 200°C. Halve potatoes, toss with oil, salt and paprika; roast 20 minutes.','Add broccoli florets and salmon, squeeze over lemon.','Roast 12 more minutes.'],notes:'The premium dinner of the week; ask the coach if it fits.'},
{id:'s_quesadilla',name:'Black Bean Quesadillas',mealTypes:['dinner','lunch'],tags:['vegetarian','quick','budget'],minutes:15,servings:2,nutrition:{kcal:480,protein:20,carbs:60,fat:16},ingredients:ING(`1|can|black beans (400 g)|Pantry|0.90
4|pcs|tortilla wraps|Bakery|1.00
100|g|cheddar|Dairy & eggs|1.10
1|pcs|red pepper|Produce|0.80
1|tsp|ground cumin|Pantry|0.05
1|pcs|lime|Produce|0.30
100|g|salsa|Pantry|0.70`),steps:['Drain beans, mash roughly with cumin, lime juice and salt.','Spread on two wraps, add diced pepper and cheese, top with the other wraps.','Toast in a dry pan 3 minutes a side. Cut into wedges, serve with salsa.'],notes:''},
{id:'s_meatballs',name:'Turkey Meatballs with Tomato Sauce & Spaghetti',mealTypes:['dinner'],tags:['high-protein','comfort','meal-prep'],minutes:35,servings:4,nutrition:{kcal:590,protein:40,carbs:68,fat:14},ingredients:ING(`500|g|turkey mince|Meat & seafood|4.50
1|pcs|egg|Dairy & eggs|0.30
40|g|breadcrumbs|Pantry|0.15
2|can|tinned chopped tomatoes (400 g)|Pantry|1.60
1|pcs|onion|Produce|0.30
3|clove|garlic|Produce|0.15
320|g|spaghetti|Pantry|0.65
1|tsp|dried basil|Pantry|0.05
30|g|parmesan|Dairy & eggs|0.75`),steps:['Mix mince, egg, breadcrumbs, a little garlic, salt and pepper. Shape 16 meatballs.','Brown in a little oil 6 minutes; set aside.','Fry onion and garlic 5 minutes, add tomatoes and basil, simmer 10.','Return meatballs for 8 minutes. Cook spaghetti.','Serve with parmesan. Freeze sauce and meatballs in portions.'],notes:''},
{id:'s_fried_rice',name:'Veggie Fried Rice with Egg',mealTypes:['dinner','lunch'],tags:['vegetarian','quick','budget'],minutes:20,servings:2,nutrition:{kcal:450,protein:17,carbs:64,fat:13},ingredients:ING(`150|g|basmati rice|Pantry|0.35
2|pcs|eggs|Dairy & eggs|0.60
150|g|frozen peas|Frozen|0.35
1|pcs|carrot|Produce|0.15
2|pcs|spring onions|Produce|0.30
2|tbsp|soy sauce|Pantry|0.15
1|tbsp|vegetable oil|Pantry|0.06
1|tsp|sesame oil|Pantry|0.10`),steps:['Cook rice and cool it (or use leftover rice).','Fry diced carrot 3 minutes, add peas 2 minutes.','Scramble eggs in the pan.','Add rice and soy, fry hot 4 minutes. Finish with sesame oil and spring onion.'],notes:'A good home for leftover rice.'},
{id:'s_tuna_salad',name:'Tuna & White Bean Salad',mealTypes:['lunch'],tags:['fish','quick','budget','light'],minutes:10,servings:1,nutrition:{kcal:380,protein:32,carbs:30,fat:12},ingredients:ING(`1|can|tuna in water (145 g)|Pantry|1.20
0.5|can|cannellini beans (400 g)|Pantry|0.45
0.5|pcs|red onion|Produce|0.15
1|handful|parsley|Produce|0.30
0.5|pcs|lemon|Produce|0.20
1|tbsp|olive oil|Pantry|0.12`),steps:['Drain tuna and beans.','Toss with sliced onion, chopped parsley, lemon, oil, salt and pepper.'],notes:'Packs well for work.'},
{id:'s_caesar_wrap',name:'Chicken Caesar Wrap',mealTypes:['lunch'],tags:['chicken','quick','high-protein'],minutes:15,servings:1,nutrition:{kcal:510,protein:36,carbs:40,fat:20},ingredients:ING(`150|g|chicken breast|Meat & seafood|1.80
1|pcs|tortilla wrap|Bakery|0.25
60|g|romaine lettuce|Produce|0.50
1.5|tbsp|caesar dressing|Pantry|0.30
15|g|parmesan|Dairy & eggs|0.38`),steps:['Slice chicken, season, pan-fry 6 minutes.','Toss lettuce with dressing and parmesan.','Load the wrap, roll tightly.'],notes:'Use leftover cooked chicken to skip the frying.'},
{id:'s_lentil_soup',name:'Sweet Potato & Lentil Soup',mealTypes:['lunch','dinner'],tags:['vegan','budget','meal-prep'],minutes:40,servings:4,nutrition:{kcal:340,protein:14,carbs:58,fat:6},ingredients:ING(`200|g|red lentils|Pantry|0.60
2|pcs|sweet potatoes|Produce|1.20
1|pcs|onion|Produce|0.30
2|clove|garlic|Produce|0.10
1|tbsp|ground cumin|Pantry|0.10
1|l|vegetable stock|Pantry|0.40
1|tbsp|olive oil|Pantry|0.12
4|slice|wholegrain bread|Bakery|0.60`),steps:['Fry onion in oil 5 minutes, add garlic and cumin.','Add cubed sweet potato, rinsed lentils and stock. Simmer 25 minutes.','Blend half for texture, season.','Serve with bread. Freeze in portions.'],notes:'Cheapest lunch in the box.'},
{id:'s_beef_broccoli',name:'Beef & Broccoli Stir-fry',mealTypes:['dinner'],tags:['beef','quick','high-protein'],minutes:20,servings:2,nutrition:{kcal:540,protein:38,carbs:48,fat:20},ingredients:ING(`300|g|beef strips|Meat & seafood|5.40
1|pcs|broccoli|Produce|1.20
2|clove|garlic|Produce|0.10
1|tbsp|fresh ginger|Produce|0.20
3|tbsp|soy sauce|Pantry|0.22
1|tbsp|honey|Pantry|0.15
1|tbsp|cornflour|Pantry|0.05
150|g|egg noodles|Pantry|0.60
1|tbsp|vegetable oil|Pantry|0.06`),steps:['Toss beef with cornflour and 1 tbsp soy. Cook noodles.','Sear beef in very hot oil 2 minutes; set aside.','Stir-fry broccoli 3 minutes with a splash of water; add garlic and ginger.','Return beef with soy and honey, toss with noodles.'],notes:''},
{id:'s_pesto_pasta',name:'Pesto Pasta with Peas & Rocket',mealTypes:['dinner','lunch'],tags:['vegetarian','quick','comfort'],minutes:15,servings:2,nutrition:{kcal:610,protein:19,carbs:78,fat:24},ingredients:ING(`180|g|pasta|Pantry|0.36
90|g|green pesto|Pantry|1.10
120|g|frozen peas|Frozen|0.28
60|g|rocket|Produce|0.90
30|g|parmesan|Dairy & eggs|0.75
0.5|pcs|lemon|Produce|0.20`),steps:['Cook pasta; add peas for the last 3 minutes.','Drain, keep a splash of water, stir in pesto and lemon zest.','Fold in rocket, top with parmesan.'],notes:''},
{id:'s_hummus_snack',name:'Hummus with Carrot & Cucumber Sticks',mealTypes:['snack'],tags:['vegan','quick','work-snack','budget'],minutes:5,servings:1,nutrition:{kcal:180,protein:6,carbs:18,fat:9},ingredients:ING(`60|g|hummus|Snacks & treats|0.50
1|pcs|carrot|Produce|0.15
0.5|pcs|cucumber|Produce|0.35`),steps:['Cut carrot and cucumber into sticks.','Pack with a pot of hummus.'],notes:'Work snack that survives a bag.'},
{id:'s_apple_pb',name:'Apple Slices with Peanut Butter',mealTypes:['snack'],tags:['vegetarian','quick','work-snack'],minutes:3,servings:1,nutrition:{kcal:200,protein:5,carbs:26,fat:9},ingredients:ING(`1|pcs|apple|Produce|0.35
1|tbsp|peanut butter|Pantry|0.20`),steps:['Slice the apple, dip in peanut butter.'],notes:''}
],
items:[
{id:'i_bananas',name:'Bananas',kind:'grocery',category:'Produce',group:'snacks',qty:6,unit:'pcs',price:1.50,frequency:'weekly',priority:'preferred',brand:'',store:'',inStock:false},
{id:'i_apples',name:'Apples',kind:'grocery',category:'Produce',group:'snacks',qty:6,unit:'pcs',price:2.40,frequency:'weekly',priority:'preferred',brand:'',store:'',inStock:false},
{id:'i_yogurt',name:'Greek yogurt',kind:'grocery',category:'Dairy & eggs',qty:1,unit:'kg',price:4.50,frequency:'weekly',priority:'essential',brand:'',store:'',inStock:false},
{id:'i_milk',name:'Milk',kind:'grocery',category:'Dairy & eggs',qty:2,unit:'l',price:2.20,frequency:'weekly',priority:'essential',brand:'',store:'',inStock:false},
{id:'i_bread',name:'Wholegrain bread',kind:'grocery',category:'Bakery',qty:1,unit:'loaf',price:2.50,frequency:'weekly',priority:'essential',brand:'',store:'',inStock:false},
{id:'i_eggs',name:'Eggs',kind:'grocery',category:'Dairy & eggs',qty:12,unit:'pcs',price:3.60,frequency:'weekly',priority:'essential',brand:'free range',store:'',inStock:false},
{id:'i_oats',name:'Rolled oats',kind:'grocery',category:'Breakfast',qty:1,unit:'kg',price:2.20,frequency:'monthly',priority:'essential',brand:'',store:'',inStock:false,lastBought:'2026-09-06'},
{id:'i_tea',name:'Tea bags',kind:'grocery',category:'Coffee & tea',qty:80,unit:'pcs',price:3.00,frequency:'monthly',priority:'preferred',brand:'',store:'',inStock:true},
{id:'i_coffee',name:'Ground coffee',kind:'grocery',category:'Coffee & tea',qty:250,unit:'g',price:5.50,frequency:'biweekly',priority:'preferred',brand:'',store:'',inStock:false},
{id:'i_water',name:'Sparkling water',kind:'grocery',category:'Drinks',qty:6,unit:'bottle',price:3.00,frequency:'weekly',priority:'optional',brand:'',store:'',inStock:false},
{id:'i_bars',name:'Protein bars',kind:'grocery',category:'Snacks & treats',qty:6,unit:'pcs',price:5.00,frequency:'weekly',priority:'optional',brand:'',store:'',inStock:false},
{id:'i_choc',name:'Dark chocolate',kind:'grocery',category:'Snacks & treats',qty:1,unit:'pcs',price:2.50,frequency:'weekly',priority:'optional',brand:'',store:'',inStock:false},
{id:'i_pb',name:'Peanut butter',kind:'grocery',category:'Pantry',qty:340,unit:'g',price:3.20,frequency:'monthly',priority:'preferred',brand:'',store:'',inStock:false,lastBought:'2026-09-13'},
{id:'i_towels',name:'Paper towels',kind:'household',category:'Household',qty:2,unit:'pack',price:3.50,frequency:'monthly',priority:'preferred',brand:'',store:'',inStock:false,lastBought:'2026-09-06'},
{id:'i_detergent',name:'Laundry detergent',kind:'household',category:'Household',qty:1,unit:'bottle',price:8.00,frequency:'asneeded',priority:'preferred',brand:'',store:'',inStock:true},
{id:'i_toothpaste',name:'Toothpaste',kind:'household',category:'Personal care',qty:1,unit:'pcs',price:2.80,frequency:'asneeded',priority:'essential',brand:'',store:'',inStock:true},
{id:'p_dry',name:'Dry dog food',kind:'pet',category:'Pet',qty:1,unit:'bag',price:28,frequency:'monthly',priority:'essential',brand:'',store:'',inStock:false,packageSize:8,packageUnit:'kg',packagePrice:28,usePerDay:0.28,remaining:1.4,remainingAsOf:'2026-09-20'},
{id:'p_wet',name:'Wet dog food pouches',kind:'pet',category:'Pet',qty:12,unit:'pcs',price:9.00,frequency:'biweekly',priority:'essential',brand:'',store:'',inStock:false},
{id:'p_treats',name:'Training treats',kind:'pet',category:'Pet',qty:1,unit:'bag',price:3.50,frequency:'biweekly',priority:'preferred',brand:'',store:'',inStock:false},
{id:'p_dental',name:'Dental chews',kind:'pet',category:'Pet',qty:1,unit:'pack',price:6.00,frequency:'monthly',priority:'preferred',brand:'',store:'',inStock:false,packageSize:28,packageUnit:'pcs',packagePrice:6,usePerDay:1,remaining:18,remainingAsOf:'2026-09-20'},
{id:'p_bags',name:'Waste bags',kind:'pet',category:'Pet',qty:1,unit:'pack',price:4.00,frequency:'monthly',priority:'essential',brand:'',store:'',inStock:false,packageSize:120,packageUnit:'pcs',packagePrice:4,usePerDay:3,remaining:60,remainingAsOf:'2026-09-20'},
{id:'p_joint',name:'Joint supplement',kind:'pet',category:'Pet',qty:1,unit:'pcs',price:15,frequency:'monthly',priority:'optional',brand:'',store:'',inStock:false,packageSize:60,packageUnit:'pcs',packagePrice:15,usePerDay:1,remaining:40,remainingAsOf:'2026-09-20'}
],
inventory:[
{id:'h_salt',name:'Salt',qty:0,unit:'',location:'Pantry',note:''},
{id:'h_pepper',name:'Black pepper',qty:0,unit:'',location:'Pantry',note:''},
{id:'h_oil',name:'Olive oil',qty:500,unit:'ml',location:'Pantry',note:''},
{id:'h_vegoil',name:'Vegetable oil',qty:0,unit:'',location:'Pantry',note:''},
{id:'h_rice',name:'Basmati rice',qty:600,unit:'g',location:'Pantry',note:''},
{id:'h_soy',name:'Soy sauce',qty:0,unit:'',location:'Pantry',note:''},
{id:'h_honey',name:'Honey',qty:0,unit:'',location:'Pantry',note:''},
{id:'h_spices',name:'Curry powder',qty:0,unit:'',location:'Pantry',note:''},
{id:'h_cumin',name:'Ground cumin',qty:0,unit:'',location:'Pantry',note:''},
{id:'h_peas',name:'Frozen peas',qty:400,unit:'g',location:'Freezer',note:''},
{id:'h_garlic',name:'Garlic',qty:6,unit:'clove',location:'Pantry',note:''},
{id:'h_tea',name:'Tea bags',qty:40,unit:'pcs',location:'Pantry',note:'enough for the month'},
{id:'h_water',name:'Sparkling water',qty:2,unit:'bottle',location:'Drinks',note:''}
]};

