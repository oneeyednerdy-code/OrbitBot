import { api, escapeHtml, state } from '../core.js';

export async function renderConnections(){
  const content=document.querySelector('#content');
  content.innerHTML='<div class="eyebrow">Creator</div><h1 class="page-title">Connections</h1><p class="page-intro">Connect accounts by signing in with the service. Server owners never need to paste access tokens or API keys.</p><div class="skeleton"></div>';
  try{
    const data=await api(`/api/guilds/${state.guildId}/connections`);
    const byPlatform=new Map(data.connections.map(x=>[x.platform,x]));
    const cards=[platformCard('twitch','Twitch','Live alerts, channel identity and creator tools.',data.availability.twitch,byPlatform.get('twitch')),platformCard('youtube','YouTube','Livestream and channel identity tools.',data.availability.youtube,byPlatform.get('youtube'))];
    content.innerHTML=`<div class="eyebrow">Creator</div><h1 class="page-title">Connections</h1><p class="page-intro">Connect accounts by signing in with the service. Orbit stores authorization server-side and never asks users for passwords.</p><div class="grid">${cards.join('')}</div><div class="card" style="margin-top:16px"><h2>More platforms</h2><p class="page-intro">Threads, Instagram, TikTok, Bluesky and Mastodon appear here only when the Orbit operator has completed the required platform API setup. Orbit will not show a fake working connection.</p></div>`;
    content.querySelectorAll('[data-disconnect]').forEach(btn=>btn.onclick=()=>disconnect(btn.dataset.disconnect));
  }catch(e){content.innerHTML+=`<div class="notice error">Could not load connections: ${escapeHtml(e.message)}</div>`}
}

function platformCard(key,label,copy,available,conn){
  const status=conn?`<span class="status active">● Connected</span>`:available?`<span class="status roadmap">○ Ready to connect</span>`:`<span class="status foundation">○ Operator setup required</span>`;
  const action=conn?`<div class="button-row"><button class="btn danger" data-disconnect="${conn.id}">Disconnect</button></div>`:available?`<a class="btn" href="/connections/${key}/start?guild_id=${encodeURIComponent(state.guildId)}">Connect ${label}</a>`:`<button class="btn secondary" disabled>Not available yet</button>`;
  return `<section class="card span-6 connection-card"><div class="connection-head"><div><h2>${label}</h2><p>${escapeHtml(copy)}</p></div>${status}</div>${conn?`<div class="connected-account"><strong>${escapeHtml(conn.account_label)}</strong><div class="small">Connection healthy · ${escapeHtml(conn.status)}</div></div>`:''}${action}</section>`;
}

async function disconnect(id){
  if(!confirm('Disconnect this account from Orbit?'))return;
  await api(`/api/guilds/${state.guildId}/connections?id=${encodeURIComponent(id)}`,{method:'DELETE'});renderConnections();
}
