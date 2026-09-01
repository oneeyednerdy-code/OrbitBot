import { $, api, escapeHtml, state, title, usableRoles } from '../core.js';

export function renderLoading(){$('#content').innerHTML='<div class="eyebrow">ORBIT</div><h1 class="page-title">Loading server</h1><div class="grid"><div class="skeleton span-4"></div><div class="skeleton span-4"></div><div class="skeleton span-4"></div></div>'}


export function renderError(message){$('#content').innerHTML=`<div class="eyebrow">SYSTEM</div><h1 class="page-title">Orbit needs attention</h1><div class="notice error">${message}</div>`}


export function renderNoServers(){$('#content').innerHTML='<div class="eyebrow">WELCOME</div><h1 class="page-title">Add your first server</h1><div class="empty"><h2>No manageable servers found</h2><p>Install Orbit on a Discord server where you are the owner or have Manage Server permission, then refresh the dashboard.</p><a class="btn" href="/oauth/install">Add Orbit to Discord</a></div>'}


export function renderInstallNeeded(url){
  const guild=state.guilds.find(item=>item.id===state.guildId);
  $('#content').innerHTML=`<div class="eyebrow">SERVER SETUP</div><h1 class="page-title">Install Orbit</h1><p class="page-intro">You can manage ${escapeHtml(guild?.name||'this server')}, but Orbit is not currently installed there.</p><div class="empty"><h2>Orbit needs access to this server</h2><p>Discord will let you select the server and review the exact permissions before anything is added.</p><a class="btn" href="${escapeHtml(url)}">Add Orbit to ${escapeHtml(guild?.name||'Server')}</a></div>`;
}

export function renderGuildAuthorizationError(error){
  const code=error?.message||'authorization_failed';
  const detail=error?.payload?.detail||'';
  if(code==='discord_reauth_required'||code==='unauthorized'){
    $('#content').innerHTML=`<div class="eyebrow">DISCORD AUTHORIZATION</div><h1 class="page-title">Reconnect Discord</h1><div class="notice error">${escapeHtml(detail||'Your Discord dashboard authorization expired or was revoked.')}</div><div class="card"><p>Orbit has not removed itself from the server. Reconnect your Discord account to refresh the dashboard authorization.</p><a class="btn" href="/oauth/login">Reconnect Discord</a></div>`;
    return;
  }
  if(code==='discord_rate_limited'){
    const seconds=Math.max(1,Math.ceil(Number(error?.payload?.retry_after||1)));
    $('#content').innerHTML=`<div class="eyebrow">DISCORD API</div><h1 class="page-title">Discord is rate limiting Orbit</h1><div class="notice warning">${escapeHtml(detail||'Discord temporarily rate-limited the authorization check.')}</div><p class="page-intro">Try this server again in about ${seconds} second${seconds===1?'':'s'}. Orbit will not treat this as a permission failure.</p>`;
    return;
  }
  if(code==='missing_manage_server_permission'||code==='guild_not_available'){
    $('#content').innerHTML=`<div class="eyebrow">SERVER ACCESS</div><h1 class="page-title">Server access changed</h1><div class="notice error">${escapeHtml(detail||'The connected Discord account can no longer manage this server.')}</div><p class="page-intro">Orbit requires server ownership or Discord's Manage Server permission for dashboard access.</p>`;
    return;
  }
  renderError(`Could not load this server (${escapeHtml(code)}). ${detail?escapeHtml(detail):''}`);
}
