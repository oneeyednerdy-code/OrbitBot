import { $, api, escapeHtml, state, usableRoles } from '../core.js';
import { renderError } from './common.js';

const templates={
  pronouns:{name:'Pronouns',type:'select',message:'Choose the pronouns you would like others to use for you.',roles:[['He/Him','he him','he/him pronouns'],['She/Her','she her','she/her pronouns'],['They/Them','they them','they/them pronouns'],['He/They','he they'],['She/They','she they'],['It/Its','it its'],['Neopronouns','neo pronouns'],['Any Pronouns','any pronouns'],['Ask Me','ask me','ask pronouns']]},
  notifications:{name:'Notification Pings',type:'select',message:'Choose which community notifications you would like to receive.',roles:[['Stream Alerts','live alerts','stream notifications'],['Event Alerts','events','event notifications'],['Community Updates','announcements','updates'],['Giveaways','giveaway alerts']]},
  interests:{name:'Interests',type:'select',message:'Choose the community topics you are interested in.',roles:[['Gaming','games'],['TTRPG','tabletop','tabletop rpg'],['Content Creation','creator','streamer'],['Tech','technology'],['Art','artist']]},
  games:{name:'Game Categories',type:'select',message:'Choose the game categories you enjoy.',roles:[['MMORPG','mmo'],['RPG','role playing'],['FPS','first person shooter'],['Strategy','strategy games'],['Simulation','sim games'],['Horror','horror games'],['Cozy Games','cozy'],['TTRPG','tabletop','tabletop rpg']]},
  regions:{name:'Regions',type:'select',message:'Choose the broad region that best matches your timezone.',roles:[['Americas','north america','south america'],['Europe','european'],['Asia-Pacific','asia pacific','apac'],['Oceania','australia','new zealand']]},
};

let editingPanel=null;

export async function renderRoles(message=''){
  const guildId=state.guildId;
  if(editingPanel&&String(editingPanel.guild_id)!==String(guildId))editingPanel=null;
  $('#content').innerHTML='<div class="eyebrow">SELF-SERVICE</div><h1 class="page-title">Role Panels</h1><p class="page-intro">Build button or dropdown role panels, or start from a common community template.</p><div id="rolesBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/roles`);
    if(state.guildId!==guildId||state.page!=='roles'||!$('#rolesBody'))return;
    const botTop=Number(state.bundle?.bot?.top_role_position||0);
    const assignableRoles=usableRoles().filter(role=>Number(role.position)<botTop);
    const selectedIds=new Set((editingPanel?.items||[]).map(item=>String(item.role_id)));
    const roles=[...assignableRoles];
    for(const roleId of selectedIds){if(!roles.some(role=>String(role.id)===roleId)){const existing=(state.bundle.roles||[]).find(role=>String(role.id)===roleId);roles.push(existing||{id:roleId,name:`Unavailable role (${roleId})`,position:0});}}
    const channels=state.bundle.channels||[],isEditing=Boolean(editingPanel);
    const panelCards=data.panels.length?data.panels.map(panel=>`<div class="notice"><strong>${escapeHtml(panel.name)}</strong> · ${escapeHtml(panel.interaction_type)}<br><span class="small">${panel.items.length} role option(s)</span><br><button class="btn secondary rpEdit" type="button" data-id="${Number(panel.id)}">Edit</button> <button class="btn secondary rpDelete" type="button" data-id="${Number(panel.id)}">Delete Panel + Message</button></div>`).join(''):'<div class="empty">No panels yet.</div>';
    $('#rolesBody').outerHTML=`<div class="grid">
      <section class="card span-7"><h2>${isEditing?'Edit panel':'Create panel'}</h2>${message?`<div class="notice">${escapeHtml(message)}</div>`:''}
        <div class="field ${isEditing?'hidden':''}"><label for="rpTemplate">Quick template</label><div class="form-grid"><select id="rpTemplate"><option value="">Custom panel</option><option value="pronouns">Pronouns</option><option value="notifications">Notification Pings</option><option value="interests">Interests</option><option value="games">Game Categories</option><option value="regions">Regions / Timezones</option></select><button id="applyRpTemplate" class="btn secondary" type="button">Use Template</button></div><div class="small">Templates match roles you already have. You can optionally let Orbit create any missing roles.</div></div>
        <div id="rpTemplateStatus" class="notice hidden" aria-live="polite"></div>
        <label id="rpCreateMissingWrap" class="check hidden"><input id="rpCreateMissing" type="checkbox">Create missing template roles in Discord</label>
        ${editingPanel?.message_warning?`<div class="notice">${escapeHtml(editingPanel.message_warning)}</div>`:''}
        <div class="field"><label for="rpName">Name</label><input id="rpName" maxlength="80" placeholder="Game Roles" value="${escapeHtml(editingPanel?.name||'')}"></div>
        <div class="field"><label for="rpChannel">Channel</label><select id="rpChannel" ${isEditing?'disabled':''}><option value="">Select…</option>${channels.map(channel=>`<option value="${channel.id}" ${String(channel.id)===String(editingPanel?.channel_id||'')?'selected':''}>#${escapeHtml(channel.name)}</option>`).join('')}</select>${isEditing?'<div class="small">The destination stays fixed while editing. Delete and recreate the panel to move it.</div>':''}</div>
        <div class="field"><label for="rpType">Interaction</label><select id="rpType"><option value="button" ${editingPanel?.interaction_type==='button'?'selected':''}>Buttons</option><option value="select" ${editingPanel?.interaction_type==='select'?'selected':''}>Dropdown</option></select></div>
        <div class="field"><label for="rpMessage">Message</label><textarea id="rpMessage" rows="5" maxlength="2000" placeholder="Choose your roles">${escapeHtml(editingPanel?.message||'')}</textarea></div>
        <div class="field"><label>Roles (choose up to 10)</label><div class="grid">${roles.map(role=>`<label class="check span-6"><input class="rpRole" type="checkbox" value="${role.id}" data-name="${escapeHtml(role.name)}" ${selectedIds.has(String(role.id))?'checked':''}>${escapeHtml(role.name)}</label>`).join('')}</div>${roles.length?'<div class="small">Only roles below Orbit in Discord’s hierarchy are normally shown.</div>':'<div class="callout">Orbit has no assignable roles. Move the Orbit role above the roles members should be able to choose.</div>'}</div>
        <button id="saveRp" class="btn" type="button">${isEditing?'Save Panel Changes':'Create + Post Panel'}</button>${isEditing?' <button id="cancelRp" class="btn secondary" type="button">Cancel</button>':''}<div id="rpCreateStatus" class="notice hidden" aria-live="polite"></div>
      </section>
      <section class="card span-5"><h2>Common templates</h2><div class="notice"><strong>Pronouns</strong><br><span class="small">He/Him, She/Her, They/Them, mixed pronouns, It/Its, Neopronouns, Any Pronouns, Ask Me</span></div><div class="notice"><strong>Notification Pings</strong><br><span class="small">Streams, events, community updates, giveaways</span></div><div class="notice"><strong>Interests</strong><br><span class="small">Gaming, TTRPG, content creation, tech, art</span></div><div class="notice"><strong>Game Categories</strong><br><span class="small">MMORPG, RPG, FPS, strategy, simulation, horror, cozy games, TTRPG</span></div><div class="notice"><strong>Regions</strong><br><span class="small">Broad timezone regions without asking members to share a location</span></div><h2>Existing panels</h2>${panelCards}</section>
    </div>`;

    if($('#applyRpTemplate'))$('#applyRpTemplate').onclick=()=>applyTemplate(assignableRoles);
    $('#saveRp').onclick=async()=>{
      const status=$('#rpCreateStatus'),button=$('#saveRp');status.className='notice';status.textContent=isEditing?'Updating role panel…':'Creating role panel…';button.disabled=true;button.textContent='Saving…';
      const items=[...document.querySelectorAll('.rpRole:checked')].slice(0,10).map(input=>({role_id:input.value,label:input.dataset.name}));
      try{
        const result=await api(`/api/guilds/${guildId}/roles`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:isEditing?'update_panel':'create_panel',panel_id:editingPanel?.id,name:$('#rpName').value,channel_id:isEditing?editingPanel.channel_id:$('#rpChannel').value,interaction_type:$('#rpType').value,message:$('#rpMessage').value,items,template_key:$('#rpTemplate')?.value||'',create_missing_template_roles:Boolean($('#rpCreateMissing')?.checked)})});
        editingPanel=null;
        if(state.guildId===guildId&&state.page==='roles')renderRoles(result.replaced_missing_message?'Panel updated and its missing Discord message was reposted.':isEditing?'Role panel updated.':'Role panel created and posted.');
      }catch(error){status.className='notice error';status.textContent=error.payload?.detail||`Could not ${isEditing?'update':'create'} role panel (${error.message}).`;button.disabled=false;button.textContent=isEditing?'Save Panel Changes':'Create + Post Panel';}
    };
    if($('#cancelRp'))$('#cancelRp').onclick=()=>{editingPanel=null;renderRoles();};
    document.querySelectorAll('.rpEdit').forEach(button=>button.onclick=async()=>{
      button.disabled=true;button.textContent='Loading…';
      try{const detail=await api(`/api/guilds/${guildId}/roles?id=${button.dataset.id}`);editingPanel=detail.panel;if(state.guildId===guildId&&state.page==='roles')renderRoles();}
      catch(error){if(state.guildId===guildId&&state.page==='roles')renderError(`Could not load role panel (${error.payload?.detail||error.message}).`);}
    });
    document.querySelectorAll('.rpDelete').forEach(button=>button.onclick=async()=>{
      if(!confirm('Delete this role panel and its Discord message? Members keep every role they already assigned themselves.'))return;
      try{await api(`/api/guilds/${guildId}/roles?id=${button.dataset.id}`,{method:'DELETE'});if(Number(editingPanel?.id)===Number(button.dataset.id))editingPanel=null;if(state.guildId===guildId&&state.page==='roles')renderRoles('Role panel and its Discord message were deleted. Member roles were preserved.');}
      catch(error){if(state.guildId===guildId&&state.page==='roles')renderError(`Could not delete role panel (${error.payload?.detail||error.message}).`);}
    });
  }catch(error){if(state.guildId===guildId&&state.page==='roles')renderError(`Roles failed (${error.message}).`)}
}

function applyTemplate(roles){
  const key=$('#rpTemplate').value,template=templates[key],status=$('#rpTemplateStatus'),createWrap=$('#rpCreateMissingWrap');
  document.querySelectorAll('.rpRole').forEach(input=>{input.checked=false});
  if(!template){status.className='notice hidden';createWrap.classList.add('hidden');$('#rpCreateMissing').checked=false;return;}
  $('#rpName').value=template.name;$('#rpType').value=template.type;$('#rpMessage').value=template.message;
  const matched=[],missing=[];
  for(const [name,...aliases] of template.roles){const names=[name,...aliases].map(normalize);const role=roles.find(item=>names.includes(normalize(item.name)));if(role){const input=document.querySelector(`.rpRole[value="${role.id}"]`);if(input){input.checked=true;matched.push(name)}}else missing.push(name)}
  createWrap.classList.toggle('hidden',missing.length===0);$('#rpCreateMissing').checked=false;
  status.className='notice';status.innerHTML=`Matched <strong>${matched.length}</strong> existing role${matched.length===1?'':'s'}.${missing.length?` Missing: ${missing.map(escapeHtml).join(', ')}.`:' All template roles are ready.'}`;
}

function normalize(value){return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
