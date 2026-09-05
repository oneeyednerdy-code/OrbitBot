import { $, api, escapeHtml, state } from '../core.js';
import { renderError } from './common.js';

function milestoneMessage(milestone){
  try{
    const actions=JSON.parse(milestone.actions_json||'[]');
    return String(actions.find(action=>action?.type==='discord_message')?.content||'');
  }catch{return ''}
}

export async function renderKofi(){
  const guildId=state.guildId;
  $('#content').innerHTML='<div class="eyebrow">CREATOR SUPPORT</div><h1 class="page-title">Ko-fi Milestones</h1><p class="page-intro">Receive Ko-fi webhooks, track totals and announce one-time milestones in Discord.</p><div id="kofiBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/kofi`);
    if(state.guildId!==guildId||state.page!=='kofi')return;
    const body=$('#kofiBody');if(!body)return;
    const channels=state.bundle.channels||[];
    const milestoneById=new Map(data.milestones.map(m=>[String(m.id),m]));
    body.className='';
    body.innerHTML=`<div class="grid"><section class="card span-7"><h2>Webhook</h2><p class="small">One URL receives every Ko-fi payment. Orbit checks the payment against your milestones; milestones do not need separate webhook URLs.</p><div class="field"><label>Announcement channel</label><select id="kfChannel"><option value="">Select…</option>${channels.map(c=>`<option value="${c.id}" ${c.id===data.integration.default_channel_id?'selected':''}>#${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="field"><label for="kfToken">Ko-fi verification token</label><input id="kfToken" type="password" autocomplete="new-password" placeholder="Paste the token from Ko-fi Advanced settings"><div class="small">Orbit stores a hash and never displays the token after saving.</div></div><button id="kfConnect" class="btn">Save Ko-fi Webhook</button><div id="kfUrl" class="notice ${data.integration.token_configured?'success':'hidden'}">${data.integration.token_configured?`<strong>Webhook URL</strong><br><code id="kfWebhookUrl">${escapeHtml(data.integration.webhook_url)}</code> <button id="kfCopyUrl" class="btn ghost" type="button">Copy URL</button><div class="small">Paste this URL into Ko-fi. The URL is shared with Ko-fi; the verification token stays in Orbit.</div>`:''}</div><hr><div class="section-heading"><div><h2 id="kfFormTitle">Add milestone</h2><p class="small">Create a funding target and the Discord message Orbit should post when it is reached.</p></div><button id="kfCancelEdit" class="btn ghost hidden" type="button">Cancel Edit</button></div><div class="field"><label>Name</label><input id="kfName" placeholder="Domain funded" maxlength="120"></div><div class="form-grid compact"><label>Amount<input id="kfAmount" type="number" min="0.01" step="0.01" placeholder="100"></label><label>Currency<select id="kfCurrency"><option value="USD">USD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AUD">AUD</option></select></label></div><div class="field"><label>Announcement</label><textarea id="kfMessage" rows="4" maxlength="2000" placeholder="We hit the milestone! Thank you for supporting the community."></textarea></div><button id="kfMilestone" class="btn secondary">Add Milestone</button></section><section class="card span-5"><h2>Progress</h2>${data.totals.map(t=>`<div class="metric">${escapeHtml(t.currency)} ${(t.amount_minor/100).toFixed(2)}</div>`).join('')||'<div class="empty">No Ko-fi events received.</div>'}<h2>Milestones</h2><div class="milestone-list">${data.milestones.map(m=>`<div class="notice milestone-row ${m.triggered_at?'success':''}"><div><strong>${escapeHtml(m.name)}</strong><br><span class="small">${(m.amount_minor/100).toFixed(2)} ${escapeHtml(m.currency)} · ${Number(m.enabled)===0?'Disabled':m.triggered_at?'Reached':'Waiting'}</span></div><div class="milestone-actions"><button class="btn ghost kfEdit" type="button" data-id="${m.id}">Edit</button><button class="btn ghost kfToggle" type="button" data-id="${m.id}">${Number(m.enabled)===0?'Enable':'Disable'}</button><button class="btn danger kfDelete" type="button" data-id="${m.id}">Delete</button></div></div>`).join('')||'<div class="empty">No milestones.</div>'}</div></section></div>`;

    let editingId=null;
    const resetEditor=()=>{
      editingId=null;
      $('#kfFormTitle').textContent='Add milestone';
      $('#kfName').value='';$('#kfAmount').value='';$('#kfCurrency').value='USD';$('#kfMessage').value='';
      $('#kfMilestone').textContent='Add Milestone';$('#kfCancelEdit').classList.add('hidden');
    };

    $('#kfConnect')?.addEventListener('click',async()=>{
      const token=$('#kfToken').value.trim();
      const r=await api(`/api/guilds/${guildId}/kofi`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'connect',webhook_token:token,default_channel_id:$('#kfChannel').value})});
      $('#kfUrl').className='notice success';
      $('#kfUrl').innerHTML=`<strong>Webhook URL</strong><br><code id="kfWebhookUrl">${escapeHtml(r.webhook_url)}</code> <button id="kfCopyUrl" class="btn ghost" type="button">Copy URL</button><div class="small">Paste this URL into Ko-fi. The verification token stays in Orbit.</div>`;
      $('#kfToken').value='';
      $('#kfCopyUrl')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(r.webhook_url);$('#kfCopyUrl').textContent='Copied';});
    });
    $('#kfCopyUrl')?.addEventListener('click',async()=>{await navigator.clipboard.writeText(data.integration.webhook_url);$('#kfCopyUrl').textContent='Copied';});

    document.querySelectorAll('.kfEdit').forEach(button=>button.addEventListener('click',()=>{
      const milestone=milestoneById.get(button.dataset.id);if(!milestone)return;
      editingId=Number(milestone.id);
      $('#kfFormTitle').textContent='Edit milestone';
      $('#kfName').value=milestone.name||'';
      $('#kfAmount').value=(Number(milestone.amount_minor||0)/100).toFixed(2);
      $('#kfCurrency').value=milestone.currency||'USD';
      $('#kfMessage').value=milestoneMessage(milestone);
      $('#kfMilestone').textContent='Save Changes';
      $('#kfCancelEdit').classList.remove('hidden');
      $('#kfFormTitle').scrollIntoView({behavior:'smooth',block:'start'});
    }));

    document.querySelectorAll('.kfToggle').forEach(button=>button.addEventListener('click',async()=>{
      await api(`/api/guilds/${guildId}/kofi`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'toggle_milestone',id:Number(button.dataset.id)})});
      renderKofi();
    }));
    document.querySelectorAll('.kfDelete').forEach(button=>button.addEventListener('click',async()=>{
      const milestone=milestoneById.get(button.dataset.id);if(!milestone||!confirm(`Delete the ${milestone.name} milestone?`))return;
      await api(`/api/guilds/${guildId}/kofi`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'delete_milestone',id:Number(button.dataset.id)})});
      renderKofi();
    }));

    $('#kfCancelEdit')?.addEventListener('click',resetEditor);
    $('#kfMilestone')?.addEventListener('click',async()=>{
      const payload={op:editingId?'update_milestone':'milestone',id:editingId||undefined,name:$('#kfName').value,amount:Number($('#kfAmount').value),message:$('#kfMessage').value,currency:$('#kfCurrency').value};
      await api(`/api/guilds/${guildId}/kofi`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      renderKofi();
    });
  }catch(error){
    if(state.guildId===guildId&&state.page==='kofi')renderError(`Ko-fi failed (${error.message}).`);
  }
}
