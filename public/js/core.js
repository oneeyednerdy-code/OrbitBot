export const state={me:null,guilds:[],guildId:null,bundle:null,page:'overview',csrf:''};
export const clientDiagnostics={errors:[],networkFailures:[]};
export const $=selector=>document.querySelector(selector);
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const clean=value=>String(value??'').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/(token|secret|password|cookie)=\S+/gi,'$1=[REDACTED]').slice(0,1200);
window.addEventListener('error',event=>{clientDiagnostics.errors.push({message:clean(event.message),source:clean(event.filename?.split('/').pop()),line:event.lineno,column:event.colno,time:Date.now()});clientDiagnostics.errors=clientDiagnostics.errors.slice(-25)});
window.addEventListener('unhandledrejection',event=>{clientDiagnostics.errors.push({message:clean(event.reason?.message||event.reason||'Unhandled promise rejection'),time:Date.now()});clientDiagnostics.errors=clientDiagnostics.errors.slice(-25)});

export async function api(url,options={}){
  const init={...options,headers:new Headers(options.headers||{})};
  if((init.method||'GET')!=='GET'&&state.csrf)init.headers.set('x-orby-csrf',state.csrf);
  let response;
  try{response=await fetch(url,init)}catch(error){clientDiagnostics.networkFailures.push({endpoint:new URL(url,location.origin).pathname,method:init.method||'GET',error:clean(error.message),time:Date.now()});clientDiagnostics.networkFailures=clientDiagnostics.networkFailures.slice(-25);throw error}
  let body={};try{body=await response.json()}catch{}
  if(!response.ok){clientDiagnostics.networkFailures.push({endpoint:new URL(url,location.origin).pathname,method:init.method||'GET',status:response.status,error:clean(body.error||response.status),time:Date.now()});clientDiagnostics.networkFailures=clientDiagnostics.networkFailures.slice(-25);const error=new Error(body.error||String(response.status));error.payload=body;throw error}
  return body;
}

export function usableRoles(){return (state.bundle?.roles||[]).filter(role=>role.name!=='@everyone'&&!role.managed).sort((a,b)=>b.position-a.position);}
export function title(value){return value.charAt(0).toUpperCase()+value.slice(1)}
