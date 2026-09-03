import { $, api, escapeHtml, state, usableRoles } from '../core.js';
import { renderError } from './common.js';

const templates={
  pronouns:{name:'Pronouns',type:'select',message:'Choose the pronouns you would like others to use for you.',roles:[['He/Him','he him','he/him pronouns'],['She/Her','she her','she/her pronouns'],['They/Them','they them','they/them pronouns'],['He/They','he they'],['She/They','she they'],['It/Its','it its'],['Neopronouns','neo pronouns'],['Any Pronouns','any pronouns'],['Ask Me','ask me','ask pronouns']]},
  notifications:{name:'Notification Pings',type:'select',message:'Choose which community notifications you would like to receive.',roles:[['Stream Alerts','live alerts','stream notifications'],['Event Alerts','events','event notifications'],['Community Updates','announcements','updates'],['Giveaways','giveaway alerts']]},
  interests:{name:'Interests',type:'select',message:'Choose the community topics you are interested in.',roles:[['Gaming','games'],['TTRPG','tabletop','tabletop rpg'],['Content Creation','creator','streamer'],['Tech','technology'],['Art','artist']]},
  regions:{name:'Regions',type:'select',message:'Choose the broad region that best matches your timezone.',roles:[['Americas','north america','south america'],['Europe','european'],['Asia-Pacific','asia pacific','apac'],['Oceania','australia','new zealand']]},
};

export async function renderRoles(){
  const guildId=state.guildId;
  $('#content').innerHTML='<div class="eyebrow">SELF-SERVICE</div><h1 class="page-title">Role Panels</h1><p class="page-intro">Build button or dropdown role panels, or start from a common community template.</p><div id="rolesBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/roles`);
    if(state.guildId!==guildId||state.page!=='roles'||!$('#rolesBody'))return;
    const botTop=Number(state.bundle?.bot?.top_role_position||0);
    const roles=usableRoles().filter(role=>Number(role.position)<botTop);
    const channels=state.bundle.channels||[];
    const panelCards=data.panels.length?data.panels.map(panel=>`<div class="notice"><strong>${escapeHtml(panel.name)}</strong> · ${escapeHtml(panel.interaction_type)}<br><span class="small">${panel.items.length} role option(s)</span><br><button class="btn secondary rpDelete" data-id="${panel.id}">Delete Panel + Message</button></div>`).join(''):'<div class="empty">No panels yet.</div>';
    $('#rolesBody').outerHTML=`<div class="grid">
      <section class="card span-7"><h2>Create panel</h2>
        <div class="field"><label for="rpTemplate">Quick template</label><div class="form-grid"><select id="rpTemplate"><option value="">Custom panel</option><option value="pronouns">Pronouns</option><option value="notifications">Notification Pings</option><option value="interests">Interests</option><option value="regions">Regions / Timezones</option></select><button id="applyRpTemplate" class="btn secondary" type="button">Use Template</button></div><div class="small">Templates match roles you already have. You can optionally let Orbit create any missing roles.</div></div>
        <div id="rpTemplateStatus" class="notice hidden" aria-live="polite"></div>
        <label id="rpCreateMissingWrap" class="check hidden"><input id="rpCreateMissing" type="checkbox">Create missing template roles in Discord</label>
        <div class="field"><label for="rpName">Name</label><input id="rpName" placeholder="Game Roles"></div>
        <div class="field"><label for="rpChannel">Channel</label><select id="rpChannel"><option value="">Select…</option>${channels.map(channel=>`<option value="${channel.id}">#${escapeHtml(channel.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="rpType">Interaction</label><select id="rpType"><option value="button">Buttons</option><option value="select">Dropdown</option></select></div>
        <div class="field"><label for="rpMessage">Message</label><textarea id="rpMessage" rows="3" maxlength="2000" placeholder="Choose your roles"></textarea></div>
        <div class="field"><label>Roles (choose up to 10)</label><div class="grid">${roles.map(role=>`<label class="check span-6"><input class="rpRole" type="checkbox" value="${role.id}" data-name="${escapeHtml(role.name)}">${escapeHtml(role.name)}</label>`).join('')}</div>${roles.length?'<div class="small">Only roles below Orbit in Discord’s hierarchy are shown.</div>':'<div class="callout">Orbit has no assignable roles. Move the Orbit role above the roles members should be able to choose.</div>'}</div>
        <button id="createRp" class="btn">Create + Post Panel</button><div id="rpCreateStatus" class="notice hidden" aria-live="polite"></div>
      </section>
      <section class="card span-5"><h2>Common templates</h2><div class="notice"><strong>Pronouns</strong><br><span class="small">He/Him, She/Her, They/Them, mixed pronouns, It/Its, Neopronouns, Any Pronouns, Ask Me</span></div><div class="notice"><strong>Notification Pings</strong><br><span class="small">Streams, events, community updates, giveaways</span></div><div class="notice"><strong>Interests</strong><br><span class="small">Gaming, TTRPG, content creation, tech, art</span></div><div class="notice"><strong>Regions</strong><br><span class="small">Broad timezone regions without asking members to share a location</span></div><h2>Existing panels</h2>${panelCards}</section>
    </div>`;

    $('#applyRpTemplate').onclick=()=>applyTemplate(roles);
    $('#createRp').onclick=async()=>{
      const status=$('#rpCreateStatus');status.className='notice';status.textContent='Creating role panel…';
      const items=[...document.querySelectorAll('.rpRole:checked')].slice(0,10).map(input=>({role_id:input.value,label:input.dataset.name}));
      try{
        await api(`/api/guilds/${guildId}/roles`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#rpName').value,channel_id:$('#rpChannel').value,interaction_type:$('#rpType').value,message:$('#rpMessage').value,items,template_key:$('#rpTemplate').value,create_missing_template_roles:$('#rpCreateMissing').checked})});
        if(state.guildId===guildId&&state.page==='roles')renderRoles();
      }catch(error){status.className='notice error';status.textContent=error.payload?.detail||`Could not create role panel (${error.message}).`;}
    };
    document.querySelectorAll('.rpDelete').forEach(button=>button.onclick=async()=>{
      if(!confirm('Delete this role panel and its Discord message? Members keep every role they already assigned themselves.'))return;
      try{await api(`/api/guilds/${guildId}/roles?id=${button.dataset.id}`,{method:'DELETE'});if(state.guildId===guildId&&state.page==='roles')renderRoles();}
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
