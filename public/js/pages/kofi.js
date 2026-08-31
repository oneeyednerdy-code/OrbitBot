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
    body.innerHTML=`<div class="grid"><section class="card span-7"><h2>Webhook</h2><div class="field"><label>Announcement channel</label><select id="kfChannel"><option value="">Select…</option>${channels.map(c=>`<option value="${c.id}" ${c.id===data.integration.default_channel_id?'selected':''}>#${escapeHtml(c.name)}</option>`).join('')}</select></div><button id="kfConnect" class="btn">Generate / Rotate Webhook URL</button><div id="kfUrl" class="notice hidden"></div><hr><div class="section-heading"><div><h2 id="kfFormTitle">Add milestone</h2><p class="small">Create a funding target and the Discord message Orbit should post when it is reached.</p></div><button id="kfCancelEdit" class="btn ghost hidden" type="button">Cancel Edit</button></div><div class="field"><label>Name</label><input id="kfName" placeholder="Domain funded" maxlength="120"></div><div class="form-grid compact"><label>Amount<input id="kfAmount" type="number" min="0.01" step="0.01" placeholder="100"></label><label>Currency<select id="kfCurrency"><option value="USD">USD</option><option value="CAD">CAD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="AUD">AUD</option></select></label></div><div class="field"><label>Announcement</label><textarea id="kfMessage" rows="4" maxlength="2000" placeholder="We hit the milestone! Thank you for supporting the community."></textarea></div><button id="kfMilestone" class="btn secondary">Add Milestone</button></section><section class="card span-5"><h2>Progress</h2>${data.totals.map(t=>`<div class="metric">${escapeHtml(t.currency)} ${(t.amount_minor/100).toFixed(2)}</div>`).join('')||'<div class="empty">No Ko-fi events received.</div>'}<h2>Milestones</h2><div class="milestone-list">${data.milestones.map(m=>`<div class="notice milestone-row ${m.triggered_at?'success':''}"><div><strong>${escapeHtml(m.name)}</strong><br><span class="small">${(m.amount_minor/100).toFixed(2)} ${escapeHtml(m.currency)} · ${m.triggered_at?'Reached':'Waiting'}</span></div><button class="btn ghost kfEdit" type="button" data-id="${m.id}">Edit</button></div>`).join('')||'<div class="empty">No milestones.</div>'}</div></section></div>`;

    let editingId=null;
    const resetEditor=()=>{
      editingId=null;
      $('#kfFormTitle').textContent='Add milestone';
      $('#kfName').value='';$('#kfAmount').value='';$('#kfCurrency').value='USD';$('#kfMessage').value='';
      $('#kfMilestone').textContent='Add Milestone';$('#kfCancelEdit').classList.add('hidden');
    };

    $('#kfConnect')?.addEventListener('click',async()=>{
      const r=await api(`/api/guilds/${guildId}/kofi`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'connect',default_channel_id:$('#kfChannel').value})});
      $('#kfUrl').className='notice success';
      $('#kfUrl').textContent=`Copy this URL into Ko-fi now; Orbit will not show this token again: ${r.webhook_url}`;
    });

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
