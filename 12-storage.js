/* ================= Local-first storage (IndexedDB) ================= */
/* One document-store interface, two backends: IdbBackend (browser) and MemoryBackend (tests, fallback).
   Every document key is "<profileId>/<path>" so profiles never share budgets, lists, receipts, pets or health data.
   The Claude artifact backend (claude.use("db")) is handled separately in boot() and is unchanged. */
const PLENTY_DB_NAME='plenty';
const PLENTY_DB_VERSION=2;           // IndexedDB object-store schema version
const PLENTY_DATA_VERSION=2;         // shape of the documents inside (migrated per profile)
const IDB_SCHEMA={                   // version -> upgrade step (runs inside onupgradeneeded, in order)
  1:db=>{const d=db.createObjectStore('docs',{keyPath:'key'});d.createIndex('profile','profile',{unique:false});d.createIndex('coll','pcoll',{unique:false});db.createObjectStore('meta',{keyPath:'key'})},
  2:db=>{const b=db.createObjectStore('blobs',{keyPath:'key'});b.createIndex('profile','profile',{unique:false})}};
/* document migrations: dataVersion -> fn(path, data) returning the new data (or null to delete) */
const DATA_MIGRATIONS={
  2:(path,data)=>{if(path==='app/settings'&&data&&!Array.isArray(data.pets)){const pets=[];if(data.petName)pets.push({id:'pet1',name:String(data.petName),type:'dog'});const d={...data,pets};delete d.petName;return d}return data}};
function migrateDoc(path,data,fromVersion){let d=data;for(let v=(fromVersion||1)+1;v<=PLENTY_DATA_VERSION;v++){if(DATA_MIGRATIONS[v])d=DATA_MIGRATIONS[v](path,d)}return d}
const collOf=path=>String(path).split('/')[0];

class MemoryBackend{constructor(){this.docs=new Map();this.blobs=new Map();this.meta=new Map();this.kind='memory'}
  async open(){return this}
  async getDoc(k){return this.docs.has(k)?clone(this.docs.get(k)):null}
  async putDoc(rec){this.docs.set(rec.key,clone(rec))}
  async delDoc(k){this.docs.delete(k)}
  async listDocs(prefix){const out=[];for(const [k,v] of this.docs)if(k.startsWith(prefix))out.push(clone(v));return out}
  async getMeta(k){return this.meta.has(k)?clone(this.meta.get(k)):null}
  async putMeta(k,v){this.meta.set(k,clone(v))}
  async putBlob(rec){this.blobs.set(rec.key,rec)}
  async getBlob(k){return this.blobs.get(k)||null}
  async delBlob(k){this.blobs.delete(k)}
  async listBlobs(prefix){const out=[];for(const [k,v] of this.blobs)if(k.startsWith(prefix))out.push({key:v.key,profile:v.profile,id:v.id,type:v.type,size:v.size,createdAt:v.createdAt});return out}
  async clearPrefix(prefix){for(const k of [...this.docs.keys()])if(k.startsWith(prefix))this.docs.delete(k);for(const k of [...this.blobs.keys()])if(k.startsWith(prefix))this.blobs.delete(k)}
  async count(prefix){let n=0;for(const k of this.docs.keys())if(k.startsWith(prefix))n++;return n}}

class IdbBackend{constructor(){this.db=null;this.kind='idb'}
  open(){return new Promise((res,rej)=>{if(typeof indexedDB==='undefined')return rej(new Error('IndexedDB unavailable'));const req=indexedDB.open(PLENTY_DB_NAME,PLENTY_DB_VERSION);
    req.onupgradeneeded=e=>{const db=req.result;for(let v=(e.oldVersion||0)+1;v<=PLENTY_DB_VERSION;v++)if(IDB_SCHEMA[v])IDB_SCHEMA[v](db)};
    req.onsuccess=()=>{this.db=req.result;this.db.onversionchange=()=>{this.db.close();this.db=null};res(this)};req.onerror=()=>rej(req.error||new Error('Could not open IndexedDB'));req.onblocked=()=>rej(new Error('IndexedDB blocked by another open tab'))})}
  tx(store,mode,fn){return new Promise((res,rej)=>{if(!this.db)return rej(new Error('Database closed'));const t=this.db.transaction(store,mode);const s=t.objectStore(store);let out;try{out=fn(s)}catch(e){return rej(e)}t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||new Error('aborted'))})}
  req(store,mode,fn){return new Promise((res,rej)=>{if(!this.db)return rej(new Error('Database closed'));const t=this.db.transaction(store,mode);const r=fn(t.objectStore(store));r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
  range(prefix){return IDBKeyRange.bound(prefix,prefix+'￿')}
  async getDoc(k){const r=await this.req('docs','readonly',s=>s.get(k));return r||null}
  async putDoc(rec){await this.req('docs','readwrite',s=>s.put(rec))}
  async delDoc(k){await this.req('docs','readwrite',s=>s.delete(k))}
  async listDocs(prefix){return (await this.req('docs','readonly',s=>s.getAll(this.range(prefix))))||[]}
  async getMeta(k){const r=await this.req('meta','readonly',s=>s.get(k));return r?r.value:null}
  async putMeta(k,v){await this.req('meta','readwrite',s=>s.put({key:k,value:v}))}
  async putBlob(rec){await this.req('blobs','readwrite',s=>s.put(rec))}
  async getBlob(k){const r=await this.req('blobs','readonly',s=>s.get(k));return r||null}
  async delBlob(k){await this.req('blobs','readwrite',s=>s.delete(k))}
  async listBlobs(prefix){const all=(await this.req('blobs','readonly',s=>s.getAll(this.range(prefix))))||[];return all.map(v=>({key:v.key,profile:v.profile,id:v.id,type:v.type,size:v.size,createdAt:v.createdAt}))}
  async clearPrefix(prefix){await this.req('docs','readwrite',s=>s.delete(this.range(prefix)));await this.req('blobs','readwrite',s=>s.delete(this.range(prefix)))}
  async count(prefix){return (await this.req('docs','readonly',s=>s.count(this.range(prefix))))||0}}

const Store={backend:null,profileId:null,registry:{profiles:[],activeId:null},
  async init(backend){this.backend=backend;await backend.open();const reg=await backend.getMeta('profiles');this.registry=reg&&Array.isArray(reg.profiles)?reg:{profiles:[],activeId:null};this.profileId=this.registry.activeId&&this.registry.profiles.some(p=>p.id===this.registry.activeId)?this.registry.activeId:null;if(this.profileId)await this.migrateProfileData(this.profileId);return this},
  key(path,pid){return (pid||this.profileId)+'/'+path},
  async get(path,pid){const r=await this.backend.getDoc(this.key(path,pid));return r?r.data:null},
  async set(path,data,pid){const p=pid||this.profileId;if(!p)throw new Error('No active profile');await this.backend.putDoc({key:this.key(path,p),profile:p,pcoll:p+'/'+collOf(path),path,data:clone(data),updatedAt:Date.now()})},
  async del(path,pid){await this.backend.delDoc(this.key(path,pid))},
  async list(coll,pid){const p=pid||this.profileId;const rows=await this.backend.listDocs(p+'/'+coll+'/');const out={};for(const r of rows){const rest=r.path.slice(coll.length+1);if(!rest.includes('/'))out[rest]=r.data}return out},
  async allDocs(pid){const rows=await this.backend.listDocs((pid||this.profileId)+'/');const out={};for(const r of rows)out[r.path]=r.data;return out},
  /* blobs (receipt images) */
  async putBlob(id,blob,meta,pid){const p=pid||this.profileId;await this.backend.putBlob({key:p+'/'+id,profile:p,id,blob,type:blob&&blob.type||(meta&&meta.type)||'application/octet-stream',size:blob&&blob.size||0,createdAt:Date.now(),...(meta||{})})},
  async getBlob(id,pid){return this.backend.getBlob(this.key(id,pid))},
  async delBlob(id,pid){await this.backend.delBlob(this.key(id,pid))},
  async listBlobs(pid){return this.backend.listBlobs((pid||this.profileId)+'/')},
  /* profiles */
  async saveRegistry(){await this.backend.putMeta('profiles',this.registry)},
  async createProfile(name,opts){const id='p_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);this.registry.profiles.push({id,name:String(name||'Me').trim()||'Me',createdAt:Date.now(),dataVersion:PLENTY_DATA_VERSION});if(!opts||opts.activate!==false)this.registry.activeId=id;await this.saveRegistry();if(!opts||opts.activate!==false)this.profileId=id;return id},
  async switchProfile(id){if(!this.registry.profiles.some(p=>p.id===id))throw new Error('Unknown profile');this.registry.activeId=id;this.profileId=id;await this.saveRegistry();await this.migrateProfileData(id)},
  async renameProfile(id,name){const p=this.registry.profiles.find(x=>x.id===id);if(p){p.name=String(name).trim()||p.name;await this.saveRegistry()}},
  async deleteProfile(id){await this.backend.clearPrefix(id+'/');this.registry.profiles=this.registry.profiles.filter(p=>p.id!==id);if(this.registry.activeId===id){this.registry.activeId=null;this.profileId=null}await this.saveRegistry()},
  async clearProfile(id){await this.backend.clearPrefix((id||this.profileId)+'/')},
  async migrateProfileData(id){const p=this.registry.profiles.find(x=>x.id===id);if(!p)return;const from=p.dataVersion||1;if(from>=PLENTY_DATA_VERSION)return;const rows=await this.backend.listDocs(id+'/');for(const r of rows){const nd=migrateDoc(r.path,r.data,from);if(nd===null)await this.backend.delDoc(r.key);else if(nd!==r.data)await this.backend.putDoc({...r,data:nd,updatedAt:Date.now()})}p.dataVersion=PLENTY_DATA_VERSION;await this.saveRegistry()}};

/* UI-only preferences (small, non-sensitive) */
function uiPref(k){try{const o=JSON.parse(localStorage.getItem('plenty:ui')||'{}');return o[k]}catch(e){return undefined}}
function setUiPref(k,v){try{const o=JSON.parse(localStorage.getItem('plenty:ui')||'{}');o[k]=v;localStorage.setItem('plenty:ui',JSON.stringify(o))}catch(e){}}

/* Prototype data left by the earlier localStorage fallback (keys "plenty:<path>") */
function detectPrototypeLocalData(ls){const src=ls||(typeof localStorage!=='undefined'?localStorage:null);if(!src)return {count:0,docs:{}};const docs={};try{for(let i=0;i<src.length;i++){const k=src.key(i);if(!k||!k.startsWith('plenty:')||k==='plenty:ui'||k==='plenty:migrated')continue;try{docs[k.slice(7)]=JSON.parse(src.getItem(k))}catch(e){}}}catch(e){}
  const c=Object.keys(docs);return {count:c.length,docs,recipes:c.filter(p=>p.startsWith('recipes/')).length,weeks:c.filter(p=>p.startsWith('weeks/')).length,items:c.filter(p=>p.startsWith('items/')).length,hasHealth:c.includes('app/health'),hasReceipts:c.some(p=>p.startsWith('weeks/')&&docs[p]&&(docs[p].trips||[]).length),settingsName:docs['app/settings']&&docs['app/settings'].profileName||''}}
async function importPrototypeData(detected,profileId){let n=0;for(const path in detected.docs){const data=migrateDoc(path,detected.docs[path],1);if(data===null)continue;await Store.set(path,data,profileId);n++}return n}
function markPrototypeMigrated(){try{localStorage.setItem('plenty:migrated',new Date().toISOString())}catch(e){}}
function removePrototypeLocalData(){try{const ks=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith('plenty:')&&k!=='plenty:ui')ks.push(k)}ks.forEach(k=>localStorage.removeItem(k))}catch(e){}}
