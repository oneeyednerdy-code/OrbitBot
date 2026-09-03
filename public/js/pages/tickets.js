import { $, api, escapeHtml, state, usableRoles } from '../core.js';
import { renderError } from './common.js';

export async function renderTickets(){
  const guildId=state.guildId;
  $('#content').innerHTML='<div class="eyebrow">SUPPORT</div><h1 class="page-title">Tickets</h1><p class="page-intro">Post a direct ticket button or category dropdown that opens a private support channel.</p><div id="ticketBody" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${guildId}/tickets`);
    if(state.guildId!==guildId||state.page!=='tickets'||!$('#ticketBody'))return;
    const channels=state.bundle.channels||[],roles=usableRoles(),enabledCategories=data.categories.filter(category=>Number(category.enabled)===1);
    const categoryOptions=enabledCategories.map(category=>`<option value="${category.id}">${escapeHtml(category.name)}</option>`).join('');
    $('#ticketBody').outerHTML=`<div class="grid">
      <section class="card span-7"><h2>Add category</h2><div class="field"><label for="tcName">Name</label><input id="tcName" placeholder="General"></div><div class="field"><label for="tcDesc">Description</label><input id="tcDesc" placeholder="General support questions"></div><div class="field"><label for="tcParent">Discord parent category ID (optional)</label><input id="tcParent" placeholder="123456..."></div><div class="field"><label>Staff roles</label><div class="grid">${roles.slice(0,40).map(role=>`<label class="check span-6"><input class="tcRole" type="checkbox" value="${role.id}">${escapeHtml(role.name)}</label>`).join('')}</div></div><div class="field"><label for="tcForm">Form questions, one per line (optional)</label><textarea id="tcForm" rows="5" placeholder="What do you need help with?\nWhat have you already tried?"></textarea></div><button id="addTc" class="btn">Add Category</button><div id="categoryStatus" class="notice hidden" aria-live="polite"></div>
      <hr><h2>Post ticket panel</h2><div class="field"><label for="ticketPanelChannel">Discord channel</label><select id="ticketPanelChannel"><option value="">Select…</option>${channels.map(channel=>`<option value="${channel.id}">#${escapeHtml(channel.name)}</option>`).join('')}</select></div><div class="field"><label for="ticketPanelType">Panel type</label><select id="ticketPanelType"><option value="direct">Direct ticket button</option><option value="dropdown">Category dropdown</option></select></div><div id="directCategoryField" class="field"><label for="ticketPanelCategory">Direct ticket category</label><select id="ticketPanelCategory"><option value="">Select…</option>${categoryOptions}</select><div class="small">Clicking the panel button opens this category directly. If it has questions, Discord shows the form first.</div></div><div id="ticketButtonLabelField" class="field"><label for="ticketButtonLabel">Button label</label><input id="ticketButtonLabel" maxlength="80" value="Open Ticket"></div><div class="field"><label for="ticketPanelMessage">Panel message</label><textarea id="ticketPanelMessage" rows="4" maxlength="2000">**Support Tickets**\nNeed help? Open a private ticket below.</textarea></div><button id="postTicketPanel" class="btn secondary">Post Ticket Panel</button><div id="ticketPanelStatus" class="notice hidden" aria-live="polite"></div></section>
      <section class="card span-5"><h2>Categories</h2>${data.categories.length?data.categories.map(category=>`<div class="notice"><strong>${escapeHtml(category.name)}</strong><br><span class="small">${escapeHtml(category.description||'')}</span></div>`).join(''):'<div class="empty">No categories yet.</div>'}<h2>Recent tickets</h2>${data.tickets.slice(0,20).map(ticket=>`<div class="notice"><strong>#${ticket.id}</strong> · ${escapeHtml(ticket.status)} · <span class="small">${escapeHtml(ticket.opener_user_id)}</span></div>`).join('')||'<div class="empty">No tickets yet.</div>'}<div class="callout">Private ticket channels explicitly allow the member, selected staff roles, and Orbit. Members can only see their own tickets.</div></section>
    </div>`;
    $('#ticketPanelType').onchange=updatePanelMode;updatePanelMode();
    $('#addTc').onclick=async()=>{
      const status=$('#categoryStatus');status.className='notice';status.textContent='Creating category…';
      const staff_role_ids=[...document.querySelectorAll('.tcRole:checked')].map(input=>input.value),form=$('#tcForm').value.split('\n').map(value=>value.trim()).filter(Boolean).slice(0,5).map(label=>({label,long:true,required:true}));
      try{await api(`/api/guilds/${guildId}/tickets`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'category',name:$('#tcName').value,description:$('#tcDesc').value,discord_category_id:$('#tcParent').value,staff_role_ids,form})});if(state.guildId===guildId&&state.page==='tickets')renderTickets();}
      catch(error){status.className='notice error';status.textContent=error.payload?.detail||`Could not create category (${error.message}).`;}
    };
    $('#postTicketPanel').onclick=async()=>{
      const status=$('#ticketPanelStatus');status.className='notice';status.textContent='Posting ticket panel…';
      try{
        const result=await api(`/api/guilds/${guildId}/tickets`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'panel',channel_id:$('#ticketPanelChannel').value,panel_type:$('#ticketPanelType').value,category_id:$('#ticketPanelCategory').value,button_label:$('#ticketButtonLabel').value,message:$('#ticketPanelMessage').value})});
        if(state.guildId!==guildId||state.page!=='tickets')return;
        status.className='notice success';status.innerHTML=`Ticket panel posted successfully. <a href="https://discord.com/channels/${guildId}/${result.channel_id}/${result.message_id}" target="_blank" rel="noopener">View in Discord</a>`;
      }catch(error){status.className='notice error';status.textContent=`${error.payload?.detail||`Could not post the ticket panel (${error.message}).`}${error.payload?.discord_code?` Discord code ${error.payload.discord_code}.`:''}${error.payload?.request_id?` Reference ${error.payload.request_id}.`:''}`;}
    };
  }catch(error){if(state.guildId===guildId&&state.page==='tickets')renderError(`Tickets failed (${error.message}).`)}
}

function updatePanelMode(){const direct=$('#ticketPanelType')?.value==='direct';$('#directCategoryField')?.classList.toggle('hidden',!direct);$('#ticketButtonLabelField')?.classList.toggle('hidden',!direct)}
