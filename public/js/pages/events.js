import { $,api,escapeHtml,state } from '../core.js';
import { renderError } from './common.js';

export async function renderEvents(){
  $('#content').innerHTML='<div class="eyebrow">CREATOR</div><h1 class="page-title">Events</h1><p class="page-intro">Plan community events and optionally create a native Discord Scheduled Event at the same time.</p><div id="events" class="empty">Loading…</div>';
  try{
    const data=await api(`/api/guilds/${state.guildId}/events`);
    $('#events').outerHTML=`<div id="eventNotice"></div><div class="grid"><section class="card span-5"><h2>Create event</h2><label>Name<input id="evName"></label><label>Description<textarea id="evDesc"></textarea></label><label>Starts<input id="evStart" type="datetime-local"></label><label>Ends<input id="evEnd" type="datetime-local"></label><label>Location<input id="evLocation" value="Discord"></label><label class="check"><input id="evDiscord" type="checkbox" checked>Create Discord Scheduled Event</label><button id="evAdd" class="btn">Create Event</button><div class="small" style="margin-top:10px">Discord external events require Orbit to have the Create Events permission.</div></section><section class="card span-7"><h2>Upcoming</h2>${data.events.length?data.events.map(x=>`<div class="notice"><strong>${escapeHtml(x.name)}</strong><br><span class="small">${new Date(x.starts_at).toLocaleString()} ${x.discord_event_id?'· Discord event created':''}</span><button class="btn ghost evDel" data-id="${x.id}">Remove</button></div>`).join(''):'<div class="empty">No events scheduled.</div>'}</section></div>`;
    $('#evAdd').onclick=createEvent;
    document.querySelectorAll('.evDel').forEach(button=>button.onclick=()=>removeEvent(button.dataset.id));
  }catch(e){renderError(`Events failed (${friendly(e)}).`)}
}

async function createEvent(){
  const button=$('#evAdd');
  button.disabled=true;button.textContent='Creating…';notice('');
  try{
    const startRaw=$('#evStart').value;
    const endRaw=$('#evEnd').value;
    if(!startRaw)throw new Error('Choose a start date and time');
    const result=await api(`/api/guilds/${state.guildId}/events`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:$('#evName').value,description:$('#evDesc').value,starts_at:new Date(startRaw).getTime(),ends_at:endRaw?new Date(endRaw).getTime():null,location:$('#evLocation').value,create_discord_event:$('#evDiscord').checked})});
    if($('#evDiscord').checked&&!result.discord_event_id)throw new Error('Orbit saved the event but Discord did not return an event ID');
    await renderEvents();
  }catch(e){notice(formatError(e),'error');}
  finally{if(document.querySelector('#evAdd')){document.querySelector('#evAdd').disabled=false;document.querySelector('#evAdd').textContent='Create Event';}}
}

async function removeEvent(id){
  if(!confirm('Remove this event? If Orbit created a Discord Scheduled Event, it will be removed there too.'))return;
  try{await api(`/api/guilds/${state.guildId}/events?id=${encodeURIComponent(id)}`,{method:'DELETE'});renderEvents();}
  catch(e){notice(formatError(e),'error')}
}
function formatError(e){const detail=e?.payload?.detail||e?.message||'Unknown error';const request=e?.payload?.request_id?` Reference ${e.payload.request_id}.`:'';const code=e?.payload?.discord_code?` Discord code ${e.payload.discord_code}.`:'';return `${detail}.${code}${request}`.replace('..','.');}
function friendly(e){return e?.payload?.detail||e?.message||'Unknown error'}
function notice(text,type='success'){const el=document.querySelector('#eventNotice');if(el)el.innerHTML=text?`<div class="notice ${type}">${escapeHtml(text)}</div>`:''}
