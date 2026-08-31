import { $, api, escapeHtml, state, title, usableRoles } from '../core.js';

export function renderLoading(){$('#content').innerHTML='<div class="eyebrow">ORBIT</div><h1 class="page-title">Loading server</h1><div class="grid"><div class="skeleton span-4"></div><div class="skeleton span-4"></div><div class="skeleton span-4"></div></div>'}


export function renderError(message){$('#content').innerHTML=`<div class="eyebrow">SYSTEM</div><h1 class="page-title">Orbit needs attention</h1><div class="notice error">${message}</div>`}


export function renderNoServers(){$('#content').innerHTML='<div class="eyebrow">WELCOME</div><h1 class="page-title">Add your first server</h1><div class="empty"><h2>No manageable servers found</h2><p>Install Orbit on a Discord server where you are the owner or have Manage Server permission, then refresh the dashboard.</p><a class="btn" href="/oauth/install">Add Orbit to Discord</a></div>'}


export function renderInstallNeeded(url){
  const guild=state.guilds.find(item=>item.id===state.guildId);
  $('#content').innerHTML=`<div class="eyebrow">SERVER SETUP</div><h1 class="page-title">Install Orbit</h1><p class="page-intro">You can manage ${escapeHtml(guild?.name||'this server')}, but Orbit is not currently installed there.</p><div class="empty"><h2>Orbit needs access to this server</h2><p>Discord will let you select the server and review the exact permissions before anything is added.</p><a class="btn" href="${escapeHtml(url)}">Add Orbit to ${escapeHtml(guild?.name||'Server')}</a></div>`;
}
