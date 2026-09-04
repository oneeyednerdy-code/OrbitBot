import { $, api, escapeHtml, state } from '../core.js';
import { renderError } from './common.js';

export async function renderOperations() {
  $('#content').innerHTML = '<div class="eyebrow">OPERATIONS</div><h1 class="page-title">Community Operations Center</h1><p class="page-intro">One place for live community signals, reliability checks, repair clues, and long-running Orbit actions.</p><div id="ops" class="empty">Loading…</div>';
  try {
    const [metrics, reliability] = await Promise.all([
      api(`/api/guilds/${state.guildId}/operations`),
      api(`/api/guilds/${state.guildId}/reliability`),
    ]);
    if (!$('#ops')) return;
    const checks = reliability.checks || [];
    const failedChecks = checks.filter(check => !check.ok);
    const drift = reliability.resource_drift?.missing || [];
    const actionJobs = reliability.action_jobs || [];
    const configBackups = reliability.config_backups || [];
    const gateway = reliability.gateway || {};
    const rateLimits = reliability.rate_limits?.buckets || [];
    const channels = (state.bundle?.channels || []).filter(channel => [0, 5].includes(Number(channel.type)));
    $('#ops').outerHTML = `<div class="grid">
      <section class="card span-12"><div class="section-heading"><div><div class="eyebrow">CONTROL PLANE</div><h2>Orbit reliability: ${escapeHtml(reliability.status || 'unknown')}</h2><p class="small">Generated ${escapeHtml(formatTime(reliability.generated_at))}. A scan checks Discord access, queue/gateway bindings, schema readiness, and configured resource drift.</p></div><div class="button-row"><span class="status ${reliability.status === 'healthy' ? 'active' : 'roadmap'}">${Number(reliability.score || 0)} / 100</span><button id="runReliabilityScan" class="btn secondary" type="button">Run Reliability Scan</button></div></div>${failedChecks.length ? `<div class="notice error"><strong>${failedChecks.length} item(s) need attention</strong><br>${failedChecks.map(check => `${escapeHtml(check.label)}: ${escapeHtml(check.detail)}`).join('<br>')}</div>` : '<div class="notice success">No reliability blockers found in the latest scan.</div>'}</section>
      <section class="card span-4"><div class="metric">${metrics.creators_live}</div><div class="metric-label">Creators live</div></section>
      <section class="card span-4"><div class="metric">${metrics.open_tickets}</div><div class="metric-label">Open tickets</div></section>
      <section class="card span-4"><div class="metric">${metrics.queued_posts}</div><div class="metric-label">Queued posts</div></section>
      <section class="card span-4"><div class="metric">${metrics.upcoming_events}</div><div class="metric-label">Upcoming events</div></section>
      <section class="card span-4"><div class="metric">${metrics.pending_applications}</div><div class="metric-label">Applications waiting</div></section>
      <section class="card span-4"><div class="metric">${metrics.moderation_24h}</div><div class="metric-label">Moderation / 24h</div></section>
      <section class="card span-4"><h2>Gateway</h2><span class="status ${gateway.state === 'ready' ? 'active' : 'roadmap'}">${escapeHtml(gateway.state || 'unavailable')}</span><p class="small">${gateway.halt_reason ? `Halted: ${escapeHtml(gateway.halt_reason)}` : `Heartbeat misses: ${Number(gateway.heartbeat_misses || 0)} · IDENTIFY remaining: ${gateway.session_start_remaining ?? 'unknown'}`}</p></section>
      <section class="card span-4"><h2>Protection</h2><div class="button-row"><span class="status ${metrics.shield_active ? 'roadmap' : 'active'}">${metrics.shield_active ? '! Shield active' : '✓ Shield normal'}</span><span class="status ${metrics.lockdown_active ? 'roadmap' : 'active'}">${metrics.lockdown_active ? '! Lockdown active' : '✓ Lockdown normal'}</span></div></section>
      <section class="card span-4"><h2>Rate limits</h2><div class="metric">${rateLimits.length}</div><div class="metric-label">recently observed buckets</div><p class="small">Orbit waits on short Discord limits, retries safe requests once, and records exhausted buckets for diagnosis.</p></section>
      <section class="card span-7"><h2>Permission Doctor</h2><p class="small">Check a specific channel before staff posts, role changes, moderation, or event actions fail halfway through.</p><div class="field"><label for="doctorChannel">Channel context</label><select id="doctorChannel"><option value="">Server-wide permissions</option>${channels.map(channel => `<option value="${channel.id}">#${escapeHtml(channel.name)}</option>`).join('')}</select></div><div class="grid compact-checks">${[['view_channel','View Channels'],['send_messages','Send Messages'],['manage_roles','Manage Roles'],['manage_channels','Manage Channels'],['create_events','Create Events']].map(([value,label]) => `<label class="check span-6"><input class="doctorPermission" type="checkbox" value="${value}" checked>${label}</label>`).join('')}</div><button id="runPermissionDoctor" class="btn secondary" type="button">Check Permissions</button><div id="doctorResult" class="notice hidden" aria-live="polite"></div></section>
      <section class="card span-5"><h2>Configured resource drift</h2>${drift.length ? `<div class="notice error"><strong>${drift.length} saved Discord setting${drift.length === 1 ? '' : 's'} need attention</strong><br><span class="small">A channel or role was deleted or is no longer visible to Orbit. Open the related module, choose a replacement, then run the scan again.</span></div>${drift.slice(0, 20).map(item => `<div class="notice error"><strong>${escapeHtml(item.label)}</strong><br><span class="small">${escapeHtml(item.module)} · ${escapeHtml(item.resourceType)} ${escapeHtml(item.resourceId)}</span>${driftPage(item.module) ? `<br><button class="btn ghost driftOpen" type="button" data-page="${driftPage(item.module)}">Open ${escapeHtml(driftPageLabel(item.module))}</button>` : ''}</div>`).join('')}` : '<div class="notice success">No missing configured channels or roles.</div>'}</section>
      <section class="card span-12"><h2>Orbit configuration backup</h2><p class="small">Save guild-scoped Orbit settings, question banks, and workflows so a mistake or rebuild is recoverable. Sessions, OAuth state, credentials, activity history, delivery runs, and Discord content are never included.</p><div class="button-row"><button id="createConfigBackup" class="btn secondary" type="button">Create Configuration Backup</button><label class="btn ghost" for="uploadConfigBackup">Restore Uploaded Backup</label><input id="uploadConfigBackup" type="file" accept=".json,application/json" class="hidden"></div><div id="configBackupList">${configBackups.length ? configBackups.map(backup => `<div class="notice"><div class="section-heading"><strong>${escapeHtml(backup.name)}</strong><span class="small">${escapeHtml(formatTime(backup.created_at))} · ${Math.ceil(Number(backup.byte_size || 0) / 1024)} KB</span></div><div class="button-row"><button class="btn ghost configDownload" type="button" data-id="${Number(backup.id)}">Download</button><button class="btn danger configRestore" type="button" data-id="${Number(backup.id)}" data-name="${escapeHtml(backup.name)}">Restore This Backup</button></div></div>`).join('') : '<div class="empty">No saved Orbit configuration backups yet.</div>'}</div><div id="backupNotice" class="notice hidden" aria-live="polite"></div></section>
      <section class="card span-12"><h2>Action Center</h2><p class="small">Queued and completed multi-step actions remain visible with their final outcome and request reference.</p>${actionJobs.length ? actionJobs.map(job => { const progress = job.progress || {}; const total = Number(progress.total || 0); const done = Number(progress.completed || 0) + Number(progress.failed || 0); return `<div class="notice"><div class="section-heading"><strong>#${Number(job.id)} · ${escapeHtml(job.module)} / ${escapeHtml(job.action)}</strong><span class="status ${job.status === 'completed' ? 'active' : job.status === 'failed' || job.status === 'partial' ? 'roadmap' : 'pending'}">${escapeHtml(job.status)}</span></div><span class="small">${total ? `${done} / ${total} items` : 'Progress pending'} · Updated ${escapeHtml(formatTime(job.updated_at))}${job.error_code ? ` · ${escapeHtml(job.error_code)}` : ''}${job.last_request_id ? ` · Ref ${escapeHtml(job.last_request_id)}` : ''}</span></div>`; }).join('') : '<div class="empty">No tracked actions yet.</div>'}</section>
    </div>`;
    $('#runReliabilityScan').onclick = async () => {
      const button = $('#runReliabilityScan');
      button.disabled = true; button.textContent = 'Scanning…';
      try { await api(`/api/guilds/${state.guildId}/reliability`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'scan' }) }); await renderOperations(); }
      catch (error) { showNotice(error?.payload?.detail || `Scan failed (${error?.message || 'unknown error'}).`, 'error'); button.disabled = false; button.textContent = 'Run Reliability Scan'; }
    };
    $('#runPermissionDoctor').onclick = async () => {
      const button = $('#runPermissionDoctor');
      const result = $('#doctorResult');
      button.disabled = true; button.textContent = 'Checking…';
      try {
        const permissions = [...document.querySelectorAll('.doctorPermission:checked')].map(input => input.value);
        const response = await api(`/api/guilds/${state.guildId}/reliability`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'preflight', channel_id: $('#doctorChannel').value || null, required_permissions: permissions }) });
        const doctor = response.permission_doctor;
        result.className = `notice ${doctor.ok ? 'success' : 'error'}`;
        result.innerHTML = `<strong>${doctor.ok ? 'Preflight passed' : 'Action blocked'}</strong><br>${doctor.checks.map(check => `${check.ok ? '✓' : '!' } ${escapeHtml(check.label)} — ${escapeHtml(check.detail)}`).join('<br>')}<br><span class="small">${escapeHtml(doctor.next_step)}</span>`;
      } catch (error) { result.className = 'notice error'; result.textContent = error?.payload?.detail || `Permission check failed (${error?.message || 'unknown error'}).`; }
      finally { button.disabled = false; button.textContent = 'Check Permissions'; }
    };
    $('#createConfigBackup').onclick = async () => {
      const name = window.prompt('Backup name', `Orbit configuration ${new Date().toISOString().slice(0, 10)}`);
      if (name === null) return;
      try { await api(`/api/guilds/${state.guildId}/reliability`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'create_config_backup', name }) }); await renderOperations(); }
      catch (error) { showBackupNotice(error?.payload?.detail || `Backup failed (${error?.message || 'unknown error'}).`, 'error'); }
    };
    document.querySelectorAll('.configDownload').forEach(button => button.onclick = async () => {
      try {
        const response = await api(`/api/guilds/${state.guildId}/reliability?backup_id=${encodeURIComponent(button.dataset.id)}`);
        const blob = new Blob([JSON.stringify(response.backup?.payload || {}, null, 2)], { type: 'application/json' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `orbit-config-${button.dataset.id}.json`; link.click(); URL.revokeObjectURL(link.href);
      } catch (error) { showBackupNotice(error?.payload?.detail || `Download failed (${error?.message || 'unknown error'}).`, 'error'); }
    });
    document.querySelectorAll('.configRestore').forEach(button => button.onclick = async () => {
      const id = Number(button.dataset.id); const phrase = `RESTORE CONFIG ${id}`;
      if (!window.confirm(`Restore “${button.dataset.name}”? Current Orbit settings will be replaced. Discord messages and activity history are not changed.`)) return;
      if (window.prompt(`Type ${phrase} to continue`) !== phrase) return showBackupNotice('Restore cancelled because the confirmation phrase did not match.', 'error');
      try { await api(`/api/guilds/${state.guildId}/reliability`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'restore_config_backup', backup_id: id, confirmation: phrase, acknowledged: true }) }); await renderOperations(); }
      catch (error) { showBackupNotice(error?.payload?.detail || `Restore failed (${error?.message || 'unknown error'}).`, 'error'); }
    });
    $('#uploadConfigBackup').onchange = async event => {
      const file = event.target.files?.[0]; if (!file) return;
      try { const payload = JSON.parse(await file.text()); const phrase = 'RESTORE CONFIG'; if (!window.confirm('Restore this uploaded Orbit configuration? Current settings will be replaced.')) return; if (window.prompt(`Type ${phrase} to continue`) !== phrase) return showBackupNotice('Restore cancelled because the confirmation phrase did not match.', 'error'); await api(`/api/guilds/${state.guildId}/reliability`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'restore_config_file', backup_json: payload, confirmation: phrase, acknowledged: true }) }); await renderOperations(); }
      catch (error) { showBackupNotice(error?.payload?.detail || `Uploaded backup failed (${error?.message || 'unknown error'}).`, 'error'); }
    };
  } catch (error) { renderError(`Operations Center failed (${error?.message || 'unknown error'}).`); }
}

function formatTime(value) { const timestamp = Number(value); return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toLocaleString() : 'not recorded'; }
function showNotice(message, type) { const target = $('#doctorResult'); if (target) { target.className = `notice ${type}`; target.textContent = message; } }
function showBackupNotice(message, type) { const target = $('#backupNotice'); if (target) { target.className = `notice ${type}`; target.textContent = message; } }
function driftPage(module) { return ({ settings: 'verification', verification: 'verification', community: 'community', roles: 'roles', tickets: 'tickets', scheduler: 'scheduler', leveling: 'leveling', creator: 'creator', events: 'events', applications: 'applications', kofi: 'kofi', social: 'social', honeypot: 'moderation', security: 'security', shield: 'shield', creator_safety: 'safety' })[module] || ''; }
function driftPageLabel(module) { return ({ settings: 'Verification settings', verification: 'Verification', community: 'Community', roles: 'Roles', tickets: 'Tickets', scheduler: 'Scheduled Posts', leveling: 'Leveling', creator: 'Creator alerts', events: 'Events', applications: 'Applications', kofi: 'Ko-fi', social: 'Social', honeypot: 'Moderation', security: 'Security', shield: 'Shield', creator_safety: 'Creator Safety' })[module] || 'module'; }
