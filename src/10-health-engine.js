/* ================= Weekly Health Check engine (DOM-free) ================= */
/* Supportive, non-diagnostic. Distinguishes planned / purchased / reported. Never counts the pet's food. */
const HEALTH_GOALS=[['balanced','Eat more balanced meals'],['heart','Support heart health'],['cholesterol','Improve cholesterol-conscious choices'],['veg','Eat more vegetables'],['fiber','Eat more fiber'],['snacks','Reduce highly processed snacks'],['protein','Eat enough protein'],['maintain','Maintain weight'],['energy','Improve energy'],['none','No specific goal'],['lose','Lose weight gradually (only if you choose this)']];
const HEALTH_CONSIDERATIONS=[['cholesterol','Cholesterol-conscious eating'],['bloodpressure','Blood-pressure-conscious (less salt)'],['bloodsugar','Blood-sugar-conscious'],['ibs','Sensitive digestion'],['pregnancy','Pregnancy or breastfeeding'],['other','Other (note below)']];
const ACTIVITY_LEVELS=[['low','Mostly sitting'],['light','Lightly active'],['moderate','Moderately active'],['high','Very active']];
const PURPOSES=[['week','For this week'],['stockup','Stock-up item'],['guests','For guests'],['occasion','Special occasion'],['pet','Primarily for the pet'],['notme','Not consumed by me']];
const FOOD_RE={
  veg:/\b(spinach|broccoli|kale|lettuce|rocket|arugula|cabbage|carrot|pepper|capsicum|tomato|cucumber|onion|leek|courgette|zucchini|aubergine|eggplant|mushroom|pea|green bean|bean sprout|celery|cauliflower|sweet potato|potato|pumpkin|squash|beetroot|beet|asparagus|corn|sweetcorn|salad|avocado|parsley|coriander|spring onion|garlic|ginger|chard|bok choy|pak choi|radish|fennel|artichoke|okra|turnip|swede|parsnip|romaine|mixed veg)/i,
  fruit:/\b(apple|banana|berry|berries|blueberr|strawberr|raspberr|orange|mandarin|clementine|grape|pear|peach|plum|mango|pineapple|kiwi|melon|watermelon|lemon|lime|cherry|cherries|apricot|fig|date|pomegranate|nectarine|papaya|fruit)/i,
  wholegrain:/\b(oat|oats|wholegrain|whole grain|wholemeal|whole wheat|brown rice|quinoa|bulgur|barley|buckwheat|rye|wholegrain pasta|whole wheat pasta|spelt|granola|muesli)/i,
  legume:/\b(bean|beans|lentil|chickpea|garbanzo|hummus|tofu|tempeh|edamame|pea protein|black bean|kidney bean|cannellini|butter bean)/i,
  nutsSeeds:/\b(almond|walnut|cashew|pecan|hazelnut|pistachio|peanut|nut|nuts|seed|seeds|chia|flax|linseed|sesame|tahini|pumpkin seed|sunflower seed)/i,
  fish:/\b(salmon|tuna|cod|haddock|mackerel|sardine|trout|prawn|shrimp|fish|seafood|anchov|mussel|squid|crab)/i,
  poultry:/\b(chicken|turkey|poultry)/i,
  eggs:/\b(egg|eggs)\b/i,
  dairy:/\b(yogurt|yoghurt|milk|cheese|cheddar|feta|mozzarella|parmesan|halloumi|cottage|quark|skyr|kefir)/i,
  redMeat:/\b(beef|pork|lamb|steak|mince|veal|venison|burger)\b/i,
  processedMeat:/\b(bacon|sausage|ham|salami|chorizo|pepperoni|hot dog|deli meat|prosciutto|spam|nuggets?)\b/i,
  sweet:/\b(chocolate|candy|sweets|cookie|cookies|biscuit|cake|pastry|croissant|donut|doughnut|ice cream|gelato|muffin|brownie|pudding|jam|nutella|marshmallow|gummy|lolly|toffee|fudge)/i,
  processedSnack:/\b(crisps|chips|pretzel|popcorn chips|cheese puffs|nachos|protein bar|granola bar|cereal bar|energy bar|energy drink|soda|cola|lemonade|fizzy drink|sugary drink|instant noodle|ready meal|frozen pizza|pizza)\b/i,
  unsatFat:/\b(olive oil|rapeseed oil|canola oil|avocado oil|sunflower oil|avocado)\b/i,
  satFat:/\b(butter|cream|lard|ghee|coconut oil|coconut milk|double cream)\b/i
};
const PROTEIN_TYPES=['fish','poultry','eggs','dairy','legume','nutsSeeds','redMeat','processedMeat'];
function classifyFood(name){const n=String(name||'').toLowerCase();const tags=new Set();for(const k in FOOD_RE)if(FOOD_RE[k].test(n))tags.add(k);
  if(tags.has('processedMeat'))tags.delete('redMeat');if(/\bturkey mince|chicken mince\b/.test(n)){tags.delete('redMeat');tags.add('poultry')}
  if(/\bpeanut butter\b/.test(n)){tags.add('nutsSeeds')}if(/\b(dark chocolate|protein bar|granola bar|popcorn)\b/.test(n))tags.add('snackLike');
  if(tags.has('fruit')&&/\b(juice|jam)\b/.test(n))tags.delete('fruit');if(/\bsweet potato\b/.test(n)){tags.delete('sweet')}
  return tags}
const isSweetOrProcessed=tags=>tags.has('sweet')||tags.has('processedSnack');
const isMeatTag=tags=>tags.has('redMeat')||tags.has('poultry')||tags.has('processedMeat');
const isPlantProtein=tags=>tags.has('legume')||tags.has('nutsSeeds');

/* ---- health profile & check-ins (stored in app/health, app/checkins) ---- */
const EMPTY_HEALTH=()=>({age:null,sex:'',heightCm:null,weightKg:null,activity:'',goals:[],preferences:'',considerations:[],considerationNote:'',limit:[],moreOften:[],dismissedSwaps:{},updatedAt:null});
function healthProfile(){S.health=S.health||EMPTY_HEALTH();if(!S.health.goals)S.health.goals=[];if(!S.health.dismissedSwaps)S.health.dismissedSwaps={};return S.health}
function hasHealthProfile(p){p=p||healthProfile();return !!(p.age||p.sex||p.heightCm||p.weightKg||p.activity||(p.goals||[]).length||p.preferences||(p.considerations||[]).length||(p.limit||[]).length||(p.moreOften||[]).length)}
function saveHealthProfile(patch){const p=healthProfile();Object.assign(p,patch,{updatedAt:Date.now()});return writeDoc('app/health',p)}
function deleteHealthProfile(){const keep=healthProfile().dismissedSwaps||{};S.health={...EMPTY_HEALTH(),dismissedSwaps:keep};return writeDoc('app/health',S.health)}
const wantsWeightLoss=p=>((p||healthProfile()).goals||[]).includes('lose');
const cholesterolConscious=p=>{p=p||healthProfile();return (p.considerations||[]).includes('cholesterol')||(p.goals||[]).includes('cholesterol')||(p.goals||[]).includes('heart')};
function checkins(){S.checkins=S.checkins||{days:{},dismissed:{}};if(!S.checkins.days)S.checkins.days={};if(!S.checkins.dismissed)S.checkins.dismissed={};return S.checkins}
function saveCheckin(date,answers){const c=checkins();c.days[date]={...(c.days[date]||{}),...answers,at:Date.now()};const keys=Object.keys(c.days).sort();if(keys.length>90)for(const k of keys.slice(0,keys.length-90))delete c.days[k];return writeDoc('app/checkins',c)}
function dismissCheckin(date){const c=checkins();c.dismissed[date]=true;const ks=Object.keys(c.dismissed).sort();if(ks.length>30)for(const k of ks.slice(0,ks.length-30))delete c.dismissed[k];return writeDoc('app/checkins',c)}

/* ---- planned pattern (from recipes in the week's slots; leftovers count as the same recipe) ---- */
function planFoodProfile(wk){wk=wk||week();const meals=[];for(const e of planEntries(wk)){let r=null;if(e.type==='recipe')r=e.recipe;else if(e.type==='leftovers')r=e.recipe;else if(e.type==='item')r=null;
    if(r){const tags=new Set();const names=[];for(const i of (r.ingredients||[])){const t=classifyFood(i.name);t.forEach(x=>tags.add(x));if(t.has('veg')||t.has('fruit'))names.push(canon(i.name))}meals.push({day:e.day,meal:e.meal,recipe:r,tags,names,leftovers:e.type==='leftovers',hasNutrition:!!(r.nutrition&&r.nutrition.kcal),estimated:!!r.nutritionEstimated})}
    else if(e.item){const t=classifyFood(e.item.name);meals.push({day:e.day,meal:e.meal,item:e.item,tags:t,names:t.has('veg')||t.has('fruit')?[canon(e.item.name)]:[],portion:true})}}
  const substantive=meals.filter(m=>!m.portion&&['breakfast','lunch','dinner'].includes(m.meal));
  const vegMeals=substantive.filter(m=>m.tags.has('veg'));const vegVariety=new Set();substantive.forEach(m=>m.names.filter(n=>FOOD_RE.veg.test(n)).forEach(n=>vegVariety.add(n)));
  const fruitPortions=meals.filter(m=>m.tags.has('fruit')).length;const fruitVariety=new Set();meals.forEach(m=>m.names.filter(n=>FOOD_RE.fruit.test(n)).forEach(n=>fruitVariety.add(n)));
  const fiber=new Set();meals.forEach(m=>{for(const i of ((m.recipe&&m.recipe.ingredients)||(m.item?[m.item]:[]))){const t=classifyFood(i.name);if(t.has('wholegrain')||t.has('legume')||t.has('nutsSeeds'))fiber.add(canon(i.name))}});
  const proteinMeals=substantive.filter(m=>PROTEIN_TYPES.some(t=>m.tags.has(t)));const proteinTypes={};PROTEIN_TYPES.forEach(t=>proteinTypes[t]=substantive.filter(m=>m.tags.has(t)).length);
  const meatMeals=substantive.filter(m=>isMeatTag(m.tags)).length;const redMeatMeals=substantive.filter(m=>m.tags.has('redMeat')).length;const processedMeatMeals=substantive.filter(m=>m.tags.has('processedMeat')).length;const plantProteinMeals=substantive.filter(m=>isPlantProtein(m.tags)&&!isMeatTag(m.tags)).length;const fishMeals=proteinTypes.fish;
  const sweets=meals.filter(m=>isSweetOrProcessed(m.tags)).length;const daysWithVeg=new Set(vegMeals.map(m=>m.day));
  const heartPos=new Set();meals.forEach(m=>{for(const i of ((m.recipe&&m.recipe.ingredients)||[])){const t=classifyFood(i.name);if(t.has('wholegrain')||t.has('unsatFat')||t.has('fish')||t.has('legume')||t.has('nutsSeeds'))heartPos.add(canon(i.name))}});
  const satFatMeals=substantive.filter(m=>m.tags.has('satFat')||m.tags.has('redMeat')||m.tags.has('processedMeat')).length;
  const nutritionKnown=substantive.filter(m=>m.hasNutrition&&!m.estimated).length,nutritionEstimated=substantive.filter(m=>m.hasNutrition&&m.estimated).length,nutritionUnknown=substantive.filter(m=>!m.hasNutrition).length;
  return {meals:substantive.length,vegMeals:vegMeals.length,vegVariety:[...vegVariety],daysWithVeg:daysWithVeg.size,fruitPortions,fruitVariety:[...fruitVariety],fiber:[...fiber],proteinMeals:proteinMeals.length,proteinTypes,proteinTypeCount:PROTEIN_TYPES.filter(t=>proteinTypes[t]>0).length,meatMeals,redMeatMeals,processedMeatMeals,plantProteinMeals,fishMeals,sweets,heartPos:[...heartPos],satFatMeals,nutrition:{known:nutritionKnown,estimated:nutritionEstimated,unknown:nutritionUnknown}}}

/* ---- purchases: the grocery list to buy (planned purchases) and confirmed receipt lines for this week ---- */
function linePurpose(l){if(l.purpose)return l.purpose;if(l.pet)return 'pet';return 'week'}
function receiptLinesForWeek(wk,opts){opts=opts||{};const out=[];for(const t of ((wk||week()).trips||[]))for(const l of (t.lines||[])){if(l.status==='skip'||l.status==='duplicate')continue;const p=linePurpose(l);if(p==='pet'||p==='notme')continue;if(!opts.includeStockup&&p!=='week')continue;out.push({...l,purpose:p,tags:classifyFood(l.name)})}return out}
function purchaseFoodProfile(wk){wk=wk||week();const listLines=buildList(wk,S.ui.weekKey).filter(l=>!(l.atHome&&l.atHome.all)&&!l.staple&&!l.items.some(i=>i.kind==='pet'));
  const planned=listLines.map(l=>({name:l.name,tags:classifyFood(l.name),source:'list'}));const bought=receiptLinesForWeek(wk).map(l=>({name:l.name,tags:l.tags,source:'receipt'}));
  const count=(arr,fn)=>arr.filter(x=>fn(x.tags)).length;const names=(arr,fn)=>[...new Set(arr.filter(x=>fn(x.tags)).map(x=>canon(x.name)))];
  const prof=arr=>({fruit:count(arr,t=>t.has('fruit')),fruitNames:names(arr,t=>t.has('fruit')),veg:count(arr,t=>t.has('veg')),vegNames:names(arr,t=>t.has('veg')),fiber:names(arr,t=>t.has('wholegrain')||t.has('legume')||t.has('nutsSeeds')),sweets:count(arr,isSweetOrProcessed),sweetNames:names(arr,isSweetOrProcessed),meat:count(arr,isMeatTag),plantProtein:count(arr,t=>isPlantProtein(t)&&!isMeatTag(t)),fish:count(arr,t=>t.has('fish')),proteinTypes:PROTEIN_TYPES.filter(t=>arr.some(x=>x.tags.has(t))),total:arr.length});
  return {planned:prof(planned),bought:prof(bought),hasReceipts:bought.length>0}}

/* ---- receipt trends across weeks (confirmed lines only; at least 4 weeks with receipts) ---- */
function receiptTrends(currentKey){currentKey=currentKey||S.ui.weekKey;const cur=parseISO(currentKey);const rows=[];for(let i=1;i<=8;i++){const k=iso(addDays(cur,-7*i));const w=S.weeks[k];if(!w||!(w.trips||[]).some(t=>(t.lines||[]).length))continue;const lines=receiptLinesForWeek(w);const stock=receiptLinesForWeek(w,{includeStockup:true}).filter(l=>l.purpose!=='week');
    const tags=lines.map(l=>l.tags);rows.push({key:k,fruit:tags.some(t=>t.has('fruit')),veg:tags.filter(t=>t.has('veg')).length,sweets:tags.filter(isSweetOrProcessed).length,meat:tags.filter(isMeatTag).length,plant:tags.filter(t=>isPlantProtein(t)&&!isMeatTag(t)).length,fish:tags.filter(t=>t.has('fish')).length,stockup:stock.length,vegPlanned:planFoodProfile(w).vegMeals})}
  const n=rows.length;if(n<4)return {enough:false,weeks:n,lines:[]};const avg=k=>rows.reduce((a,r)=>a+r[k],0)/n;const older=rows.slice(Math.floor(n/2)),recent=rows.slice(0,Math.floor(n/2));const avgOf=(arr,k)=>arr.reduce((a,r)=>a+r[k],0)/(arr.length||1);
  const out=[];const fruitWeeks=rows.filter(r=>r.fruit).length;out.push(`You bought fruit in ${fruitWeeks} of the last ${n} weeks with receipts.`);
  const sw=avg('sweets');const swRecent=avgOf(recent,'sweets'),swOlder=avgOf(older,'sweets');if(swRecent>=swOlder+1.5)out.push(`Sweet or highly processed snack purchases rose from about ${Math.round(swOlder)} to ${Math.round(swRecent)} products a week.`);else if(swOlder>=swRecent+1.5)out.push(`Sweet or highly processed snack purchases eased from about ${Math.round(swOlder)} to ${Math.round(swRecent)} products a week.`);
  const meatAll=avg('meat'),plantAll=avg('plant'),fishAll=avg('fish');if(meatAll>plantAll+fishAll&&meatAll>0)out.push('Most of your protein purchases currently come from meat.');if(avgOf(recent,'plant')>avgOf(older,'plant')+0.5)out.push('Your recent purchases contain more plant-based proteins.');
  if(rows.filter(r=>r.veg>=2&&r.vegPlanned===0).length>=2)out.push('You regularly buy vegetables but sometimes do not assign them to meals.');
  return {enough:true,weeks:n,sweetAvg:sw,fruitWeeks,lines:out}}

/* ---- the five indicators ---- */
const STATUS_LABEL={balanced:'Looking balanced',more:'Could use a little more',higher:'Higher than your usual target',unknown:'Not enough information yet'};
function healthCheck(wk){wk=wk||week();const p=healthProfile();const plan=planFoodProfile(wk);const buy=purchaseFoodProfile(wk);const trend=receiptTrends();const chol=cholesterolConscious(p);const noData=plan.meals===0&&buy.planned.total===0&&!buy.hasReceipts;
  const ind=[];const positives=[],improvements=[];
  // Vegetables & fruit
  {const fruitTotal=plan.fruitPortions+buy.planned.fruit+buy.bought.fruit;let status,text;
    if(noData){status='unknown';text='Plan a few meals or add regular groceries and this fills in.'}
    else{const vegOk=plan.vegMeals>=4&&plan.daysWithVeg>=3;const fruitOk=fruitTotal>=3;status=vegOk&&fruitOk?'balanced':'more';
      const parts=[];parts.push(plan.meals?`Based on the recipes currently planned, vegetables appear in ${plan.vegMeals} of ${plan.meals} meals across ${plan.daysWithVeg} day${plan.daysWithVeg===1?'':'s'}${plan.vegVariety.length?` (${plan.vegVariety.length} kinds)`:''}.`:'No recipe meals are planned yet.');
      if(fruitTotal===0)parts.push('No fruit is planned or on the list. Adding bananas or berries would make the week more balanced.');else parts.push(`Fruit shows up ${fruitTotal} time${fruitTotal===1?'':'s'} between planned portions and the list${buy.bought.fruit?', including your receipts':''}.`);text=parts.join(' ')
      if(vegOk)positives.push(`Vegetables appear in ${plan.vegMeals} planned meals.`);else if(plan.meals)improvements.push(plan.vegMeals?`Vegetables are in only ${plan.vegMeals} planned meal${plan.vegMeals===1?'':'s'}.`:'None of the planned meals include vegetables yet.');
      if(fruitOk)positives.push(`Fruit is planned or listed ${fruitTotal} times.`);else improvements.push(fruitTotal?`Fruit is currently planned only ${fruitTotal===1?'once':fruitTotal+' times'}.`:'No fruit is planned.')}
    ind.push({key:'veg',label:'Vegetables and fruit',status,text,basis:buy.hasReceipts?'plan + purchases':'plan + list'})}
  // Fiber
  {const sources=[...new Set([...plan.fiber,...buy.planned.fiber,...buy.bought.fiber])];const vegOrFruit=plan.vegMeals>0||buy.planned.fruit>0||buy.planned.veg>0;let status,text;
    if(noData){status='unknown';text='Fiber-rich staples such as oats, wholegrain bread, beans and lentils will show here.'}
    else{status=sources.length>=3&&vegOrFruit?'balanced':'more';text=sources.length?`This week contains ${sources.slice(0,4).map(cap).join(', ')}${sources.length>4?' and more':''}${vegOrFruit?' plus vegetables or fruit':''}, ${status==='balanced'?'giving you a good fiber base.':'a start you could build on with wholegrain bread, brown rice, beans or lentils.'}`:'No obvious fiber-rich staples yet. Oats, wholegrain bread, beans, lentils or chickpeas are easy additions.';
      if(status==='balanced')positives.push(`${sources.slice(0,3).map(cap).join(', ')} support fiber intake.`);else improvements.push(sources.length?'Only a few fiber-rich staples are in the week.':'No fiber-rich staples are planned yet.')}
    ind.push({key:'fiber',label:'Fiber-rich foods',status,text,basis:'plan + list'})}
  // Protein variety
  {let status,text;const types=PROTEIN_TYPES.filter(t=>plan.proteinTypes[t]>0);const meatShare=plan.proteinMeals?plan.meatMeals/plan.proteinMeals:0;
    if(!plan.meals){status=buy.planned.proteinTypes.length?'more':'unknown';text=buy.planned.proteinTypes.length?`Your list suggests protein from ${buy.planned.proteinTypes.map(t=>({fish:'fish',poultry:'chicken or turkey',eggs:'eggs',dairy:'yogurt and dairy',legume:'beans, lentils or chickpeas',nutsSeeds:'nuts and seeds',redMeat:'red meat',processedMeat:'processed meat'})[t]).join(', ')}, but no recipe meals are planned yet.`:'Plan a few meals and this fills in.'}
    else{status=types.length>=3&&meatShare<=0.6?'balanced':'more';const pretty=t=>({fish:'fish',poultry:'chicken or turkey',eggs:'eggs',dairy:'yogurt and dairy',legume:'beans, lentils or chickpeas',nutsSeeds:'nuts and seeds',redMeat:'red meat',processedMeat:'processed meat'})[t];
      text=`Protein comes from ${types.map(pretty).join(', ')||'no clear source yet'}. ${plan.meatMeals?`${plan.meatMeals} of ${plan.meals} planned meals use meat.`:'No planned meal relies on meat.'}${meatShare>0.6?` Replacing one with lentils, chickpeas or tofu would create more variety${chol?' and may lower the week\'s saturated-fat estimate':''}.`:''}`;
      if(status==='balanced')positives.push(`Protein comes from ${types.slice(0,4).map(pretty).join(', ')}.`);if(meatShare>0.6)improvements.push(`${plan.meatMeals} meals contain meat.`);else if(types.length<3&&plan.proteinMeals)improvements.push('Protein comes from only one or two kinds of food so far.')}
    ind.push({key:'protein',label:'Protein variety',status,text,basis:'plan'})}
  // Heart-conscious choices
  {let status,text;const pos=plan.heartPos;const negatives=plan.redMeatMeals+plan.processedMeatMeals;const sweetsAll=plan.sweets+buy.planned.sweets+buy.bought.sweets;
    if(noData){status='unknown';text='This looks at the overall pattern: whole grains, fish, legumes, nuts, olive oil, fruit and vegetables versus red and processed meat and highly processed foods.'}
    else{status=pos.length>=3&&negatives<=2&&sweetsAll<=4?'balanced':'more';text=`${pos.length?`This plan includes ${pos.slice(0,4).map(cap).join(', ')}. Those choices support a more heart-conscious weekly pattern.`:'Few of the classic heart-conscious foods (oats, olive oil, fish, legumes, nuts) are in the plan yet.'}${negatives?` Red or processed meat appears in ${negatives} meal${negatives===1?'':'s'}.`:''}${chol&&negatives>=2?' One easy swap toward fish or legumes would fit your cholesterol-conscious preference.':''} This is general food-pattern guidance, not medical advice.`;
      if(status==='balanced')positives.push('Whole grains, legumes, fish or olive oil give the week a heart-conscious base.');else if(negatives>2)improvements.push(`Red or processed meat appears in ${negatives} meals.`)}
    ind.push({key:'heart',label:'Heart-conscious choices',status,text,basis:'plan + list'})}
  // Sweets & highly processed snacks
  {let status,text;const planned=plan.sweets+buy.planned.sweets;const bought=buy.bought.sweets;const total=Math.max(planned,bought);const baseline=trend.enough?trend.sweetAvg:null;
    if(noData){status='unknown';text='Sweets and highly processed snacks on the list or receipts will show here, with your recent average once there are a few weeks of receipts.'}
    else{status=baseline!=null?(bought>baseline+1||planned>baseline+1?'higher':'balanced'):(total>=4?'higher':'balanced');
      const names=[...new Set([...buy.planned.sweetNames,...buy.bought.sweetNames])].slice(0,4).map(cap);
      text=bought?`Your purchases suggest ${bought} sweet or highly processed snack product${bought===1?'':'s'} this week${baseline!=null?`, ${bought>baseline+1?'higher than':'in line with'} your recent average of about ${Math.round(baseline)}`:''}. We cannot know from the receipt how much of it you ate.`:planned?`The plan and list include ${planned} sweet or highly processed snack product${planned===1?'':'s'}${names.length?` (${names.join(', ')})`:''}${baseline!=null?`, ${planned>baseline+1?'higher than':'around'} your recent average of about ${Math.round(baseline)}`:''}.`:'No sweets or highly processed snacks are planned or listed. Nothing wrong with a treat when you want one.';
      if(status==='higher')improvements.push(bought?'This week\'s receipts include more sweet snacks than your recent average.':'The list has more sweet or processed snacks than a typical week.');else if(total>0)positives.push('Sweets stay at a modest level.')}
    ind.push({key:'sweets',label:'Sweets and highly processed snacks',status,text,basis:buy.hasReceipts?'list + purchases':'list'})}
  const unknown=ind.filter(i=>i.status==='unknown').length;const balanced=ind.filter(i=>i.status==='balanced').length;
  const summary=noData?'Not enough information yet. Plan meals or add groceries and the check fills in.':unknown>=3?'Only part of the week is visible so far.':balanced>=4?'Your week looks well balanced.':balanced>=2?'Your week looks fairly balanced.':'Your week has a few easy places to add balance.';
  const action=suggestAction(plan,buy,ind,p);
  return {indicators:ind,summary,positives:positives.slice(0,4),improvements:improvements.slice(0,3),action,plan,buy,trend,profileUsed:{cholesterol:chol,goals:p.goals||[]},nutritionNote:plan.meals?`Nutrition data: ${plan.nutrition.known} meal${plan.nutrition.known===1?'':'s'} with source data, ${plan.nutrition.estimated} estimated, ${plan.nutrition.unknown} unknown. The check uses ingredient patterns, not exact values.`:''}}
function suggestAction(plan,buy,ind,p){const bits=[];if(plan.meals===0&&buy.planned.total===0&&!buy.hasReceipts)return '';const fruitTotal=plan.fruitPortions+buy.planned.fruit+buy.bought.fruit;if(fruitTotal<3)bits.push('add bananas or another fruit for a few days');if(plan.proteinMeals&&plan.meatMeals/plan.proteinMeals>0.6)bits.push('replace one meat meal with a chickpea or lentil recipe');else if(plan.meals&&plan.vegMeals<4)bits.push('add a vegetable side to one or two dinners');
  const sw=ind.find(i=>i.key==='sweets');if(sw&&sw.status==='higher')bits.push('keep the treats you want and swap one for fruit, yogurt or nuts');const fb=ind.find(i=>i.key==='fiber');if(fb&&fb.status==='more'&&bits.length<2)bits.push('choose wholegrain bread or brown rice this week');
  if(!bits.length)return plan.meals?'Keep going as you are; nothing needs changing this week.':'';let s=bits.slice(0,2).join(' and ');return s[0].toUpperCase()+s.slice(1)+'.'}

/* ---- shopping-list notes and sweet swaps (never silent: the user chooses) ---- */
function listHealthNotes(lines){const L=(lines||buildList()).filter(l=>!(l.atHome&&l.atHome.all)&&!l.staple&&!l.items.some(i=>i.kind==='pet'));if(!L.length)return [];const tags=L.map(l=>classifyFood(l.name));const notes=[];
  const veg=new Set();L.forEach((l,i)=>{if(tags[i].has('veg'))veg.add(l.canon)});if(veg.size>=5)notes.push('Good vegetable variety');else if(veg.size===0)notes.push('No vegetables on the list yet');
  if(!tags.some(t=>t.has('fruit')))notes.push('No fruit currently on the list');
  const meat=tags.filter(isMeatTag).length,plant=tags.filter(t=>(isPlantProtein(t)||t.has('fish')||t.has('eggs'))&&!isMeatTag(t)).length;if(meat>0&&meat>=plant*2)notes.push('Most proteins this week come from meat');
  const fiber=tags.filter(t=>t.has('wholegrain')||t.has('legume')||t.has('nutsSeeds')).length;if(fiber>=3)notes.push('You have several fiber-rich staples');
  const sweets=tags.filter(isSweetOrProcessed).length;const tr=receiptTrends();if(tr.enough&&sweets>tr.sweetAvg+1)notes.push('This list contains more sweets than your usual week');else if(sweets>=4)notes.push(`${sweets} sweet or processed snack products on the list`);
  if(tags.filter(t=>t.has('redMeat')||t.has('processedMeat')||t.has('satFat')).length>=2&&cholesterolConscious())notes.push('One easy swap could reduce saturated fat');
  return notes.slice(0,4)}
const SWEET_ALTERNATIVES=[{name:'Bananas',qty:6,unit:'pcs',category:'Produce',price:1.5},{name:'Greek yogurt',qty:500,unit:'g',category:'Dairy & eggs',price:2.5},{name:'Mixed nuts',qty:200,unit:'g',category:'Snacks & treats',price:3.0},{name:'Popcorn kernels',qty:250,unit:'g',category:'Snacks & treats',price:1.5},{name:'Hummus',qty:200,unit:'g',category:'Snacks & treats',price:1.6},{name:'Frozen mixed berries',qty:400,unit:'g',category:'Frozen',price:3.0}];
function sweetSwapSuggestions(lines){const dismissed=healthProfile().dismissedSwaps||{};const L=(lines||buildList()).filter(l=>!(l.atHome&&l.atHome.all)&&!l.items.some(i=>i.kind==='pet')&&isSweetOrProcessed(classifyFood(l.name))&&!dismissed[l.canon]);
  return L.map((l,i)=>({line:l,alternatives:[SWEET_ALTERNATIVES[i%SWEET_ALTERNATIVES.length],SWEET_ALTERNATIVES[(i+1)%SWEET_ALTERNATIVES.length]],smaller:`A smaller pack of ${l.name.toLowerCase()}`}))}
function applySweetSwap(line,choice,alt,wk){wk=wk||week();const res={changed:[]};if(choice==='keep')return res;
  if(choice==='dismiss'){const p=healthProfile();p.dismissedSwaps[line.canon]=true;saveHealthProfile({dismissedSwaps:p.dismissedSwaps});res.changed.push('dismissed');return res}
  if(choice==='swap'||choice==='both'){if(alt){wk.extras=wk.extras||[];wk.extras.push({id:uid('x'),name:alt.name,qty:alt.qty,unit:alt.unit,category:alt.category,price:alt.price,priority:'preferred',healthSwap:true});res.changed.push('added '+alt.name)}}
  if(choice==='swap'){wk.buy=wk.buy||{};for(const it of line.items){if((it.priority||'preferred')==='essential')continue;wk.buy[it.id]=false;res.changed.push('postponed '+it.name)}if(line.extras)wk.extras=(wk.extras||[]).filter(x=>!line.extras.some(e=>e.id===x.id));if(line.extras)res.changed.push('removed '+line.name)}
  return res}

/* ---- coach context (minimum needed; no age, height or weight) ---- */
function healthCoachContext(){const p=healthProfile();const hc=healthCheck();const goals=(p.goals||[]).map(g=>(HEALTH_GOALS.find(x=>x[0]===g)||[])[1]).filter(Boolean);
  const prof=hasHealthProfile(p)?`HEALTH PROFILE (user-entered, optional): goals: ${goals.join(', ')||'none'}; considerations: ${(p.considerations||[]).map(c=>(HEALTH_CONSIDERATIONS.find(x=>x[0]===c)||[])[1]).filter(Boolean).join(', ')||'none'}; preferences: ${p.preferences||'none'}; wants to limit: ${(p.limit||[]).join(', ')||'nothing specific'}; wants more often: ${(p.moreOften||[]).join(', ')||'nothing specific'}.${wantsWeightLoss(p)?'':' The user has NOT chosen weight loss as a goal; never suggest it or calorie counting.'}`:'HEALTH PROFILE: none entered. Never assume weight loss or dieting.';
  return `${prof}\nWEEKLY HEALTH CHECK (deterministic, from ingredient patterns): ${hc.summary} ${hc.indicators.map(i=>`${i.label}: ${STATUS_LABEL[i.status]} (${i.basis})`).join('; ')}. Positives: ${hc.positives.join(' ')||'—'} Improvements: ${hc.improvements.join(' ')||'—'}${hc.trend.enough?` Receipt trends (${hc.trend.weeks} weeks): ${hc.trend.lines.join(' ')}`:' Receipt trends: not enough weeks yet.'}`}
const HEALTH_COACH_RULES=()=>`HEALTH GUIDANCE RULES: when the user asks about balance, health, meat, fiber, fruit, vegetables, snacks or cholesterol-conscious eating, give at most THREE prioritized, practical suggestions that fit the budget, the pantry and the grocery-list system. Distinguish planned, purchased and reported-as-eaten; a purchase does not prove it was eaten. Use the deterministic health check above rather than doing your own nutrition arithmetic, and never invent exact nutrition values. Never diagnose, never mention medication, never claim a food treats or prevents a condition; you may say a pattern is more heart-conscious. Never recommend weight loss, dieting or calorie counting unless the user chose that goal. Never remove food silently: propose swaps as actions the user confirms, and keep at least one treat when they ask. Plenty gives general food-planning guidance, not medical care.`;
