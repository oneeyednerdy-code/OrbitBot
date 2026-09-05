export const state={me:null,guilds:[],guildId:null,bundle:null,page:'overview',csrf:'',renderVersion:0};
export const clientDiagnostics={errors:[],networkFailures:[],requests:[]};
export const $=selector=>document.querySelector(selector);
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
let pageController=null;

export function beginPageRender(){
  pageController?.abort();
  pageController=new AbortController();
  state.renderVersion+=1;
}

export function cancelPageRender(){
  pageController?.abort();
  pageController=null;
  state.renderVersion+=1;
}
const clean=value=>String(value??'')
  .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
  .replace(/(token|secret|password|cookie|authorization|credential|client_secret|code_verifier)=\S+/gi,'$1=[REDACTED]')
  .replace(/("(?:access_token|refresh_token|token|secret|password|cookie|authorization|credential|client_secret|code_verifier)"\s*:\s*")[^"]+"/gi,'$1[REDACTED]"')
  .slice(0,3000);
const cleanPayload=value=>{try{return clean(JSON.stringify(value??{}))}catch{return '[unserializable]'}};
window.addEventListener('error',event=>{clientDiagnostics.errors.push({message:clean(event.message),source:clean(event.filename?.split('/').pop()),line:event.lineno,column:event.colno,stack:clean(event.error?.stack||''),time:Date.now()});clientDiagnostics.errors=clientDiagnostics.errors.slice(-50)});
window.addEventListener('unhandledrejection',event=>{clientDiagnostics.errors.push({message:clean(event.reason?.message||event.reason||'Unhandled promise rejection'),stack:clean(event.reason?.stack||''),time:Date.now()});clientDiagnostics.errors=clientDiagnostics.errors.slice(-50)});

export async function api(url,options={}){
  const init={...options,headers:new Headers(options.headers||{})};
  if((init.method||'GET')!=='GET'&&state.csrf)init.headers.set('x-orby-csrf',state.csrf);
  const endpoint=new URL(url,location.origin).pathname;
  const method=init.method||'GET';
  const pageScoped=method==='GET'&&endpoint.startsWith('/api/guilds/')&&!endpoint.endsWith('/bootstrap');
  const requestPage=pageScoped?state.page:null;
  const requestGuild=pageScoped?state.guildId:null;
  const requestRenderVersion=pageScoped?state.renderVersion:null;
  if(pageScoped&&!init.signal&&pageController)init.signal=pageController.signal;
  const started=performance.now();
  let response;
  try{response=await fetch(url,init)}catch(error){
    if(error?.name==='AbortError'){const stale=new Error('stale_navigation');stale.name='AbortError';throw stale;}
    const item={endpoint,method,error:clean(error.message),duration_ms:Math.round(performance.now()-started),time:Date.now()};
    clientDiagnostics.networkFailures.push(item);clientDiagnostics.networkFailures=clientDiagnostics.networkFailures.slice(-50);
    clientDiagnostics.requests.push({...item,status:0,ok:false});clientDiagnostics.requests=clientDiagnostics.requests.slice(-100);
    throw error;
  }
  let body={};let raw='';
  try{raw=await response.text();body=raw?JSON.parse(raw):{}}catch{body=raw?{raw:clean(raw)}:{}};
  if(pageScoped&&(requestPage!==state.page||requestGuild!==state.guildId||requestRenderVersion!==state.renderVersion)){const stale=new Error('stale_navigation');stale.name='AbortError';throw stale;}
  const requestId=response.headers.get('x-orbit-request-id')||body?.request_id||null;
  const record={endpoint,method,status:response.status,ok:response.ok,duration_ms:Math.round(performance.now()-started),request_id:requestId,response:response.ok?undefined:cleanPayload(body),time:Date.now()};
  clientDiagnostics.requests.push(record);clientDiagnostics.requests=clientDiagnostics.requests.slice(-100);
  if(!response.ok){
    clientDiagnostics.networkFailures.push({endpoint,method,status:response.status,error:clean(body.error||response.status),detail:clean(body.detail||''),request_id:requestId,response:cleanPayload(body),duration_ms:record.duration_ms,time:Date.now()});
    clientDiagnostics.networkFailures=clientDiagnostics.networkFailures.slice(-50);
    const error=new Error(body.error||String(response.status));error.payload=body;throw error;
  }
  return body;
}

export function sortGuilds(guilds=[],mode='name',activeId=''){return [...guilds].sort((a,b)=>{if(mode==='size'){const countA=Number.isFinite(Number(a.channel_count))?Number(a.channel_count):-1,countB=Number.isFinite(Number(b.channel_count))?Number(b.channel_count):-1;if(countA!==countB)return countB-countA;}else{const activeA=String(a.id)===String(activeId)?0:1,activeB=String(b.id)===String(activeId)?0:1;if(activeA!==activeB)return activeA-activeB;}return collator.compare(String(a.name||''),String(b.name||''))||collator.compare(String(a.id||''),String(b.id||''));});}
export function sortChannels(channels=[]){return [...channels].sort((a,b)=>{const parentPositionA=Number.isFinite(Number(a.parent_position))?Number(a.parent_position):(a.parent_id?Number.MAX_SAFE_INTEGER:-1),parentPositionB=Number.isFinite(Number(b.parent_position))?Number(b.parent_position):(b.parent_id?Number.MAX_SAFE_INTEGER:-1);return parentPositionA-parentPositionB||collator.compare(String(a.parent_name||''),String(b.parent_name||''))||Number(a.position??Number.MAX_SAFE_INTEGER)-Number(b.position??Number.MAX_SAFE_INTEGER)||collator.compare(String(a.name||''),String(b.name||''))||collator.compare(String(a.id||''),String(b.id||''));});}
export function sortRoles(roles=[]){return [...roles].sort((a,b)=>{const managedA=a.managed?1:0,managedB=b.managed?1:0;return managedA-managedB||Number(b.position??-1)-Number(a.position??-1)||collator.compare(String(a.name||''),String(b.name||''))||collator.compare(String(a.id||''),String(b.id||''));});}
export function normalizeBundle(bundle){if(!bundle)return bundle;return {...bundle,channels:sortChannels(bundle.channels||[]),roles:sortRoles(bundle.roles||[])};}
export function usableRoles(){return sortRoles((state.bundle?.roles||[]).filter(role=>role.name!=='@everyone'&&!role.managed));}
export async function loadMemberNames(ids){const unique=[...new Set((ids||[]).map(String).filter(id=>/^\d+$/.test(id)))].slice(0,100);if(!unique.length)return{};try{return (await api(`/api/guilds/${state.guildId}/member-lookup?ids=${encodeURIComponent(unique.join(','))}`)).members||{}}catch{return{}}}
export function memberLabel(members,id){const key=String(id||'');return members?.[key]?.display_name||key;}
export function title(value){return value.charAt(0).toUpperCase()+value.slice(1)}
