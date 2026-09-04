import { $, api, escapeHtml, state, usableRoles } from '../core.js';
import { renderError } from './common.js';

let editingRewardId=null;

export async function renderLeveling(message=''){
  const guildId=state.guildId;
  if(state.page!=='leveling')return;
  $('#content').innerHTML='<div class="eyebrow">ENGAGEMENT</div><h1 class="page-title">Leveling</h1><p class="page-intro">Message XP with cooldowns, rewards and a server leaderboard.</p><div id="levelBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/leveling`);
    if(state.guildId!==guildId||state.page!=='leveling'||!$('#levelBody'))return;
    const c=data.config||{},rewards=data.rewards||[];
    if(editingRewardId&&!rewards.some(reward=>Number(reward.id)===Number(editingRewardId)))editingRewardId=null;
    const editing=rewards.find(reward=>Number(reward.id)===Number(editingRewardId));
    const roles=usableRoles();
    const allRoles=state.bundle.roles||[];
    const roleName=roleId=>allRoles.find(role=>String(role.id)===String(roleId))?.name||`Unavailable role (${roleId})`;
    const channels=state.bundle.channels||[];
    const rewardCards=rewards.length?rewards.map(reward=>`<div class="notice"><strong>Level ${Number(reward.level)}</strong><br><span class="small">@${escapeHtml(roleName(reward.role_id))}</span><br><button class="btn secondary lvEditReward" type="button" data-id="${Number(reward.id)}">Edit reward</button> <button class="btn ghost lvDeleteReward" type="button" data-id="${Number(reward.id)}">Delete</button></div>`).join(''):'<div class="empty">No role rewards yet.</div>';
    const selectedRole=editing?String(editing.role_id):'';
    const roleOptions=[...roles];
    if(selectedRole&&!roleOptions.some(role=>String(role.id)===selectedRole))roleOptions.unshift({id:selectedRole,name:roleName(selectedRole)});
    $('#levelBody').outerHTML=`<div class="grid">
      <section class="card span-7"><h2>XP settings</h2>${message?`<div class="notice">${escapeHtml(message)}</div>`:''}
        <label class="check"><input id="lvEnabled" type="checkbox" ${c.enabled?'checked':''}>Enable leveling</label>
        <div class="grid"><div class="field span-4"><label for="lvMin">Min XP</label><input id="lvMin" type="number" min="1" value="${Number(c.xp_min||15)}"></div><div class="field span-4"><label for="lvMax">Max XP</label><input id="lvMax" type="number" min="1" value="${Number(c.xp_max||25)}"></div><div class="field span-4"><label for="lvCooldown">Cooldown sec</label><input id="lvCooldown" type="number" min="10" value="${Number(c.cooldown_seconds||60)}"></div></div>
        <div class="field"><label for="lvChannel">Level-up channel</label><select id="lvChannel"><option value="">Disabled</option>${channels.map(channel=>`<option value="${channel.id}" ${String(channel.id)===String(c.announce_channel_id)?'selected':''}>#${escapeHtml(channel.name)}</option>`).join('')}</select></div>
        <button id="saveLevelSettings" class="btn" type="button">Save XP Settings</button>
        <hr>
        <h2>${editing?'Edit role reward':'Add role reward'}</h2>
        <div class="grid"><div class="field span-4"><label for="lvRewardLevel">Level</label><input id="lvRewardLevel" type="number" min="1" value="${editing?Number(editing.level):''}" placeholder="10"></div><div class="field span-8"><label for="lvRewardRole">Role</label><select id="lvRewardRole"><option value="">Select role…</option>${roleOptions.map(role=>`<option value="${role.id}" ${String(role.id)===selectedRole?'selected':''}>@${escapeHtml(role.name)}</option>`).join('')}</select></div></div>
        <button id="saveLevelReward" class="btn" type="button">${editing?'Save Reward Changes':'Add Role Reward'}</button>${editing?' <button id="cancelLevelReward" class="btn secondary" type="button">Cancel</button>':''}<div id="levelStatus" class="notice hidden" aria-live="polite"></div>
      </section>
      <section class="card span-5"><h2>Manual XP adjustment</h2><p class="small">Grant XP to a member without changing their message cooldown. Enter the Discord user ID exactly.</p><div class="field"><label for="lvXpUser">Discord user ID</label><input id="lvXpUser" inputmode="numeric" placeholder="123456789012345678"></div><div class="form-grid compact"><label>Username (optional)<input id="lvXpUsername" placeholder="OneEyedNerdy"></label><label>XP to add<input id="lvXpAmount" type="number" min="1" max="1000000" value="100"></label></div><button id="addLevelXp" class="btn secondary" type="button">Add XP</button><div id="xpAdjustStatus" class="notice hidden" aria-live="polite"></div><h2>Current role rewards</h2>${rewardCards}<h2>Leaderboard</h2>${(data.leaders||[]).slice(0,25).map((row,index)=>`<div class="notice"><strong>#${index+1} · ${escapeHtml(row.username||'Unknown username')}</strong><br><span class="small">Discord ID: ${escapeHtml(row.user_id)} · Level ${Number(row.level)} · ${Number(row.xp)} XP</span></div>`).join('')||'<div class="empty">No XP yet.</div>'}</section>
    </div>`;

    $('#saveLevelSettings').onclick=async()=>{
      const button=$('#saveLevelSettings');button.disabled=true;button.textContent='Saving…';
      try{
        await api(`/api/guilds/${guildId}/leveling`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'save_settings',enabled:$('#lvEnabled').checked,xp_min:Number($('#lvMin').value),xp_max:Number($('#lvMax').value),cooldown_seconds:Number($('#lvCooldown').value),announce_channel_id:$('#lvChannel').value})});
        if(state.guildId===guildId&&state.page==='leveling')renderLeveling('XP settings saved.');
      }catch(error){showStatus(error.payload?.detail||`Could not save XP settings (${error.message}).`);button.disabled=false;button.textContent='Save XP Settings';}
    };
    $('#saveLevelReward').onclick=async()=>{
      const button=$('#saveLevelReward'),status=$('#levelStatus');button.disabled=true;button.textContent='Saving…';status.className='notice';status.textContent=editing?'Updating role reward…':'Adding role reward…';
      try{
        await api(`/api/guilds/${guildId}/leveling`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:editing?'update_reward':'create_reward',reward_id:editing?.id,level:Number($('#lvRewardLevel').value),role_id:$('#lvRewardRole').value,remove_previous:Boolean(editing?.remove_previous)})});
        editingRewardId=null;
        if(state.guildId===guildId&&state.page==='leveling')renderLeveling(editing?'Role reward updated.':'Role reward added.');
      }catch(error){status.className='notice error';status.textContent=error.payload?.detail||`Could not save role reward (${error.message}).`;button.disabled=false;button.textContent=editing?'Save Reward Changes':'Add Role Reward';}
    };
    document.querySelectorAll('.lvEditReward').forEach(button=>button.onclick=()=>{editingRewardId=Number(button.dataset.id);renderLeveling();});
    document.querySelectorAll('.lvDeleteReward').forEach(button=>button.onclick=async()=>{
      if(!confirm('Delete this leveling reward rule? Existing members keep the role they already have.'))return;
      try{await api(`/api/guilds/${guildId}/leveling?id=${encodeURIComponent(button.dataset.id)}`,{method:'DELETE'});if(Number(editingRewardId)===Number(button.dataset.id))editingRewardId=null;if(state.guildId===guildId&&state.page==='leveling')renderLeveling('Role reward deleted.');}
      catch(error){showStatus(error.payload?.detail||`Could not delete role reward (${error.message}).`);}
    });
    $('#addLevelXp').onclick=async()=>{
      const button=$('#addLevelXp'),status=$('#xpAdjustStatus');button.disabled=true;button.textContent='Adding…';status.className='notice';status.textContent='Adding XP…';
      try{const result=await api(`/api/guilds/${guildId}/leveling`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'add_xp',user_id:$('#lvXpUser').value,username:$('#lvXpUsername').value,amount:Number($('#lvXpAmount').value)})});if(state.guildId===guildId&&state.page==='leveling')renderLeveling(`Added ${Number($('#lvXpAmount').value)} XP. Member total: ${result.xp} XP.`);}
      catch(error){status.className='notice error';status.textContent=error.payload?.detail||`Could not add XP (${error.message}).`;button.disabled=false;button.textContent='Add XP';}
    };
    if($('#cancelLevelReward'))$('#cancelLevelReward').onclick=()=>{editingRewardId=null;renderLeveling();};
  }catch(error){if(state.guildId===guildId&&state.page==='leveling')renderError(`Leveling failed (${error.message}).`)}
}

function showStatus(message){const status=$('#levelStatus');if(!status)return;status.className='notice error';status.textContent=message;}
