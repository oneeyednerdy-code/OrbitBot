import { api, escapeHtml, state } from '../core.js';

export async function renderBugs(){
  const c=document.querySelector('#content');
  c.innerHTML='<div class="eyebrow">Developer</div><h1 class="page-title">Bug Inbox</h1><p class="page-intro">Privacy-safe coding and application errors reported from Orbit installations.</p><div class="skeleton"></div>';
  try{
    const data=await api('/api/operator/bugs?status=all');
    const rows=data.reports||[];
    c.innerHTML=`<div class="eyebrow">Developer</div><h1 class="page-title">Bug Inbox</h1><p class="page-intro">Privacy-safe coding and application errors reported from Orbit installations. Reports contain diagnostics, never Orbit secrets.</p>
      <div class="grid"><div class="card span-4"><div class="metric">${rows.filter(r=>r.status==='new').length}</div><div class="metric-label">New</div></div><div class="card span-4"><div class="metric">${rows.length}</div><div class="metric-label">Recent reports</div></div><div class="card span-4"><div class="metric">${data.duplicate_groups?.length||0}</div><div class="metric-label">Repeated signatures</div></div></div>
      <div class="card" style="margin-top:16px"><h2>Reports</h2>${rows.length?`<div class="bug-list">${rows.map(bugRow).join('')}</div>`:'<div class="empty"><h2>No bug reports</h2><p>Nothing has been submitted yet.</p></div>'}</div>`;
    c.querySelectorAll('[data-bug-status]').forEach(sel=>sel.onchange=()=>updateBug(sel.dataset.bugStatus,sel.value));
  }catch(e){c.innerHTML=`<div class="eyebrow">Developer</div><h1 class="page-title">Bug Inbox</h1><div class="notice error">${escapeHtml(e.message==='403'?'This page is limited to configured Orbit operator accounts.':e.message)}</div>`}
}
function bugRow(r){return `<article class="bug-row"><div><strong>${escapeHtml(r.bug_id)}</strong> <span class="status">${escapeHtml(r.severity)}</span><h3>${escapeHtml(r.summary)}</h3><div class="small">${escapeHtml(r.area)} · ${escapeHtml(r.orbit_version)} · ${new Date(r.created_at).toLocaleString()}</div>${r.description?`<p>${escapeHtml(r.description)}</p>`:''}</div><select data-bug-status="${escapeHtml(r.bug_id)}"><option ${r.status==='new'?'selected':''}>new</option><option ${r.status==='triaged'?'selected':''}>triaged</option><option ${r.status==='in_progress'?'selected':''}>in_progress</option><option ${r.status==='fixed'?'selected':''}>fixed</option><option ${r.status==='closed'?'selected':''}>closed</option><option ${r.status==='wont_fix'?'selected':''}>wont_fix</option></select></article>`}
async function updateBug(bug_id,status){await api('/api/operator/bugs',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({bug_id,status})});}
