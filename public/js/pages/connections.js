import { api, escapeHtml, state } from '../core.js';

export async function renderConnections(){
  const content=document.querySelector('#content');
  content.innerHTML='<div class="eyebrow">Creator</div><h1 class="page-title">Connections</h1><p class="page-intro">Authorize creator and publishing accounts without pasting raw token JSON into Orbit.</p><div class="skeleton"></div>';
  try{
    const data=await api(`/api/guilds/${state.guildId}/connections`);
    const byPlatform=new Map(data.connections.map(x=>[x.platform,x]));
    const cards=[
      oauthCard('twitch','Twitch','Live alerts, channel identity and creator tools.',data.availability.twitch,byPlatform.get('twitch')),
      oauthCard('youtube','YouTube','Livestream and channel identity tools.',data.availability.youtube,byPlatform.get('youtube')),
      oauthCard('threads','Threads','Publish text posts through the Threads API.',data.availability.threads,byPlatform.get('threads')),
      blueskyCard(data.availability.bluesky,byPlatform.get('bluesky')),
      mastodonCard(data.availability.mastodon,byPlatform.get('mastodon')),
    ];
    content.innerHTML=`<div class="eyebrow">Creator</div><h1 class="page-title">Connections</h1><p class="page-intro">Orbit stores authorization server-side using encrypted credentials. Disconnecting an account also disables its social publishing connection.</p><div id="connectionNotice"></div><div class="grid">${cards.join('')}</div>`;
    content.querySelectorAll('[data-disconnect]').forEach(btn=>btn.onclick=()=>disconnect(btn.dataset.disconnect));
    const blueskyBtn=document.querySelector('#connectBluesky');
    if(blueskyBtn)blueskyBtn.onclick=connectBluesky;
    const mastodonBtn=document.querySelector('#connectMastodon');
    if(mastodonBtn)mastodonBtn.onclick=connectMastodon;
    const qs=new URLSearchParams(location.search);
    if(qs.get('connected'))notice(`Connected ${qs.get('connected')}.`,'success');
    if(qs.get('connection_error'))notice(`Connection failed: ${qs.get('connection_error')}.`,'error');
  }catch(e){content.innerHTML+=`<div class="notice error">Could not load connections: ${escapeHtml(e.message)}</div>`}
}

function oauthCard(key,label,copy,available,conn){
  const status=conn?`<span class="status active">● Connected</span>`:available?`<span class="status roadmap">○ Ready to connect</span>`:`<span class="status foundation">○ Operator setup required</span>`;
  const action=conn?`<div class="button-row"><button class="btn danger" data-disconnect="${conn.id}">Disconnect</button></div>`:available?`<a class="btn" href="/connections/${key}/start?guild_id=${encodeURIComponent(state.guildId)}">Authorize ${label}</a>`:`<button class="btn secondary" disabled>Not configured</button>`;
  return `<section class="card span-6 connection-card"><div class="connection-head"><div><h2>${label}</h2><p>${escapeHtml(copy)}</p></div>${status}</div>${conn?connected(conn):''}${action}</section>`;
}

function blueskyCard(available,conn){
  const status=conn?`<span class="status active">● Connected</span>`:available?`<span class="status roadmap">○ Ready to connect</span>`:`<span class="status foundation">○ Encryption key required</span>`;
  const action=conn?`<button class="btn danger" data-disconnect="${conn.id}">Disconnect</button>`:available?`<div class="form-grid"><label>Bluesky handle<input id="bskyHandle" autocomplete="username" placeholder="name.bsky.social"></label><label>App password<input id="bskyPassword" type="password" autocomplete="off" placeholder="xxxx-xxxx-xxxx-xxxx"></label></div><p class="small">Use a Bluesky app password, not your account password. Orbit validates it with Bluesky before storing it encrypted.</p><button id="connectBluesky" class="btn">Authorize Bluesky</button>`:`<button class="btn secondary" disabled>Not configured</button>`;
  return `<section class="card span-6 connection-card"><div class="connection-head"><div><h2>Bluesky</h2><p>Authorize publishing with a revocable Bluesky app password.</p></div>${status}</div>${conn?connected(conn):''}${action}</section>`;
}

function mastodonCard(available,conn){
  const status=conn?`<span class="status active">● Connected</span>`:available?`<span class="status roadmap">○ Ready to connect</span>`:`<span class="status foundation">○ Encryption key required</span>`;
  const action=conn?`<button class="btn danger" data-disconnect="${conn.id}">Disconnect</button>`:available?`<div class="field"><label>Mastodon instance<input id="mastodonInstance" placeholder="mastodon.social"></label></div><p class="small">Orbit registers an OAuth app with your instance, then sends you there to approve publishing access.</p><button id="connectMastodon" class="btn">Authorize Mastodon</button>`:`<button class="btn secondary" disabled>Not configured</button>`;
  return `<section class="card span-6 connection-card"><div class="connection-head"><div><h2>Mastodon</h2><p>OAuth authorization for any compatible Mastodon instance.</p></div>${status}</div>${conn?connected(conn):''}${action}</section>`;
}

function connected(conn){return `<div class="connected-account"><strong>${escapeHtml(conn.account_label)}</strong><div class="small">Connection healthy · ${escapeHtml(conn.status)}</div></div>`}

async function connectBluesky(){
  const identifier=document.querySelector('#bskyHandle')?.value.trim();
  const app_password=document.querySelector('#bskyPassword')?.value.trim();
  if(!identifier||!app_password)return notice('Enter your Bluesky handle and app password.','error');
  try{
    await api(`/api/guilds/${state.guildId}/connections`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({op:'connect_bluesky',identifier,app_password})});
    renderConnections();
  }catch(e){notice(`Bluesky authorization failed: ${friendly(e)}.`,'error')}
}

function connectMastodon(){
  const instance=document.querySelector('#mastodonInstance')?.value.trim();
  if(!instance)return notice('Enter your Mastodon instance first.','error');
  location.href=`/connections/mastodon/start?guild_id=${encodeURIComponent(state.guildId)}&instance=${encodeURIComponent(instance)}`;
}

async function disconnect(id){
  if(!confirm('Disconnect this account from Orbit?'))return;
  try{await api(`/api/guilds/${state.guildId}/connections?id=${encodeURIComponent(id)}`,{method:'DELETE'});renderConnections();}
  catch(e){notice(`Disconnect failed: ${friendly(e)}.`,'error')}
}
function friendly(e){return e?.payload?.detail||e?.message||'Unknown error'}
function notice(text,type='success'){const el=document.querySelector('#connectionNotice');if(el)el.innerHTML=`<div class="notice ${type}">${escapeHtml(text)}</div>`}
