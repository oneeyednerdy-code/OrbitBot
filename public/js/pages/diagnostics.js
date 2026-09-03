import { $, api, escapeHtml, state, title, usableRoles } from '../core.js';
import { renderError } from './common.js';

export async function renderDiagnostics(){
  $('#content').innerHTML='<div class="eyebrow">SYSTEM HEALTH</div><h1 class="page-title">Diagnostics</h1><p class="page-intro">Checking Discord permissions, role hierarchy, Turnstile and core infrastructure.</p><div id="diagBody" class="empty">Running checks…</div>';
  try{const data=await api(`/api/guilds/${state.guildId}/diagnostics`);$('#diagBody').outerHTML=`<div class="grid"><section class="card span-4"><div class="metric">${data.score}%</div><div class="metric-label">Security/config health</div><button id="saveDiag" class="btn secondary" type="button">Run + Save Report</button></section><section class="card span-8"><h2>Checks</h2>${data.checks.map(c=>`<div class="notice ${c.ok?'success':'error'}"><strong>${c.ok?'✓':'!'} ${escapeHtml(c.label)}</strong><br><span class="small">${escapeHtml(c.detail)}</span></div>`).join('')}</section></div>`;$('#saveDiag')?.addEventListener('click',async()=>{await api(`/api/guilds/${state.guildId}/diagnostics`,{method:'POST'});renderDiagnostics();});}catch(error){renderError(`Diagnostics failed (${error.message}).`)}
}


export async function renderLogs(){
  $('#content').innerHTML='<div class="eyebrow">AUDIT + ERRORS</div><h1 class="page-title">Logs</h1><p class="page-intro">Audit activity plus verbose sanitized server failures for this Discord server.</p><div id="logBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${state.guildId}/logs`);
    const warnings=(data.warnings||[]).map(w=>`<div class="notice error"><strong>Setup required</strong><br><span class="small">${escapeHtml(w.detail)}</span></div>`).join('');
    $('#logBody').outerHTML=`${warnings}<div class="grid"><section class="card span-7"><h2>Recent actions</h2>${data.events.length?data.events.map(e=>`<div class="notice"><strong>${escapeHtml(e.event_type)}</strong><br><span class="small">Actor: ${escapeHtml(e.actor_user_id||'system')} · ${new Date(e.created_at).toLocaleString()}</span></div>`).join(''):'<div class="empty">No audit events yet.</div>'}</section><section class="card span-5"><div class="section-heading"><div><h2>Verbose error log</h2><div class="small">Sanitized server/API failures with request references.</div></div><button id="downloadVerboseErrors" class="btn ghost" type="button">Download</button></div>${data.errors.length?data.errors.map(e=>`<div class="notice error verbose-error"><strong>${escapeHtml(e.error_code)}</strong><br><span class="small">${escapeHtml(e.method)} ${escapeHtml(e.route)} · HTTP ${escapeHtml(e.status)}<br>${new Date(e.created_at).toLocaleString()} · ${escapeHtml(e.request_id)}</span><code>${escapeHtml(JSON.stringify(e.detail||{}))}</code></div>`).join(''):'<div class="empty">No server errors recorded.</div>'}</section></div>`;
    $('#downloadVerboseErrors')?.addEventListener('click',()=>downloadErrors(data.errors));
  }catch(error){renderError(`Logs failed (${error.payload?.detail||error.message}).`)}
}
function downloadErrors(errors){const report={version:'0.1.0-alpha.45',generated_at:new Date().toISOString(),guild:'redacted',errors};const blob=new Blob([JSON.stringify(report,null,2)],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`orbit-server-errors-${Date.now()}.txt`;a.click();URL.revokeObjectURL(a.href);}
