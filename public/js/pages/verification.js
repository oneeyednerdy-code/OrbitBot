import { $, api, escapeHtml, state, usableRoles } from '../core.js';

export function renderVerification(){
  if(state.page!=='verification')return;
  const config=state.bundle.config||{};
  const roles=usableRoles();
  const channels=state.bundle.channels||[];
  const roleOptions=id=>'<option value="">Select role…</option>'+roles.map(role=>`<option value="${role.id}" ${role.id===id?'selected':''}>${escapeHtml(role.name)}</option>`).join('');
  const channelOptions=(selected='',emptyLabel='Select channel…')=>`<option value="">${emptyLabel}</option>`+channels.map(channel=>`<option value="${channel.id}" ${channel.id===selected?'selected':''}>#${escapeHtml(channel.name)}</option>`).join('');
  $('#content').innerHTML=`<div class="eyebrow">ACCESS + HUMAN VERIFICATION</div><h1 class="page-title">Verification</h1><p class="page-intro">Rules acceptance and a private Cloudflare Turnstile check can combine to grant final server access.</p><div class="grid"><section class="card span-8"><h2>1. Configure access roles</h2><div class="callout">Orbit must sit above all three selected roles in Discord's role hierarchy.</div><div class="grid"><div class="span-6"><div class="field"><label for="rulesRole">Rules role</label><select id="rulesRole">${roleOptions(config.rules_role_id)}</select></div><div class="field"><label for="verifiedRole">Verified role</label><select id="verifiedRole">${roleOptions(config.verified_role_id)}</select></div></div><div class="span-6"><div class="field"><label for="combinedRole">Combined access role</label><select id="combinedRole">${roleOptions(config.combined_role_id)}</select></div><label class="check"><input id="removeCombined" type="checkbox" ${config.remove_combined_when_invalid!==0?'checked':''}>Remove combined access if either prerequisite is lost</label></div></div><div class="button-row"><button id="saveVerification" class="btn" type="button">Save Verification</button></div><div id="saveStatus" class="notice hidden" aria-live="polite"></div></section><aside class="card span-4"><div class="eyebrow">TURNSTILE</div><h2>Human verification</h2><p class="page-intro">Each member receives a private link bound to their Discord account. Links expire after 15 minutes and cannot be reused.</p><span class="status active">✓ Server-side verification</span></aside><section class="card span-7"><h2>2. Post the verification panel</h2><p class="small">Choose your verification channel. Orbit posts a button there; members click it to receive their own private Turnstile link.</p><div class="field"><label for="verifyPanelChannel">Verification channel</label><select id="verifyPanelChannel">${channelOptions()}</select></div><div class="field"><label for="verifyPanelMessage">Panel message</label><textarea id="verifyPanelMessage" rows="4" maxlength="2000">Complete human verification below to unlock server access.</textarea></div><button id="postVerificationPanel" class="btn" type="button">Post Verification Panel</button><div id="verifyPanelStatus" class="notice hidden" aria-live="polite"></div></section><section class="card span-5"><h2>How members verify</h2><ol class="setup-steps"><li>Member clicks <strong>Verify with Orbit</strong> in Discord.</li><li>Orbit replies privately with a 15-minute verification link.</li><li>The member completes Turnstile in their browser.</li><li>Orbit grants the Verified role and checks combined access.</li></ol><div class="callout">Do not post or reuse a manually generated verification URL. Member links are intentionally temporary and account-specific.</div></section><section class="card span-12"><h2>Action notifications</h2><div class="field"><label for="logChannel">Admin log channel</label><select id="logChannel">${channelOptions(config.admin_log_channel_id,'Disabled')}</select></div><div class="grid"><label class="check span-6"><input id="notifyRules" type="checkbox" ${config.notify_rules_granted!==0?'checked':''}>Rules role granted</label><label class="check span-6"><input id="notifyVerified" type="checkbox" ${config.notify_verified_granted!==0?'checked':''}>Verified role granted</label><label class="check span-6"><input id="notifyGrant" type="checkbox" ${config.notify_combined_granted!==0?'checked':''}>Combined role granted</label><label class="check span-6"><input id="notifyRemove" type="checkbox" ${config.notify_combined_removed!==0?'checked':''}>Combined role removed</label></div></section></div>`;
  $('#saveVerification').addEventListener('click',saveVerification);
  $('#postVerificationPanel').addEventListener('click',postVerificationPanel);
}

async function saveVerification(){
  const status=$('#saveStatus');
  if(!status)return;
  status.className='notice';status.textContent='Saving…';status.classList.remove('hidden');
  try{
    const saved=await api(`/api/guilds/${state.guildId}/config`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({rules_role_id:$('#rulesRole').value,verified_role_id:$('#verifiedRole').value,combined_role_id:$('#combinedRole').value,remove_combined_when_invalid:$('#removeCombined').checked,admin_log_channel_id:$('#logChannel').value,notify_combined_granted:$('#notifyGrant').checked,notify_combined_removed:$('#notifyRemove').checked,notify_rules_granted:$('#notifyRules').checked,notify_verified_granted:$('#notifyVerified').checked})});
    if(state.page!=='verification'||!status.isConnected)return;
    state.bundle.config=saved.config;status.className='notice success';status.textContent='Verification configuration saved.';
  }catch(error){
    if(state.page!=='verification'||!status.isConnected)return;
    status.className='notice error';
    status.textContent=error.message==='role_hierarchy'?"One of the selected roles is at or above Orbit's role. Move Orbit higher in Discord and try again.":error.message==='invalid_roles'?'Select three different assignable roles.':`Could not save (${error.payload?.detail||error.message}).`;
  }
}

async function postVerificationPanel(){
  const status=$('#verifyPanelStatus');
  if(!status)return;
  status.className='notice';status.textContent='Posting verification panel…';status.classList.remove('hidden');
  try{
    const result=await api(`/api/guilds/${state.guildId}/post-verification`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel_id:$('#verifyPanelChannel').value,message:$('#verifyPanelMessage').value})});
    if(state.page!=='verification'||!status.isConnected)return;
    status.className='notice success';status.textContent=`Verification panel posted. Discord message ID: ${result.message_id}`;
  }catch(error){
    if(state.page!=='verification'||!status.isConnected)return;
    status.className='notice error';status.textContent=`Could not post verification panel (${error.payload?.detail||error.message}).`;
  }
}
