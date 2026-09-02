import { $,api,escapeHtml,state } from '../core.js';
import { renderError } from './common.js';

const defaultRoleMessage='🔴 **{creator} is LIVE on {platform}!**\n{title}\n{url}';

export async function renderCreator(){
  const guildId=state.guildId;
  $('#content').innerHTML='<div class="eyebrow">CREATOR</div><h1 class="page-title">Community Alerts</h1><p class="page-intro">Automatically announce eligible community creators when Twitch or YouTube detects that they are live. Manual alerts remain available below.</p><div id="creatorBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/creator`);
    if(state.guildId!==guildId||state.page!=='creator'||!$('#creatorBody'))return;
    const channels=state.bundle.channels||[];
    const roles=(state.bundle.roles||[]).filter(role=>role.name!=='@everyone').sort((a,b)=>b.position-a.position);
    const config=data.role_automation||{};
    const channelOptions=(selected='')=>`<option value="">Select a channel…</option>${channels.map(channel=>`<option value="${channel.id}" ${String(selected)===String(channel.id)?'selected':''}>#${escapeHtml(channel.name)}</option>`).join('')}`;
    const gateRoleOptions=(selected='')=>`<option value="">Select an eligible creator role…</option>${roles.map(role=>`<option value="${role.id}" ${String(selected)===String(role.id)?'selected':''}>${escapeHtml(role.name)}${role.managed?' · managed by Discord':''}</option>`).join('')}`;
    const pingRoleOptions=(selected='')=>`<option value="">No role ping</option>${roles.map(role=>`<option value="${role.id}" ${String(selected)===String(role.id)?'selected':''} ${!role.managed&&role.mentionable?'':'disabled'}>@${escapeHtml(role.name)}${!role.managed&&role.mentionable?'':' · not mentionable'}</option>`).join('')}`;
    const states=new Map((data.role_automation_states||[]).map(item=>[`${item.directory_creator_id}:${item.platform}`,item]));
    const creatorRows=(data.directory_creators||[]).map(creator=>directoryStatus(creator,states)).join('');
    const manualCards=(data.sources||[]).map(source=>`<div class="notice"><strong>${escapeHtml(source.label)}</strong> · ${escapeHtml(source.source_type)}<br><span class="small">${source.last_live_state?'LIVE · ':''}${source.last_error?`Error: ${escapeHtml(source.last_error)}`:`Channel ${escapeHtml(source.discord_channel_id)}`}</span><button class="btn ghost caDel" data-id="${source.id}">Remove</button></div>`).join('');

    $('#creatorBody').outerHTML=`<div class="grid">
      <section class="card span-7">
        <div class="eyebrow">ROLE-GATED AUTOMATION</div><h2>Announce approved creators</h2>
        <p class="small">Orbit checks approved Creator Directory entries. A creator is announced only when their Discord member has the selected role and their configured Twitch or YouTube channel changes from offline to live.</p>
        <label class="check"><input id="craEnabled" type="checkbox" ${Number(config.enabled)===1?'checked':''}>Enable role-gated live alerts</label>
        <div class="form-grid">
          <div class="field"><label for="craRequiredRole">Eligible creator role</label><select id="craRequiredRole">${gateRoleOptions(config.required_role_id)}</select><div class="small">This role is an eligibility check; Orbit does not ping it.</div></div>
          <div class="field"><label for="craChannel">Post live alerts in</label><select id="craChannel">${channelOptions(config.discord_channel_id)}</select></div>
          <div class="field"><label for="craMentionRole">Optional ping role</label><select id="craMentionRole">${pingRoleOptions(config.mention_role_id)}</select><div class="small">Only roles marked Mentionable in Discord can be selected.</div></div>
          <div class="field"><label for="craInterval">Check every</label><select id="craInterval"><option value="5" ${Number(config.poll_interval_minutes||5)===5?'selected':''}>5 minutes</option><option value="10" ${Number(config.poll_interval_minutes)===10?'selected':''}>10 minutes</option><option value="15" ${Number(config.poll_interval_minutes)===15?'selected':''}>15 minutes</option><option value="30" ${Number(config.poll_interval_minutes)===30?'selected':''}>30 minutes</option><option value="60" ${Number(config.poll_interval_minutes)===60?'selected':''}>60 minutes</option></select></div>
        </div>
        <div class="field"><label for="craMessage">Live message</label><textarea id="craMessage" rows="5" maxlength="2000">${escapeHtml(config.live_message||defaultRoleMessage)}</textarea><div class="small">Variables: {creator}, {platform}, {title}, {url}</div></div>
        <button id="craSave" class="btn" type="button">Save Automation</button><div id="craStatus" class="notice hidden" aria-live="polite"></div>
      </section>
      <aside class="card span-5"><h2>Creator eligibility</h2>${creatorRows||'<div class="empty">No Creator Directory entries yet.</div>'}<div class="button-row"><a class="btn secondary" href="#directory" data-page="directory">Open Creator Directory</a></div><div class="callout">Each creator needs a Discord user ID plus a Twitch name or YouTube channel ID. YouTube live detection requires <code>YOUTUBE_API_KEY</code>.</div></aside>
      <section class="card span-5"><h2>Add a manual alert</h2><label>Platform<select id="caType"><option value="twitch">Twitch Live</option><option value="youtube">YouTube Live</option><option value="rss">RSS Feed</option></select></label><label>Creator / label<input id="caLabel"></label><label>Twitch name, YouTube channel ID, or RSS URL<input id="caValue"></label><label>Discord channel<select id="caChannel">${channelOptions()}</select></label><label>Ping role<select id="caRole">${pingRoleOptions()}</select></label><label>Going-live message<textarea id="caLive">🔴 **{creator} is LIVE!**\n{title}\n{url}</textarea></label><label>Offline message<textarea id="caOffline">💜 **{creator} has finished streaming.**\nCatch up here: {vod_url}</textarea></label><label class="check"><input id="caOff" type="checkbox">Post when stream ends</label><button id="caAdd" class="btn">Add Community Alert</button><div class="small">Variables: {creator}, {title}, {url}, {vod_url}</div></section>
      <section class="card span-7"><h2>Manual alerts</h2>${manualCards||'<div class="empty">No manual alerts configured.</div>'}</section>
    </div>`;

    $('#craSave').onclick=async()=>{
      const status=$('#craStatus');status.className='notice';status.textContent='Saving automation…';
      try{
        await api(`/api/guilds/${guildId}/creator`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'save_role_automation',enabled:$('#craEnabled').checked,required_role_id:$('#craRequiredRole').value,discord_channel_id:$('#craChannel').value,mention_role_id:$('#craMentionRole').value,poll_interval_minutes:Number($('#craInterval').value),live_message:$('#craMessage').value})});
        status.className='notice success';status.textContent='Role-gated live alert automation saved.';
        if(state.page==='creator')setTimeout(()=>renderCreator(),500);
      }catch(error){status.className='notice error';status.textContent=error.payload?.detail||`Could not save automation (${error.message}).`;}
    };
    $('#caAdd').onclick=async()=>{await api(`/api/guilds/${guildId}/creator`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source_type:$('#caType').value,label:$('#caLabel').value,source_value:$('#caValue').value,discord_channel_id:$('#caChannel').value,mention_role_id:$('#caRole').value,live_message:$('#caLive').value,offline_message:$('#caOffline').value,notify_offline:$('#caOff').checked})});if(state.page==='creator')renderCreator()};
    document.querySelectorAll('.caDel').forEach(button=>button.onclick=async()=>{await api(`/api/guilds/${guildId}/creator?id=${button.dataset.id}`,{method:'DELETE'});if(state.page==='creator')renderCreator()});
  }catch(error){if(state.guildId===guildId&&state.page==='creator')renderError(`Community Alerts failed (${error.message}).`)}
}

function directoryStatus(creator,states){
  const platforms=[];
  if(creator.twitch_name)platforms.push(['twitch','Twitch']);
  if(creator.youtube_channel_id)platforms.push(['youtube','YouTube']);
  const labels=platforms.map(([key,label])=>{const status=states.get(`${creator.id}:${key}`);if(!status)return `${label}: waiting`;if(status.last_error)return `${label}: ${escapeHtml(status.last_error)}`;if(!status.eligible)return `${label}: role missing`;return `${label}: ${status.last_live_state?'LIVE':'eligible'}`}).join(' · ');
  const missing=!creator.enabled?'Directory entry disabled':!creator.approved?'Directory approval required':!creator.discord_user_id?'Discord user ID missing':!platforms.length?'Twitch/YouTube missing':'';
  return `<div class="notice"><strong>${escapeHtml(creator.display_name)}</strong><br><span class="small">${missing||labels}</span></div>`;
}
