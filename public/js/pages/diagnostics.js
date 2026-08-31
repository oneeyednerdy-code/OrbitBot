import { $, api, escapeHtml, state, title, usableRoles } from '../core.js';
import { renderError } from './common.js';

export async function renderDiagnostics(){
  $('#content').innerHTML='<div class="eyebrow">SYSTEM HEALTH</div><h1 class="page-title">Diagnostics</h1><p class="page-intro">Checking Discord permissions, role hierarchy, Turnstile and core infrastructure.</p><div id="diagBody" class="empty">Running checks…</div>';
  try{const data=await api(`/api/guilds/${state.guildId}/diagnostics`);$('#diagBody').outerHTML=`<div class="grid"><section class="card span-4"><div class="metric">${data.score}%</div><div class="metric-label">Security/config health</div><button id="saveDiag" class="btn secondary" type="button">Run + Save Report</button></section><section class="card span-8"><h2>Checks</h2>${data.checks.map(c=>`<div class="notice ${c.ok?'success':'error'}"><strong>${c.ok?'✓':'!'} ${escapeHtml(c.label)}</strong><br><span class="small">${escapeHtml(c.detail)}</span></div>`).join('')}</section></div>`;$('#saveDiag')?.addEventListener('click',async()=>{await api(`/api/guilds/${state.guildId}/diagnostics`,{method:'POST'});renderDiagnostics();});}catch(error){renderError(`Diagnostics failed (${error.message}).`)}
}


export async function renderLogs(){
  $('#content').innerHTML='<div class="eyebrow">AUDIT</div><h1 class="page-title">Logs</h1><p class="page-intro">The latest Orbit actions for this server.</p><div id="logBody" class="empty">Loading…</div>';
  try{const data=await api(`/api/guilds/${state.guildId}/logs`);$('#logBody').outerHTML=`<section class="card"><h2>Recent events</h2>${data.events.length?data.events.map(e=>`<div class="notice"><strong>${escapeHtml(e.event_type)}</strong><br><span class="small">Actor: ${escapeHtml(e.actor_user_id||'system')} · ${new Date(e.created_at).toLocaleString()}</span></div>`).join(''):'<div class="empty">No audit events yet.</div>'}</section>`;}catch(error){renderError(`Logs failed (${error.message}).`)}
}
