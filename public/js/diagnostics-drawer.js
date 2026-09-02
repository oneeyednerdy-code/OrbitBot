import { api, escapeHtml, state, clientDiagnostics } from './core.js';

let last=null;
export function initDiagnosticsDrawer(){
  const toggle=document.querySelector('#diagToggle');
  toggle?.addEventListener('click',()=>document.querySelector('#diagDrawer').classList.toggle('open'));
  document.querySelector('#diagRun')?.addEventListener('click',()=>refreshDiagnostics(true));
  document.querySelector('#diagCopy')?.addEventListener('click',copyReport);
  document.querySelector('#diagDownload')?.addEventListener('click',downloadReport);
  document.querySelector('#diagBug')?.addEventListener('click',openBugDialog);
  document.querySelector('#bugCancel')?.addEventListener('click',()=>document.querySelector('#bugDialog').close());
  document.querySelector('#bugForm')?.addEventListener('submit',submitBug);
}
export async function refreshDiagnostics(persist=false){
  if(!state.guildId)return;
  const label=document.querySelector('#diagSummary');if(label)label.textContent='Checking Orbit…';
  try{last=await api(`/api/guilds/${state.guildId}/diagnostics`,{method:persist?'POST':'GET'});render(last);}
  catch(e){if(label)label.textContent=`Diagnostics unavailable · ${e.message}`;}
}
function render(data){
  const label=document.querySelector('#diagSummary');const dot=document.querySelector('#diagDot');const list=document.querySelector('#diagChecks');const recent=document.querySelector('#diagRecentErrors');
  if(label)label.textContent=data.status==='healthy'?`Everything looks good · ${data.score}%`:`${data.score}% health · ${data.status}`;
  if(dot)dot.className=`diag-dot ${data.status}`;
  if(list)list.innerHTML=data.checks.map(x=>`<div class="diag-check"><span class="diag-result ${x.ok?'ok':'warn'}">${x.ok?'✓':'!'}</span><div><strong>${escapeHtml(x.label)}</strong><div class="small">${escapeHtml(x.detail)}</div></div></div>`).join('');
  if(recent)recent.innerHTML=(data.recent_errors||[]).length?`<div class="section-heading"><div><h3>Recent server failures</h3><div class="small">Sanitized and retained for troubleshooting.</div></div></div>${data.recent_errors.map(x=>`<div class="diag-error-row"><strong>${escapeHtml(x.error_code)}</strong><span class="small">${escapeHtml(x.method)} ${escapeHtml(x.route)} · HTTP ${escapeHtml(x.status)} · ${new Date(x.created_at).toLocaleString()} · ${escapeHtml(x.request_id)}</span><code>${escapeHtml(JSON.stringify(x.detail||{}))}</code></div>`).join('')}`:'<div class="small">No recent server failures recorded.</div>';
}
function safeReport(){return {version:'0.1.0-alpha.41',generated_at:new Date().toISOString(),guild:'redacted',page:state.page,diagnostics:last,client:{user_agent:navigator.userAgent,online:navigator.onLine,errors:clientDiagnostics.errors.slice(-50),network_failures:clientDiagnostics.networkFailures.slice(-50),request_log:clientDiagnostics.requests.slice(-100)},privacy:'Verbose logs are sanitized. Tokens, secrets, cookies, authorization headers, credentials and message contents are excluded.'}}
async function copyReport(){const text=JSON.stringify(safeReport(),null,2);await navigator.clipboard.writeText(text);flash('Verbose diagnostic report copied.');}
function downloadReport(){const blob=new Blob([JSON.stringify(safeReport(),null,2)],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`orbit-verbose-diagnostics-${Date.now()}.txt`;a.click();URL.revokeObjectURL(a.href);}
function openBugDialog(){const d=document.querySelector('#bugDialog');document.querySelector('#bugArea').value=state.page;document.querySelector('#bugResult').innerHTML='';d.showModal();}
async function submitBug(event){
  event.preventDefault();const btn=document.querySelector('#bugSubmit');btn.disabled=true;btn.textContent='Sending…';
  const form=new FormData(event.target);
  const client={user_agent:navigator.userAgent,online:navigator.onLine,errors:form.get('include_errors')?clientDiagnostics.errors.slice(-25):[],network_failures:form.get('include_network')?clientDiagnostics.networkFailures.slice(-25):[],request_log:form.get('include_network')?clientDiagnostics.requests.slice(-50):[]};
  try{
    const data=await api(`/api/guilds/${state.guildId}/bug-reports`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({area:form.get('area'),summary:form.get('summary'),description:form.get('description'),severity:form.get('severity'),current_page:state.page,include_diagnostics:Boolean(form.get('include_diagnostics')),client,error_signature:client.errors?.[0]?.message||client.network_failures?.[0]?.error||''})});
    document.querySelector('#bugResult').innerHTML=`<div class="notice success"><strong>Bug report sent.</strong><br>Reference: ${escapeHtml(data.bug_id)}</div>`;event.target.reset();
  }catch(e){document.querySelector('#bugResult').innerHTML=`<div class="notice error">Could not send report: ${escapeHtml(e.message)}</div>`}
  finally{btn.disabled=false;btn.textContent='Send Bug Report';}
}
function flash(text){const el=document.querySelector('#diagFlash');if(!el)return;el.textContent=text;setTimeout(()=>el.textContent='',2200)}
