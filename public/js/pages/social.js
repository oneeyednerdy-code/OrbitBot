import { $, api, escapeHtml, state, usableRoles } from '../core.js';
import { renderError } from './common.js';

const textTargets = ['bluesky', 'threads', 'mastodon'];
const platformLabels = { discord: 'Discord', bluesky: 'Bluesky', threads: 'Threads', mastodon: 'Mastodon' };
let selectedImageFiles = [];
let uploadedImages = [];
let uploadedImageSignature = '';
let existingMediaIds = [];
let editingPostId = null;

export async function renderSocial() {
  const guildId = state.guildId;
  selectedImageFiles = []; uploadedImages = []; uploadedImageSignature = ''; existingMediaIds = [];
  $('#content').innerHTML = '<div class="eyebrow">PUBLISHING</div><h1 class="page-title">Social Management</h1><p class="page-intro">Plan once, customize each platform, save ideas, and publish to Discord, Threads, Bluesky, or Mastodon.</p><div id="socialBody" class="empty">Loading…</div>';
  try {
    const data = await api(`/api/guilds/${guildId}/social`);
    if (state.guildId !== guildId || state.page !== 'social' || !$('#socialBody')) return;
    const integrations = data.integrations || [];
    const connected = new Set(integrations.filter(item => Number(item.enabled) === 1).map(item => item.platform));
    const limits = data.limits || { discord: 2000, bluesky: 300, threads: 500, mastodon: 500 };
    const roles = usableRoles();
    const posts = data.posts || [];
    const templates = data.templates || [];
    const editing = posts.find(post => String(post.id) === String(editingPostId)) || null;
    if (editing) existingMediaIds = JSONSafe(editing.media_ids_json).map(Number).filter(Number.isInteger);
    const editingVariants = editing ? JSONSafeObject(editing.content_variants_json) : {};
    const editingTargets = editing ? JSONSafe(editing.targets_json) : ['discord'];
    const discordIntegration = integrations.find(item => item.platform === 'discord' && Number(item.enabled) === 1);
    const maxImages = Number(data.max_images || 4), maxBytes = Number(data.max_image_bytes || 10_000_000);
    const targetInputs = ['discord', ...textTargets].map(platform => {
      const ready = platform === 'discord' || connected.has(platform), limit = Number(limits[platform] || 0);
      const checked = editing ? editingTargets.includes(platform) : platform === 'discord';
      return `<label class="check span-6"><input class="soTarget" type="checkbox" value="${platform}" ${checked ? 'checked ' : ''}${ready ? '' : 'disabled'}>${platformLabels[platform]}${ready ? ` · ${limit.toLocaleString()} max` : ' · connect first'}</label>`;
    }).join('');
    const roleOptions = `<option value="">No role ping</option>${roles.map(role => `<option value="${role.id}" ${String(editing?.ping_role_id || '') === String(role.id) ? 'selected' : ''}>@${escapeHtml(role.name)}${role.mentionable ? '' : ' · currently not Mentionable'}</option>`).join('')}`;
    const templateOptions = `<option value="">Start from a template…</option>${templates.map(template => `<option value="${template.id}">${escapeHtml(template.name)}${template.campaign ? ` · ${escapeHtml(template.campaign)}` : ''}</option>`).join('')}`;
    const customVariants = Object.keys(editingVariants).length > 0;
    const variantFields = textTargets.map(platform => `<label class="field social-variant-field" data-variant-platform="${platform}"><span>${platformLabels[platform]} version</span><textarea id="soVariant-${platform}" rows="4" ${customVariants ? '' : 'disabled'}>${escapeHtml(editingVariants[platform] ?? editing?.content ?? '')}</textarea><span class="small soVariantCount" data-count-platform="${platform}"></span></label>`).join('');
    const postsMarkup = posts.slice(0, 100).map(postCard).join('');
    $('#socialBody').outerHTML = `<div class="social-toolbar card"><div><strong>Social Composer v2</strong><div class="small">Templates, platform-specific copy, drafts, campaigns, and delivery status.</div></div><div class="button-row"><button id="soShowCalendar" class="btn secondary" type="button">Calendar view</button><button id="soShowHistory" class="btn ghost" type="button">History</button></div></div><div class="grid"><section class="card span-7"><div class="section-heading"><div><h2>${editing ? 'Edit social post' : 'Compose social post'}</h2><div class="small">Images can be reused for this post, with accessibility text for supported platforms.</div></div><a class="btn secondary" href="#connections" data-page="connections">Manage API Logins</a></div><div class="connection-summary">${['discord', ...textTargets].map(platform => `<span class="status ${platform === 'discord' || connected.has(platform) ? 'active' : 'foundation'}">${platform === 'discord' || connected.has(platform) ? '●' : '○'} ${platformLabels[platform]}</span>`).join('')}</div><div class="field"><label for="soTemplate">Template</label><select id="soTemplate">${templateOptions}</select><div class="small">Apply a saved format, then customize it before publishing.</div></div><div class="field"><label for="soContent">Base message <span class="small">Optional when posting an image</span></label><textarea id="soContent" rows="6" placeholder="Write your post…">${escapeHtml(editing?.content || '')}</textarea><div id="soCounts" class="small"></div></div><label class="check"><input id="soCustomize" type="checkbox" ${customVariants ? 'checked' : ''}> Customize message for each platform</label><div id="soVariants" class="social-variants ${customVariants ? '' : 'hidden'}">${variantFields}</div><div class="form-grid"><label>Campaign or tag<input id="soCampaign" maxlength="100" placeholder="SWTOR Wednesday" value="${escapeHtml(editing?.campaign || '')}"></label><label>Save as template<input id="soTemplateName" maxlength="120" placeholder="Optional template name"></label></div><div class="button-row"><button id="soSaveTemplate" class="btn ghost" type="button">Save current as template</button>${editing ? '<button id="soCancelEdit" class="btn ghost" type="button">Cancel edit</button>' : ''}</div><div class="field"><label for="soFiles">Images <span class="small">Optional · up to ${maxImages}</span></label><input id="soFiles" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple ${data.image_upload_enabled ? '' : 'disabled'}><div id="soMediaInfo" class="small">${data.image_upload_enabled ? `JPEG, PNG, GIF, or WebP · up to ${formatBytes(maxBytes)} each.` : 'Image uploads require the Orbit R2 storage binding.'}</div><div id="soMediaPreview" class="social-media-preview"></div></div><div class="field"><label for="soDiscordRole">Discord role ping <span class="small">Optional</span></label><select id="soDiscordRole">${roleOptions}</select><button id="soMakeMentionable" class="btn ghost" type="button">Make selected role Mentionable</button><div class="small">The ping is only sent to Discord, not to social platforms.</div></div><div class="field"><label>Destinations</label><div class="grid compact-checks">${targetInputs}</div></div><div class="field"><label for="soWhen">Schedule time <span class="small">Optional for drafts</span></label><input id="soWhen" type="datetime-local" value="${dateTimeLocal(editing?.scheduled_for)}"><div class="small">Use Draft for ideas, Post Now for immediate delivery, or choose a future time.</div></div><div class="button-row"><button id="saveSocialDraft" class="btn ghost" type="button">Save Draft</button><button id="postSocialNow" class="btn" type="button">Post Now</button><button id="scheduleSocial" class="btn secondary" type="button">Schedule Post</button></div><div id="socialStatus" class="notice hidden" aria-live="polite"></div></section><section class="card span-5"><h2>Templates</h2><div class="small">Build reusable formats for live notices, podcasts, raids, Ko-fi milestones, and community updates.</div><div class="social-template-list">${templates.map(template => `<div class="notice"><strong>${escapeHtml(template.name)}</strong>${template.campaign ? `<br><span class="small">${escapeHtml(template.campaign)}</span>` : ''}</div>`).join('') || '<div class="empty">No saved templates yet.</div>'}</div><hr><h2>Upcoming queue</h2><div id="socialQueueList">${postsMarkup || '<div class="empty">No social posts yet.</div>'}</div></section><section id="socialCalendarCard" class="card span-12"><div class="section-heading"><div><h2>Publishing calendar</h2><div class="small">Next 14 days of scheduled social posts.</div></div><div class="small">${posts.filter(post => post.status === 'draft').length} draft${posts.filter(post => post.status === 'draft').length === 1 ? '' : 's'}</div></div><div class="social-calendar">${calendarMarkup(posts)}</div></section></div>`;
    bindSocialEvents(data, limits, roles, maxImages, maxBytes, templates, editing);
    updateVariantVisibility();
    updateCounts(limits, roles);
    if (editing) renderSelectedMediaInfo();
  } catch (error) { renderError(`Social management failed (${error.message}).`); }
}

function bindSocialEvents(data, limits, roles, maxImages, maxBytes, templates, editing) {
  $('#soContent').addEventListener('input', () => updateCounts(limits, roles));
  $('#soDiscordRole').addEventListener('change', () => updateCounts(limits, roles));
  $('#soCustomize').addEventListener('change', () => { updateVariantVisibility(); updateCounts(limits, roles); });
  $('#soFiles').addEventListener('change', () => handleFiles(maxImages, maxBytes));
  document.querySelectorAll('.soTarget').forEach(input => input.addEventListener('change', () => { updateVariantVisibility(); updateCounts(limits, roles); }));
  document.querySelectorAll('.soVariant-field textarea, .social-variant-field textarea').forEach(input => input.addEventListener('input', () => updateCounts(limits, roles)));
  $('#soMakeMentionable').onclick = () => makeRoleMentionable(roles, limits);
  $('#soTemplate').onchange = () => applyTemplate($('#soTemplate').value, templates, limits, roles);
  $('#soSaveTemplate').onclick = () => saveTemplate(data, limits, roles);
  if ($('#soCancelEdit')) $('#soCancelEdit').onclick = () => { editingPostId = null; renderSocial(); };
  $('#saveSocialDraft').onclick = () => queueSocial('draft', limits, roles, maxImages, maxBytes, editing);
  $('#postSocialNow').onclick = () => queueSocial('now', limits, roles, maxImages, maxBytes, editing);
  $('#scheduleSocial').onclick = () => queueSocial('scheduled', limits, roles, maxImages, maxBytes, editing);
  $('#soShowCalendar').onclick = () => $('#socialCalendarCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#soShowHistory').onclick = () => $('#socialQueueList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.querySelectorAll('.socialEdit').forEach(button => button.onclick = () => { editingPostId = button.dataset.id; renderSocial(); });
  document.querySelectorAll('.socialDelete').forEach(button => button.onclick = () => deleteSocialPost(button.dataset.id));
  document.querySelectorAll('.socialRetry').forEach(button => button.onclick = () => retrySocialPost(button.dataset.id));
}

function updateVariantVisibility() {
  const custom = Boolean($('#soCustomize')?.checked);
  const panel = $('#soVariants');
  if (panel) panel.classList.toggle('hidden', !custom);
  document.querySelectorAll('.social-variant-field').forEach(field => {
    const platform = field.dataset.variantPlatform;
    const target = document.querySelector(`.soTarget[value="${platform}"]`);
    field.hidden = !target?.checked;
    const textarea = field.querySelector('textarea');
    if (textarea) textarea.disabled = !custom || !target?.checked;
  });
}

function updateCounts(limits, roles) {
  const base = $('#soContent')?.value || '';
  const custom = Boolean($('#soCustomize')?.checked);
  const selected = [...document.querySelectorAll('.soTarget:checked')].map(input => input.value);
  const role = roles.find(item => String(item.id) === String($('#soDiscordRole')?.value || ''));
  const lines = selected.map(platform => {
    const variant = custom ? $(`#soVariant-${platform}`)?.value : null;
    const content = variant === null || variant === undefined ? base : variant;
    const prefix = platform === 'discord' && role ? `<@&${role.id}> ` : '';
    const count = Array.from(prefix + content).length, limit = Number(limits[platform] || 0);
    const countEl = document.querySelector(`[data-count-platform="${platform}"]`);
    if (countEl) countEl.textContent = `${count.toLocaleString()} / ${limit.toLocaleString()}`;
    return `${platformLabels[platform]}: ${count}/${limit}${limit && count > limit ? ' · too long' : ''}`;
  });
  const el = $('#soCounts');
  if (el) { el.textContent = lines.join(' · ') || 'Select a destination'; el.className = `small${lines.some(line => line.includes('too long')) ? ' error-text' : ''}`; }
}

function handleFiles(maxImages, maxBytes) {
  const files = [...($('#soFiles')?.files || [])];
  selectedImageFiles = files.slice(0, maxImages);
  uploadedImages = []; uploadedImageSignature = '';
  const info = $('#soMediaInfo');
  if (files.length > maxImages) { if (info) info.textContent = `Choose no more than ${maxImages} images.`; selectedImageFiles = []; }
  else if (files.some(file => file.size > maxBytes)) { if (info) info.textContent = `Each image must be ${formatBytes(maxBytes)} or smaller.`; selectedImageFiles = []; }
  else if (info) info.textContent = files.length ? `${files.length} image${files.length === 1 ? '' : 's'} ready. Add alt text below before publishing.` : `JPEG, PNG, GIF, or WebP · up to ${formatBytes(maxBytes)} each.`;
  renderSelectedMediaInfo();
}

function renderSelectedMediaInfo() {
  const preview = $('#soMediaPreview');
  if (!preview) return;
  preview.innerHTML = selectedImageFiles.map((file, index) => `<span class="social-media-thumb"><img src="${URL.createObjectURL(file)}" alt=""><span>${escapeHtml(file.name)}</span><label class="social-alt-label">Alt text <input class="social-alt-input" data-alt-index="${index}" maxlength="1000" placeholder="Describe this image"></label></span>`).join('');
}

async function saveTemplate(data, limits, roles) {
  const name = $('#soTemplateName')?.value.trim();
  if (!name) return showStatus('Give the template a name first.', true);
  try {
    await api(`/api/guilds/${state.guildId}/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'save_template', name, content: $('#soContent').value, variants: collectVariants(), targets: selectedTargets(), campaign: $('#soCampaign').value }) });
    showStatus('Template saved.', false); setTimeout(() => renderSocial(), 350);
  } catch (error) { showStatus(error.payload?.detail || `Could not save template (${error.message}).`, true); }
}

function applyTemplate(id, templates, limits, roles) {
  const template = templates.find(item => String(item.id) === String(id));
  if (!template) return;
  const variants = JSONSafeObject(template.content_variants_json);
  $('#soContent').value = template.content || '';
  $('#soCampaign').value = template.campaign || '';
  $('#soCustomize').checked = Object.keys(variants).length > 0;
  for (const platform of textTargets) { const field = $(`#soVariant-${platform}`); if (field) field.value = variants[platform] ?? template.content ?? ''; }
  const targets = JSONSafe(template.targets_json);
  document.querySelectorAll('.soTarget').forEach(input => { if (!input.disabled) input.checked = targets.includes(input.value); });
  updateVariantVisibility(); updateCounts(limits, roles);
}

async function queueSocial(mode, limits, roles, maxImages, maxBytes, editing) {
  const targets = selectedTargets(), content = $('#soContent').value, raw = $('#soWhen').value, roleId = $('#soDiscordRole').value || null, role = roles.find(item => String(item.id) === String(roleId)), files = selectedImageFiles;
  if (!targets.length) return showStatus('Choose at least one destination.', true);
  if (!content.trim() && !Object.values(collectVariants()).some(value => value.trim()) && !files.length && !existingMediaIds.length) return showStatus('Enter a message, add platform-specific copy, or attach an image first.', true);
  if (mode === 'scheduled' && !raw) return showStatus('Choose a future time before scheduling.', true);
  if (files.length > maxImages || files.some(file => file.size > maxBytes)) return showStatus('One or more images exceed the upload limit.', true);
  if (targets.includes('discord') && role && !role.mentionable) return showStatus('Make the selected Discord role Mentionable before posting.', true);
  const custom = Boolean($('#soCustomize').checked), variants = custom ? collectVariants() : {};
  const invalid = targets.find(platform => { const prefix = platform === 'discord' && role ? `<@&${role.id}> ` : ''; const value = custom && Object.prototype.hasOwnProperty.call(variants, platform) ? variants[platform] : content; return Array.from(prefix + value).length > Number(limits[platform] || 0); });
  if (invalid) return showStatus(`${platformLabels[invalid]} allows ${limits[invalid]} characters after the selected role ping; shorten that version.`, true);
  const scheduledFor = mode === 'draft' ? null : mode === 'now' ? Date.now() : new Date(raw).getTime();
  if (mode !== 'draft' && (!Number.isFinite(scheduledFor) || scheduledFor < Date.now() - 60_000)) return showStatus('Choose a valid current or future time.', true);
  try {
    let mediaIds = existingMediaIds.slice();
    if (files.length && (uploadedImageSignature !== imageSignature(files) || uploadedImages.length !== files.length)) {
      showStatus('Uploading images…', false); uploadedImages = []; mediaIds = [];
      const altInputs = [...document.querySelectorAll('.social-alt-input')];
      for (const [index, file] of files.entries()) uploadedImages.push(await uploadImage(file, altInputs[index]?.value || ''));
      uploadedImageSignature = imageSignature(files); mediaIds = uploadedImages.map(item => item.media_id);
    }
    const op = editing ? 'update' : mode === 'draft' ? 'save_draft' : 'queue';
    await api(`/api/guilds/${state.guildId}/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, id: editing?.id, status: mode === 'draft' ? 'draft' : undefined, content, variants, targets, scheduled_for: scheduledFor, media_ids: mediaIds, ping_role_id: targets.includes('discord') ? roleId : null, campaign: $('#soCampaign').value, template_id: $('#soTemplate').value || null }) });
    editingPostId = null; selectedImageFiles = []; uploadedImages = []; uploadedImageSignature = ''; existingMediaIds = []; showStatus(mode === 'draft' ? 'Draft saved.' : mode === 'scheduled' ? 'Post scheduled.' : 'Post queued for delivery.', false); setTimeout(() => renderSocial(), 350);
  } catch (error) { showStatus(error.payload?.detail || `Could not save post (${error.message}).`, true); }
}

async function uploadImage(file, altText) { return api(`/api/guilds/${state.guildId}/social-upload`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream', 'x-orbit-file-name': encodeURIComponent(file.name), 'x-orbit-alt-text': altText }, body: file }); }

async function deleteSocialPost(id) {
  if (!confirm('Delete this social post or draft?')) return;
  try { await api(`/api/guilds/${state.guildId}/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'delete_post', id: Number(id) }) }); renderSocial(); }
  catch (error) { renderError(`Could not delete social post (${error.payload?.detail || error.message}).`); }
}

async function retrySocialPost(id) {
  try { await api(`/api/guilds/${state.guildId}/social`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'action', id: Number(id), action: 'retry' }) }); renderSocial(); }
  catch (error) { renderError(`Could not retry social post (${error.payload?.detail || error.message}).`); }
}

async function makeRoleMentionable(roles, limits) {
  const roleId = $('#soDiscordRole')?.value, button = $('#soMakeMentionable');
  if (!roleId) return showStatus('Choose a Discord role first.', true);
  button.disabled = true; button.textContent = 'Updating…';
  try { await api(`/api/guilds/${state.guildId}/scheduler`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'make_role_mentionable', role_id: roleId }) }); const role = roles.find(item => String(item.id) === String(roleId)); if (role) role.mentionable = true; showStatus('Role is now Mentionable. You can use it for the social post.', false); updateCounts(limits, roles); }
  catch (error) { showStatus(error.payload?.detail || `Could not update role (${error.message}).`, true); }
  finally { button.disabled = false; button.textContent = 'Make selected role Mentionable'; }
}

function selectedTargets() { return [...document.querySelectorAll('.soTarget:checked')].map(input => input.value); }
function collectVariants() { const variants = {}; for (const platform of textTargets) { const input = $(`#soVariant-${platform}`); if (input && !input.disabled) variants[platform] = input.value; } return variants; }
function postCard(post) { const targets = JSONSafe(post.targets_json).map(target => platformLabels[target] || target).join(', '), mediaCount = JSONSafe(post.media_ids_json).length, variants = Object.keys(JSONSafeObject(post.content_variants_json)).length, campaign = post.campaign ? ` · ${escapeHtml(post.campaign)}` : '', when = post.scheduled_for ? new Date(Number(post.scheduled_for)).toLocaleString() : 'No time set'; const actions = post.status === 'draft' || ['scheduled', 'queued', 'failed', 'partial'].includes(post.status) ? `<button class="btn ghost socialEdit" data-id="${post.id}" type="button">Edit</button> <button class="btn ghost socialDelete" data-id="${post.id}" type="button">Delete</button>` : ''; const retry = ['failed', 'partial'].includes(post.status) ? ` <button class="btn secondary socialRetry" data-id="${post.id}" type="button">Retry</button>` : ''; return `<div class="notice social-post-card"><strong>${escapeHtml(post.status)}</strong> · ${escapeHtml(targets)}${mediaCount ? ` · ${mediaCount} image${mediaCount === 1 ? '' : 's'}` : ''}${variants ? ' · custom copy' : ''}${campaign}<br><span class="small">${escapeHtml(when)} · ${escapeHtml(post.content || '(image-only post)')}</span>${actions || retry ? `<br>${actions}${retry}` : ''}</div>`; }
function calendarMarkup(posts) { const today = new Date(); today.setHours(0, 0, 0, 0); return Array.from({ length: 14 }, (_, index) => { const date = new Date(today); date.setDate(today.getDate() + index); const cards = posts.filter(post => post.scheduled_for && sameDay(post.scheduled_for, date) && post.status !== 'sent').map(post => `<div class="social-calendar-item"><strong>${escapeHtml(post.status)}</strong><br><span>${escapeHtml(post.campaign || post.content || 'Image post').slice(0, 80)}</span></div>`).join(''); return `<div class="social-calendar-day"><strong>${index === 0 ? 'Today' : date.toLocaleDateString(undefined, { weekday: 'short' })}</strong><span class="small">${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>${cards || '<span class="small muted">No posts</span>'}</div>`; }).join(''); }
function sameDay(value, date) { const other = new Date(Number(value)); return other.getFullYear() === date.getFullYear() && other.getMonth() === date.getMonth() && other.getDate() === date.getDate(); }
function dateTimeLocal(value) { if (!value) return ''; const date = new Date(Number(value)); if (Number.isNaN(date.getTime())) return ''; const pad = v => String(v).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function imageSignature(files) { return files.map(file => `${file.name}:${file.size}:${file.lastModified}`).join('|'); }
function showStatus(message, error) { const el = $('#socialStatus'); if (el) { el.className = `notice${error ? ' error' : ' success'}`; el.textContent = message; } }
function formatBytes(value) { const bytes = Number(value || 0); if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`; if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`; return `${Math.round(bytes / 1_000)} KB`; }
function JSONSafe(value) { try { const parsed = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
function JSONSafeObject(value) { try { const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value; return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; } }
