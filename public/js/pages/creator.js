import { $,api,escapeHtml,state } from '../core.js';
import { renderError } from './common.js';

const defaultRoleMessage='🔴 **{creator} is LIVE on {platform}!**\n{title}\n{url}';
const defaultOwnerMessage='🔴 **{creator} is LIVE on Twitch!**\n{title}\n{url}';

export async function renderCreator(){
  const guildId=state.guildId;
  $('#content').innerHTML='<div class="eyebrow">CREATOR</div><h1 class="page-title">Community Alerts</h1><p class="page-intro">Announce approved creators, podcast episodes, and TikTok feed updates in the Discord channels your community follows.</p><div id="creatorBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/creator`);
    if(state.guildId!==guildId||state.page!=='creator'||!$('#creatorBody'))return;
    const channels=state.bundle.channels||[];
    const roles=(state.bundle.roles||[]).filter(role=>role.name!=='@everyone').sort((a,b)=>b.position-a.position);
    const config=data.role_automation||{},automationStatus=data.role_automation_status||{};
    const ownerStream=data.owner_stream||{owner_only:false},ownerConfig=ownerStream.config||{},ownerConfigured=Boolean(ownerStream.config),ownerConnections=ownerStream.connections||[];
    const channelOptions=(selected='')=>`<option value="">Select a channel…</option>${channels.map(channel=>`<option value="${channel.id}" ${String(selected)===String(channel.id)?'selected':''}>#${escapeHtml(channel.name)}</option>`).join('')}`;
    const gateRoleOptions=(selected='')=>`<option value="">Select an eligible creator role…</option>${roles.map(role=>`<option value="${role.id}" ${String(selected)===String(role.id)?'selected':''}>${escapeHtml(role.name)}${role.managed?' · managed by Discord':''}</option>`).join('')}`;
    const pingRoleOptions=(selected='')=>`<option value="">No role ping</option>${roles.filter(role=>!role.managed).map(role=>`<option value="${role.id}" ${String(selected)===String(role.id)?'selected':''}>@${escapeHtml(role.name)}${role.mentionable?'':' · currently not Mentionable'}</option>`).join('')}`;
    const ownerConnectionOptions=(selected='')=>`<option value="">Select your Twitch account…</option>${ownerConnections.map(connection=>`<option value="${connection.id}" ${String(selected)===String(connection.id)?'selected':''}>${escapeHtml(connection.account_label||connection.account_login||connection.account_id)}${connection.account_login?'':' · reconnect required'}</option>`).join('')}`;
    const states=new Map((data.role_automation_states||[]).map(item=>[`${item.directory_creator_id}:${item.platform}`,item]));
    const creatorRows=(data.directory_creators||[]).map(creator=>directoryStatus(creator,states)).join('');
    const manualCards=(data.sources||[]).map(source=>`<div class="notice"><strong>${escapeHtml(source.label)}</strong> · ${escapeHtml(source.source_type)}<br><span class="small">${source.last_live_state?'LIVE · ':''}${source.last_error?`Error: ${escapeHtml(source.last_error)}`:`Channel ${escapeHtml(source.discord_channel_id)}`}</span><button class="btn ghost caDel" data-id="${source.id}">Remove</button></div>`).join('');

    const roleStatus=automationStatus.configured?(automationStatus.enabled?'Enabled':'Disabled'):'Not configured',lastChecked=automationStatus.last_checked_at?new Date(automationStatus.last_checked_at).toLocaleString():'Not checked yet';
    $('#creatorBody').outerHTML=`<div class="grid">
      ${ownerStream.owner_only?`<section class="card span-12">
        <div class="eyebrow">SERVER OWNER ONLY</div><h2>My Stream</h2>
        <p class="small">Authorize your own Twitch account and Orbit will post when you go live. This is separate from Community Streamers, so only the server owner can configure or use this alert.</p>
        <div class="notice ${Number(ownerConfig.enabled)===1?'success':''}"><strong>${ownerConfigured?Number(ownerConfig.enabled)===1?'Enabled':'Disabled':'Not configured'}</strong><br><span class="small">${ownerConfigured?'Orbit checks your Twitch channel and remembers the stream ID to prevent duplicate alerts.':'Connect Twitch, choose a destination, and enable My Stream alerts.'}</span></div>
        <div class="form-grid">
          <div class="field"><label for="osConnection">Your connected Twitch account</label><select id="osConnection">${ownerConnectionOptions(ownerConfig.connection_id)}</select><div class="small">Only Twitch accounts authorized by this server owner appear here.</div></div>
          <div class="field"><label for="osChannel">Post live alerts in</label><select id="osChannel">${channelOptions(ownerConfig.discord_channel_id)}</select></div>
          <div class="field"><label for="osMentionRole">Optional ping role</label><select id="osMentionRole">${pingRoleOptions(ownerConfig.mention_role_id)}</select><button id="osMakeMentionable" class="btn ghost" type="button">Make selected role Mentionable</button><div class="small">Orbit can update this role when it is below Orbit’s highest role.</div></div>
          <div class="field"><label for="osInterval">Check every</label><select id="osInterval"><option value="5" ${Number(ownerConfig.poll_interval_minutes||5)===5?'selected':''}>5 minutes</option><option value="10" ${Number(ownerConfig.poll_interval_minutes)===10?'selected':''}>10 minutes</option><option value="15" ${Number(ownerConfig.poll_interval_minutes)===15?'selected':''}>15 minutes</option><option value="30" ${Number(ownerConfig.poll_interval_minutes)===30?'selected':''}>30 minutes</option><option value="60" ${Number(ownerConfig.poll_interval_minutes)===60?'selected':''}>60 minutes</option></select></div>
        </div>
        <label class="check"><input id="osEnabled" type="checkbox" ${Number(ownerConfig.enabled)===1?'checked':''}>Enable My Stream alerts</label>
        <div class="field"><label for="osMessage">Live message</label><textarea id="osMessage" rows="5" maxlength="2000">${escapeHtml(ownerConfig.live_message||defaultOwnerMessage)}</textarea><div class="small">Variables: {creator}, {title}, {url}</div></div>
        <div class="button-row"><a class="btn secondary" href="/connections/twitch/start?guild_id=${encodeURIComponent(guildId)}&purpose=owner_stream">Connect / Reconnect Twitch</a><button id="osSave" class="btn" type="button">Save My Stream Alerts</button>${ownerConfigured?'<button id="osDelete" class="btn ghost" type="button">Delete My Stream</button>':''}</div>
        <div id="osStatus" class="notice hidden" aria-live="polite"></div>
      </section>`:''}
      <section class="card span-7">
        <div class="eyebrow">ROLE-GATED AUTOMATION</div><h2>Announce approved creators</h2>
        <p class="small">Orbit checks approved Creator Directory entries. A creator is announced only when their Discord member has the selected role and their configured Twitch or YouTube channel changes from offline to live.</p>
        <div class="notice ${automationStatus.enabled?'success':''}"><strong>${roleStatus}</strong><br><span class="small">Last check: ${escapeHtml(lastChecked)} · ${Number(automationStatus.eligible_count||0)} eligible · ${Number(automationStatus.live_count||0)} live${Number(automationStatus.error_count||0)?` · ${Number(automationStatus.error_count)} error(s)`:''}</span></div>
        <div class="button-row"><button id="craEdit" class="btn secondary" type="button">${automationStatus.configured?'Edit Automation':'Configure Automation'}</button>${automationStatus.configured?'<button id="craDelete" class="btn ghost" type="button">Delete Automation</button>':''}</div>
        <div id="craEditor" class="${automationStatus.configured?'hidden':''}">
          <label class="check"><input id="craEnabled" type="checkbox" ${Number(config.enabled)===1?'checked':''}>Enable role-gated live alerts</label>
          <div class="form-grid">
            <div class="field"><label for="craRequiredRole">Eligible creator role</label><select id="craRequiredRole">${gateRoleOptions(config.required_role_id)}</select><div class="small">This role is an eligibility check; Orbit does not ping it.</div></div>
            <div class="field"><label for="craChannel">Post live alerts in</label><select id="craChannel">${channelOptions(config.discord_channel_id)}</select></div>
            <div class="field"><label for="craMentionRole">Optional ping role</label><select id="craMentionRole">${pingRoleOptions(config.mention_role_id)}</select><button id="craMakeMentionable" class="btn ghost" type="button">Make selected role Mentionable</button><div class="small">Orbit can update this role when it is below Orbit’s highest role.</div></div>
            <div class="field"><label for="craInterval">Check every</label><select id="craInterval"><option value="5" ${Number(config.poll_interval_minutes||5)===5?'selected':''}>5 minutes</option><option value="10" ${Number(config.poll_interval_minutes)===10?'selected':''}>10 minutes</option><option value="15" ${Number(config.poll_interval_minutes)===15?'selected':''}>15 minutes</option><option value="30" ${Number(config.poll_interval_minutes)===30?'selected':''}>30 minutes</option><option value="60" ${Number(config.poll_interval_minutes)===60?'selected':''}>60 minutes</option></select></div>
          </div>
          <div class="field"><label for="craMessage">Live message</label><textarea id="craMessage" rows="5" maxlength="2000">${escapeHtml(config.live_message||defaultRoleMessage)}</textarea><div class="small">Variables: {creator}, {platform}, {title}, {url}, {vod_url}</div></div>
          <button id="craSave" class="btn" type="button">Save Automation</button><div id="craStatus" class="notice hidden" aria-live="polite"></div>
        </div>
      </section>
      <aside class="card span-5"><h2>Creator eligibility</h2>${creatorRows||'<div class="empty">No Creator Directory entries yet.</div>'}<div class="button-row"><a class="btn secondary" href="#directory" data-page="directory">Open Creator Directory</a></div><div class="callout">Each creator needs a Discord user ID plus a Twitch name or YouTube channel ID. YouTube live detection requires <code>YOUTUBE_API_KEY</code>.</div></aside>
      <section class="card span-5"><h2>Add a manual alert</h2><label>Platform<select id="caType"><option value="twitch">Twitch Live</option><option value="youtube">YouTube Live</option><option value="podcast">Podcast RSS</option><option value="tiktok">TikTok feed</option><option value="rss">RSS / Atom Feed</option></select></label><label>Creator / label<input id="caLabel"></label><label>Twitch name, YouTube channel ID, Podcast/TikTok feed URL, or RSS URL<input id="caValue"></label><label>Discord channel<select id="caChannel">${channelOptions()}</select></label><label>Ping role<select id="caRole">${pingRoleOptions()}</select></label><button id="caMakeMentionable" class="btn ghost" type="button">Make selected role Mentionable</button><label>Going-live / new-post message<textarea id="caLive">🔴 **{creator} is LIVE!**\n{title}\n{url}</textarea></label><label>Offline message<textarea id="caOffline">💜 **{creator} has finished streaming.**\nCatch up here: {vod_url}</textarea></label><label class="check"><input id="caOff" type="checkbox">Post when stream ends</label><button id="caAdd" class="btn">Add Community Alert</button><div class="small">Podcast and TikTok sources use a public RSS/Atom feed URL. Variables: {creator}, {title}, {url}, {vod_url}</div></section>
      <section class="card span-7"><h2>Manual alerts</h2>${manualCards||'<div class="empty">No manual alerts configured.</div>'}</section>
    </div>`;

    $('#craEdit').onclick=()=>{$('#craEditor').classList.remove('hidden');$('#craEdit').classList.add('hidden');};
    if($('#craDelete'))$('#craDelete').onclick=async()=>{if(!confirm('Delete the approved-creator announcement automation? Creator Directory entries will be preserved.'))return;try{await api(`/api/guilds/${guildId}/creator`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'delete_role_automation'})});if(state.guildId===guildId&&state.page==='creator')renderCreator();}catch(error){renderError(`Could not delete the creator automation (${error.payload?.detail||error.message}).`)}};
    const makeMentionable=async(select,button)=>{const roleId=$(select)?.value;if(!roleId){showCreatorStatus('Choose a ping role first.',true);return}button.disabled=true;button.textContent='Updating…';try{await api(`/api/guilds/${guildId}/creator`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'make_role_mentionable',role_id:roleId})});const role=(state.bundle.roles||[]).find(item=>String(item.id)===String(roleId));if(role)role.mentionable=true;showCreatorStatus('Role is now Mentionable. Save the automation to use it.',false);}catch(error){showCreatorStatus(error.payload?.detail||`Could not update role (${error.message}).`,true)}finally{button.disabled=false;button.textContent='Make selected role Mentionable'}};
    $('#craMakeMentionable').onclick=()=>makeMentionable('#craMentionRole',$('#craMakeMentionable'));
    $('#caMakeMentionable').onclick=()=>makeMentionable('#caRole',$('#caMakeMentionable'));
    if(ownerStream.owner_only){
      const showOwnerStatus=(message,error=false)=>{const status=$('#osStatus');if(!status)return;status.className=`notice${error?' error':''}`;status.textContent=message;};
      $('#osMakeMentionable').onclick=async()=>{const roleId=$('#osMentionRole')?.value;if(!roleId){showOwnerStatus('Choose a ping role first.',true);return}const button=$('#osMakeMentionable');button.disabled=true;button.textContent='Updating…';try{await api(`/api/guilds/${guildId}/creator`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'make_owner_role_mentionable',role_id:roleId})});const role=(state.bundle.roles||[]).find(item=>String(item.id)===String(roleId));if(role)role.mentionable=true;showOwnerStatus('Role is now Mentionable. Save My Stream alerts to use it.')}catch(error){showOwnerStatus(error.payload?.detail||`Could not update role (${error.message}).`,true)}finally{button.disabled=false;button.textContent='Make selected role Mentionable'}};
      $('#osSave').onclick=async()=>{showOwnerStatus('Saving My Stream alerts…');try{await api(`/api/guilds/${guildId}/creator`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'save_owner_stream',enabled:$('#osEnabled').checked,connection_id:Number($('#osConnection').value),discord_channel_id:$('#osChannel').value,mention_role_id:$('#osMentionRole').value,poll_interval_minutes:Number($('#osInterval').value),live_message:$('#osMessage').value})});showOwnerStatus('My Stream alerts saved.');if(state.page==='creator')setTimeout(()=>renderCreator(),500)}catch(error){showOwnerStatus(error.payload?.detail||`Could not save My Stream alerts (${error.message}).`,true)}};
      if($('#osDelete'))$('#osDelete').onclick=async()=>{if(!confirm('Delete the server owner My Stream alert configuration?'))return;try{await api(`/api/guilds/${guildId}/creator`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'delete_owner_stream'})});if(state.page==='creator')renderCreator()}catch(error){showOwnerStatus(error.payload?.detail||`Could not delete My Stream alerts (${error.message}).`,true)}};
    }
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

function showCreatorStatus(message,error){const status=$('#craStatus');if(!status)return;status.className=`notice${error?' error':''}`;status.textContent=message;}

function directoryStatus(creator,states){
  const platforms=[];
  if(creator.twitch_name)platforms.push(['twitch','Twitch']);
  if(creator.youtube_channel_id)platforms.push(['youtube','YouTube']);
  const labels=platforms.map(([key,label])=>{const status=states.get(`${creator.id}:${key}`);if(!status)return `${label}: waiting`;if(status.last_error)return `${label}: ${escapeHtml(status.last_error)}`;if(!status.eligible)return `${label}: role missing`;return `${label}: ${status.last_live_state?'LIVE':'eligible'}`}).join(' · ');
  const missing=!creator.enabled?'Directory entry disabled':!creator.approved?'Directory approval required':!creator.discord_user_id?'Discord user ID missing':!platforms.length?'Twitch/YouTube missing':'';
  return `<div class="notice"><strong>${escapeHtml(creator.display_name)}</strong><br><span class="small">${missing||labels}</span></div>`;
}
