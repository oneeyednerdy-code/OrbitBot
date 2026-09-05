import { $, api, escapeHtml, loadMemberNames, memberLabel, state } from '../core.js';
import { renderError } from './common.js';

export async function renderCounting(message = '') {
  const guildId = state.guildId;
  $('#content').innerHTML = '<div class="eyebrow">COMMUNITY</div><h1 class="page-title">Counting</h1><p class="page-intro">Run a configurable counting game in one Discord channel. Orbit checks every message through the Gateway and keeps the count in D1.</p><div id="countingBody" class="empty">Loading…</div>';
  try {
    const data = await api(`/api/guilds/${guildId}/counting`);
    const memberNames = await loadMemberNames((data.activity || []).map(x => x.user_id));
    if (state.guildId !== guildId || state.page !== 'counting' || !$('#countingBody')) return;
    const c = data.config || {};
    const channels = (state.bundle?.channels || []).filter(channel => [0, 5].includes(Number(channel.type)));
    const activity = Array.isArray(data.activity) ? data.activity : [];
    const channelOptions = `<option value="">Select channel…</option>${channels.map(channel => `<option value="${channel.id}" ${String(channel.id) === String(c.channel_id || '') ? 'selected' : ''}>#${escapeHtml(channel.name)}</option>`).join('')}`;
    const activityMarkup = activity.length ? activity.map(item => `<div class="notice"><strong>${escapeHtml(item.result)}</strong> · ${escapeHtml(item.received_number == null ? '—' : item.received_number)}<br><span class="small">Expected ${escapeHtml(item.expected_number)} · ${escapeHtml(memberLabel(memberNames, item.user_id))} [${escapeHtml(item.user_id)}] · ${new Date(item.created_at).toLocaleString()}</span></div>`).join('') : '<div class="empty">No counting activity yet.</div>';
    $('#countingBody').outerHTML = `<div class="grid">
      <section class="card span-7">
        <h2>Counting module</h2>
        ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}
        <label class="check"><input id="countEnabled" type="checkbox" ${Number(c.enabled) === 1 ? 'checked' : ''}>Enable counting</label>
        <div class="field"><label for="countChannel">Counting channel</label><select id="countChannel">${channelOptions}</select><div class="small">Only messages in this channel are interpreted as count attempts.</div></div>
        <div class="form-grid"><label>Starting number<input id="countStart" type="number" min="-1000000000000" max="1000000000000" value="${Number(c.start_number ?? 1)}"></label><label>Current number<input value="${Number(c.current_number ?? c.start_number ?? 1)}" disabled></label></div>
        <div class="grid compact-checks">
          <label class="check span-6"><input id="countAlternate" type="checkbox" ${Number(c.require_alternating ?? 1) === 1 ? 'checked' : ''}>Require alternating users</label>
          <label class="check span-6"><input id="countNumbersOnly" type="checkbox" ${Number(c.numbers_only ?? 1) === 1 ? 'checked' : ''}>Numbers only</label>
          <label class="check span-6"><input id="countReset" type="checkbox" ${Number(c.reset_on_mistake ?? 1) === 1 ? 'checked' : ''}>Reset on a wrong number</label>
          <label class="check span-6"><input id="countDelete" type="checkbox" ${Number(c.delete_invalid_messages ?? 0) === 1 ? 'checked' : ''}>Delete wrong messages</label>
        </div>
        <div class="form-grid"><label>Correct reaction<input id="countCorrectReaction" maxlength="20" value="${escapeHtml(c.correct_reaction ?? '✅')}"></label><label>Wrong reaction<input id="countWrongReaction" maxlength="20" value="${escapeHtml(c.wrong_reaction ?? '❌')}"></label></div>
        <div class="field"><label for="countWrongMessage">Wrong-number message</label><textarea id="countWrongMessage" rows="3" maxlength="2000">${escapeHtml(c.wrong_message ?? 'That was not the next number. The count resets to {count}. Expected {expected}, received {received}.')}</textarea><div class="small">Placeholders: <code>{user}</code>, <code>{expected}</code>, <code>{received}</code>, <code>{count}</code>.</div></div>
        <div class="field"><label for="countSameMessage">Same-user message</label><textarea id="countSameMessage" rows="2" maxlength="2000">${escapeHtml(c.same_user_message ?? 'Let someone else count next, {user}.')}</textarea></div>
        <div class="button-row"><button id="saveCounting" class="btn" type="button">Save Configuration</button><button id="resetCounting" class="btn secondary" type="button">Reset Count</button>${Number(c.enabled) === 1 ? '<button id="stopCounting" class="btn ghost" type="button">Turn Off</button>' : '<button id="startCounting" class="btn secondary" type="button">Start / Continue</button>'}</div>
        <div id="countingStatus" class="notice hidden" aria-live="polite"></div>
      </section>
      <section class="card span-5">
        <h2>Progress</h2>
        <div class="notice ${Number(c.enabled) === 1 ? 'success' : ''}"><strong>${Number(c.enabled) === 1 ? 'Counting is on' : 'Counting is off'}</strong><br><span class="small">${c.channel_id ? `Channel ${escapeHtml(c.channel_id)}` : 'Choose a channel to begin.'}</span></div>
        <div class="grid compact-checks"><div class="notice span-6"><strong>${Number(c.current_number ?? 1)}</strong><br><span class="small">Next number</span></div><div class="notice span-6"><strong>${Number(c.highest_number ?? c.start_number ?? 1)}</strong><br><span class="small">Highest reached</span></div><div class="notice span-6"><strong>${Number(c.correct_count ?? 0)}</strong><br><span class="small">Correct counts</span></div><div class="notice span-6"><strong>${Number(c.mistake_count ?? 0)}</strong><br><span class="small">Mistakes</span></div></div>
        <h2>Recent activity</h2>${activityMarkup}
      </section>
    </div>`;
    $('#saveCounting').onclick = () => runAction($('#saveCounting'), 'Saving…', async () => {
      await api(`/api/guilds/${guildId}/counting`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'save', enabled: $('#countEnabled').checked, channel_id: $('#countChannel').value, start_number: Number($('#countStart').value), require_alternating: $('#countAlternate').checked, numbers_only: $('#countNumbersOnly').checked, reset_on_mistake: $('#countReset').checked, delete_invalid_messages: $('#countDelete').checked, correct_reaction: $('#countCorrectReaction').value, wrong_reaction: $('#countWrongReaction').value, wrong_message: $('#countWrongMessage').value, same_user_message: $('#countSameMessage').value }) });
      if (state.guildId === guildId && state.page === 'counting') renderCounting('Counting configuration saved. The count was reset to the selected starting number.');
    });
    $('#resetCounting').onclick = () => runAction($('#resetCounting'), 'Resetting…', async () => { await action(guildId, 'reset'); renderCounting('Count reset.'); });
    $('#stopCounting')?.addEventListener('click', () => runAction($('#stopCounting'), 'Turning off…', async () => { await action(guildId, 'stop'); renderCounting('Counting turned off.'); }));
    $('#startCounting')?.addEventListener('click', () => runAction($('#startCounting'), 'Starting…', async () => { await action(guildId, 'continue'); renderCounting('Counting is active.'); }));
  } catch (error) {
    if (state.guildId === guildId && state.page === 'counting') renderError(formatCountingError(error));
  }
}

async function action(guildId, op) {
  await api(`/api/guilds/${guildId}/counting`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op }) });
}

async function runAction(button, pending, work) {
  if (!button) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = pending;
  try { await work(); }
  catch (error) { const status = $('#countingStatus'); if (status) { status.className = 'notice error'; status.textContent = formatCountingError(error); } }
  finally { if (button.isConnected) { button.disabled = false; button.textContent = label; } }
}

function formatCountingError(error) {
  const detail = error?.payload?.detail || `Request failed (${error?.message || 'unknown error'}).`;
  const requestId = error?.payload?.request_id;
  return requestId ? `${detail} Reference: ${requestId}` : detail;
}
