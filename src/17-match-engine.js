/* ================= At Home recipe matching =================
   Deterministic and local: a match is based only on the recipe ingredients and
   the inventory saved on this device. No AI or invented substitutions. */
function atHomeRecipeMatch(recipe,ctx){
  ctx=ctx||discoverContext();
  const seen=new Set(),have=[],missing=[];
  for(const ing of (recipe.ingredients||[])){
    const c=canon(ing.name);if(!c||seen.has(c))continue;seen.add(c);
    if(ctx.inv[c])have.push({canon:c,name:ing.name});else missing.push({canon:c,name:ing.name});
  }
  const total=have.length+missing.length;
  return {recipe,have,missing,total,ratio:total?have.length/total:0};
}
function atHomeRecipeMatches(recipes,maxMissing){
  const ctx=discoverContext();
  return filterRecipes(recipes||allDiscoverRecipes(),{},ctx).results
    .map(r=>atHomeRecipeMatch(r,ctx))
    .filter(m=>m.total&&m.have.length&&m.missing.length<=maxMissing)
    .sort((a,b)=>a.missing.length-b.missing.length||b.ratio-a.ratio||a.recipe.name.localeCompare(b.recipe.name));
}
