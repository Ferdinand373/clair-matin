(()=>{
'use strict';

const SYNC_VERSION='Clair Sync 1.0';
const SUPABASE_URL='https://ryyewskgfgysfubesdsj.supabase.co';
const SUPABASE_KEY='sb_publishable_T9Dmg9VKTdMFdCuLVxD54w_7GeH3Q6S';
const APP_ID='clair-matin';
const DATA_KEY='clair-matin.state';
const STORAGE_KEY='clairMatin_v5_4';
const LEGACY_KEYS=['clairMatin_v5_3','clairMatinTaches','clairMatinTasks','clairMatin_v5_tasks','clairMatinData'];
const META_KEY='clairSync.matin.meta.v1';
const FIRST_BACKUP_KEY='clairSync.matin.first-backup.v1';
const RELOAD_GUARD='clairSync.matin.reload.v1';

let client=null;
let user=null;
let syncing=false;
let timer=null;
let watcherStarted=false;
let lastObservedHash='';

function isPlainObject(v){return !!v&&typeof v==='object'&&!Array.isArray(v)}
function stableObject(value){
  if(Array.isArray(value)) return value.map(stableObject);
  if(isPlainObject(value)){
    const out={};
    for(const key of Object.keys(value).sort()) out[key]=stableObject(value[key]);
    return out;
  }
  return value;
}
function hash(value){
  const str=JSON.stringify(stableObject(value||{}));
  let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return (h>>>0).toString(16);
}
function safeParse(raw){try{return raw?JSON.parse(raw):null}catch{return null}}
function validState(v){return isPlainObject(v)&&Array.isArray(v.tasks)}
function normalizeLegacy(value){
  if(Array.isArray(value)) return {tasks:value};
  if(isPlainObject(value)&&Array.isArray(value.tasks)) return {tasks:value.tasks};
  if(isPlainObject(value)&&Array.isArray(value.taches)) return {tasks:value.taches};
  return null;
}
function readLocal(){
  let state=normalizeLegacy(safeParse(localStorage.getItem(STORAGE_KEY)));
  if(validState(state)) return state;
  for(const key of LEGACY_KEYS){
    state=normalizeLegacy(safeParse(localStorage.getItem(key)));
    if(validState(state)){
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state))}catch{}
      return state;
    }
  }
  return {tasks:[]};
}
function writeLocal(state){
  if(!validState(state)) return false;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));return true}catch{return false}
}
function normText(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ')}
function semanticTaskKey(task){return [String(task?.date||''),String(task?.time||''),normText(task?.title)].join('|')}
function taskStamp(task){
  const u=Date.parse(task?.updatedAt||'')||Number(task?.updatedAt)||0;
  const c=Date.parse(task?.createdAt||'')||Number(task?.createdAt)||0;
  return Math.max(u,c);
}
function mergeFirstPair(remote,local){
  if(!validState(remote)) return local;
  if(!validState(local)) return remote;
  const merged=[];
  const byId=new Map();
  const bySemantic=new Map();
  const add=task=>{
    if(!task||typeof task!=='object') return;
    const id=String(task.id||'');
    const sk=semanticTaskKey(task);
    let existing=null;
    if(id&&byId.has(id)) existing=byId.get(id);
    else if(sk&&bySemantic.has(sk)) existing=bySemantic.get(sk);
    if(existing){
      const newer=taskStamp(task)>taskStamp(existing)?task:existing;
      if(newer!==existing){
        const i=merged.indexOf(existing);
        if(i>=0) merged[i]=task;
        if(existing.id) byId.delete(String(existing.id));
        bySemantic.delete(semanticTaskKey(existing));
        if(id) byId.set(id,task);
        if(sk) bySemantic.set(sk,task);
      }
      return;
    }
    merged.push(task);
    if(id) byId.set(id,task);
    if(sk) bySemantic.set(sk,task);
  };
  for(const task of remote.tasks||[]) add(task);
  for(const task of local.tasks||[]) add(task);
  return {tasks:merged};
}
function getMeta(){try{return JSON.parse(localStorage.getItem(META_KEY)||'{}')||{}}catch{return {}}}
function setMeta(patch){try{localStorage.setItem(META_KEY,JSON.stringify({...getMeta(),...patch}))}catch{}}
function deviceLabel(){
  const u=navigator.userAgent||'';
  const p=/iPhone/i.test(u)?'iPhone':/iPad/i.test(u)?'iPad':/Android/i.test(u)?'Android':/Windows/i.test(u)?'Ordinateur Windows':/Macintosh|Mac OS X/i.test(u)?'Mac':'Appareil';
  const b=/Edg\//.test(u)?'Edge':/CriOS|Chrome\//.test(u)?'Chrome':/Safari\//.test(u)&&!/Chrome\//.test(u)&&!/CriOS/.test(u)?'Safari':'Web';
  return p+' • '+b;
}
function setBadge(text,kind='ok'){
  let badge=document.getElementById('clair-sync-badge');
  if(!badge){
    badge=document.createElement('div');
    badge.id='clair-sync-badge';
    badge.style.cssText='max-width:760px;margin:0 auto 10px;padding:8px 11px;border:1px solid rgba(49,41,34,.10);border-radius:13px;background:rgba(255,253,248,.90);color:#b96f39;font-size:11px;font-weight:850;text-align:center;box-shadow:0 4px 14px rgba(66,48,31,.05)';
    const app=document.querySelector('.app');
    if(app) app.insertAdjacentElement('afterbegin',badge); else document.body.prepend(badge);
  }
  badge.textContent=text;
  if(kind==='wait'){badge.style.opacity='.65'}
  else if(kind==='off'){badge.style.color='#75695f';badge.style.background='#f3eee6';badge.style.opacity='1'}
  else {badge.style.color='#466044';badge.style.background='#edf1ea';badge.style.opacity='1'}
}
async function loadSupabase(){
  if(window.supabase) return;
  await new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-clair-supabase]');
    if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.async=true;s.dataset.clairSupabase='1';s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
  });
}
function showLoginPanel(){
  if(document.getElementById('clair-sync-login')) return;
  const overlay=document.createElement('div');
  overlay.id='clair-sync-login';
  overlay.style.cssText='position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:18px;background:rgba(42,34,28,.35);backdrop-filter:blur(8px)';
  const box=document.createElement('div');
  box.style.cssText='width:min(390px,100%);padding:22px;border:1px solid rgba(255,255,255,.88);border-radius:24px;background:#fffdf8;box-shadow:0 24px 80px rgba(42,34,28,.25);color:#312922';
  const title=document.createElement('strong');title.textContent='Connexion Clair Sync';title.style.cssText='display:block;font-family:Georgia,serif;font-size:1.35rem;margin-bottom:7px';
  const copy=document.createElement('p');copy.textContent='Une seule connexion est nécessaire sur cet appareil. Utilisez les mêmes identifiants que pour Mon espace Clair.';copy.style.cssText='margin:0 0 16px;color:#8f8174;font-size:.88rem;line-height:1.45';
  const form=document.createElement('form');form.style.cssText='display:grid;gap:10px';
  const email=document.createElement('input');email.type='email';email.autocomplete='email';email.autocapitalize='none';email.spellcheck=false;email.placeholder='Adresse e-mail';email.required=true;
  const password=document.createElement('input');password.type='password';password.autocomplete='current-password';password.placeholder='Mot de passe';password.required=true;
  for(const input of [email,password]) input.style.cssText='width:100%;min-height:50px;padding:0 13px;border:1px solid rgba(49,41,34,.14);border-radius:14px;background:white;color:#312922;font:inherit;box-sizing:border-box';
  const error=document.createElement('div');error.style.cssText='min-height:18px;color:#9b5a4f;font-size:.78rem;line-height:1.35';
  const submit=document.createElement('button');submit.type='submit';submit.textContent='Se connecter';submit.style.cssText='min-height:50px;border:0;border-radius:14px;background:#312922;color:white;font:inherit;font-weight:900';
  const later=document.createElement('button');later.type='button';later.textContent='Plus tard';later.style.cssText='min-height:42px;border:0;background:transparent;color:#8f8174;font:inherit;font-weight:800';later.onclick=()=>overlay.remove();
  form.onsubmit=async ev=>{
    ev.preventDefault();error.textContent='';submit.disabled=true;submit.textContent='Connexion…';
    try{
      const result=await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});
      if(result.error) throw result.error;
      user=result.data?.session?.user||result.data?.user||null;if(!user) throw new Error('Session non créée');
      password.value='';overlay.remove();setBadge('Clair Sync…','wait');lastObservedHash=hash(readLocal());await syncNow('login');startWatcher();
    }catch(err){console.warn('Clair Sync login',err);error.textContent='Connexion impossible. Vérifiez votre e-mail et votre mot de passe.';submit.disabled=false;submit.textContent='Se connecter'}
  };
  form.append(email,password,error,submit,later);box.append(title,copy,form);overlay.append(box);document.body.append(overlay);setTimeout(()=>email.focus(),120);
}
async function getRemote(){
  const r=await client.from('clair_data').select('payload,revision,updated_at').eq('user_id',user.id).eq('app_id',APP_ID).eq('data_key',DATA_KEY).is('deleted_at',null).maybeSingle();
  if(r.error) throw r.error;return r.data||null;
}
async function pushRemote(row,state){
  const now=new Date().toISOString();
  const r=await client.from('clair_data').upsert({
    user_id:user.id,app_id:APP_ID,data_key:DATA_KEY,
    payload:{value:state,source_device:deviceLabel(),synced_at:now,integration:'clair-sync-matin-1.0'},
    schema_version:1,revision:(row?.revision||0)+1,deleted_at:null,updated_at:now
  },{onConflict:'user_id,app_id,data_key'});
  if(r.error) throw r.error;
}
async function syncNow(reason='auto'){
  if(syncing||!user||!navigator.onLine) return;
  syncing=true;setBadge('Clair Sync…','wait');
  try{
    const local=readLocal();
    if(!validState(local)){setBadge('Clair Sync : données en attente','off');return}
    const localHash=hash(local);
    const row=await getRemote();
    const remote=validState(row?.payload?.value)?row.payload.value:null;
    const remoteHash=hash(remote);
    const meta=getMeta();
    let chosen=local;

    if(!remote){
      chosen=local;
    }else if(localHash===remoteHash){
      chosen=local;
    }else if(!meta.lastSyncedHash){
      try{if(!localStorage.getItem(FIRST_BACKUP_KEY)) localStorage.setItem(FIRST_BACKUP_KEY,JSON.stringify(local))}catch{}
      chosen=mergeFirstPair(remote,local);
    }else{
      const localChanged=localHash!==meta.lastSyncedHash;
      const remoteChanged=remoteHash!==meta.lastSyncedHash;
      if(localChanged&&!remoteChanged) chosen=local;
      else if(!localChanged&&remoteChanged) chosen=remote;
      else if(!localChanged&&!remoteChanged) chosen=remote;
      else {
        const localWhen=Number(meta.localChangedAt)||0;
        const remoteWhen=Date.parse(row?.payload?.synced_at||row?.updated_at||'')||0;
        chosen=localWhen>=remoteWhen?local:remote;
      }
    }

    const chosenHash=hash(chosen);
    const localNeedsUpdate=chosenHash!==localHash;
    const remoteNeedsUpdate=!row||chosenHash!==remoteHash;
    if(localNeedsUpdate) writeLocal(chosen);
    if(remoteNeedsUpdate) await pushRemote(row,chosen);

    setMeta({lastSyncedHash:chosenHash,remoteRevision:(row?.revision||0)+(remoteNeedsUpdate?1:0),lastSyncAt:Date.now(),localChangedAt:0});
    lastObservedHash=hash(readLocal());setBadge('Clair Sync ✓');

    if(localNeedsUpdate&&sessionStorage.getItem(RELOAD_GUARD)!=='1'){
      sessionStorage.setItem(RELOAD_GUARD,'1');setTimeout(()=>location.reload(),180);return;
    }
    sessionStorage.removeItem(RELOAD_GUARD);
  }catch(err){console.warn('Clair Sync',err);setBadge(navigator.onLine?'Clair Sync en attente':'Clair Sync hors ligne','off')}
  finally{syncing=false}
}
function schedule(delay=650){clearTimeout(timer);timer=setTimeout(()=>syncNow('change'),delay)}
function startWatcher(){
  if(watcherStarted) return;watcherStarted=true;lastObservedHash=hash(readLocal());
  setInterval(()=>{
    const nowHash=hash(readLocal());
    if(nowHash!==lastObservedHash){lastObservedHash=nowHash;setMeta({localChangedAt:Date.now()});schedule()}
  },1200);
}
async function boot(){
  setBadge('Clair Sync…','wait');
  try{
    await loadSupabase();
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    const s=await client.auth.getSession();user=s.data?.session?.user||null;
    if(!user){setBadge('Clair Sync : connexion requise','off');showLoginPanel();return}
    await syncNow('open');startWatcher();
  }catch(err){console.warn('Clair Sync boot',err);setBadge('Clair Sync en attente','off')}
}
window.addEventListener('online',()=>schedule(200));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(250)});
setTimeout(boot,250);
})();
