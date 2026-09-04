import { $, api, cancelPageRender, escapeHtml, state } from './core.js';
import { renderError, renderGuildAuthorizationError, renderInstallNeeded, renderLoading, renderNoServers, renderPage } from './pages.js';
import { initDiagnosticsDrawer, refreshDiagnostics } from './diagnostics-drawer.js';
import { ORBIT_VERSION } from './version.js';

document.querySelectorAll('[data-orbit-version]').forEach(element=>{element.textContent=element.dataset.orbitPrefix==='name'?`Orbit v${ORBIT_VERSION}`:`v${ORBIT_VERSION}`;if(element.classList.contains('version-badge'))element.setAttribute('aria-label',`Orbit version ${ORBIT_VERSION}`)});

const pageFeatures={
  moderation:'protection',shield:'protection',verification:'protection',security:'protection',safety:'protection',logs:'protection',
  creator:'alerts',tickets:'tickets',roles:'roles',scheduler:'scheduler',leveling:'leveling',kofi:'kofi',automation:'automation',social:'social','short-video':'social',
  directory:'creator_community',events:'creator_community',community:'creator_community','community-engagement':'creator_community',applications:'creator_community',health:'creator_community',operations:'creator_community'
};

async function boot(){
  try{
    state.me=await api('/api/me');state.csrf=state.me.csrf;
    $('#login').classList.add('hidden');$('#app').classList.remove('hidden');
    state.guilds=await api('/api/guilds');
    renderServerPicker();wireNavigation();initDiagnosticsDrawer();
    const first=state.guilds[0];if(first)await selectGuild(first.id);else renderNoServers();
  }catch(error){if(error.message!=='401')console.error(error)}
}
function renderServerPicker(){const picker=$('#serverPicker'),search=String($('#serverSearch')?.value||'').trim().toLowerCase(),guilds=(state.guilds||[]).filter(g=>!search||String(g.name||'').toLowerCase().includes(search)||String(g.channel_count??'').includes(search));picker.innerHTML='<option value="">Select a server</option>'+guilds.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}${g.channel_count!=null?` · ${g.channel_count} channels`:''}</option>`).join('');if(state.guildId&&guilds.some(g=>String(g.id)===String(state.guildId)))picker.value=state.guildId;if(!picker.dataset.wired){picker.addEventListener('change',()=>picker.value&&selectGuild(picker.value));picker.dataset.wired='1';}}
async function selectGuild(guildId){
  cancelPageRender();state.guildId=guildId;$('#serverPicker').value=guildId;renderLoading();
  try{
    state.bundle=await api(`/api/guilds/${guildId}/bootstrap`);$('#installTop').href=`/oauth/install?guild_id=${guildId}`;
    applyAdaptiveNavigation();
    if(!state.bundle.onboarding?.completed_at){state.page='onboarding';history.replaceState(null,'','#onboarding');}
    else if(!pageAllowed(state.page)){state.page='overview';history.replaceState(null,'','#overview');}
    setActiveNav();renderPage();refreshDiagnostics(false);
  }catch(error){state.bundle=null;if(error.message==='bot_not_in_guild')renderInstallNeeded(error.payload?.install_url||`/oauth/install?guild_id=${guildId}`);else renderGuildAuthorizationError(error);}
}

async function refreshGuildData(){
  const guildId=state.guildId,button=$('#refreshGuildData');
  if(!guildId||!button)return;
  button.disabled=true;button.textContent='Refreshing…';
  try{
    const fresh=await api(`/api/guilds/${guildId}/bootstrap?refresh=${Date.now()}`,{cache:'no-store'});
    if(state.guildId!==guildId)return;
    state.bundle=fresh;applyAdaptiveNavigation();setActiveNav();renderPage();
  }catch(error){
    if(state.guildId===guildId)$('#content').insertAdjacentHTML('afterbegin',`<div class="notice error">Could not refresh Discord data: ${escapeHtml(error.payload?.detail||error.message||'Unknown error')}.</div>`);
  }finally{if(button.isConnected){button.disabled=false;button.textContent='Refresh Discord data';}}
}
function enabledFeatures(){return new Set((state.bundle?.features||[]).filter(x=>Number(x.enabled)===1).map(x=>x.feature_key));}
function pageAllowed(page){if(page==='channel-manager')return Boolean(state.bundle?.guild?.owner);if(['overview','settings','features','onboarding','diagnostics'].includes(page))return true;if(page==='bugs')return Boolean(state.me?.operator);if(page==='connections'){const enabled=enabledFeatures();return enabled.has('alerts')||enabled.has('social')}const feature=pageFeatures[page];return !feature||enabledFeatures().has(feature);}
function applyAdaptiveNavigation(){
  const enabled=enabledFeatures();
  document.querySelectorAll('[data-feature]').forEach(el=>{const needs=String(el.dataset.feature||'').split(/\s+/).filter(Boolean);el.classList.toggle('hidden',!needs.some(key=>enabled.has(key)))});
  document.querySelectorAll('.nav-section').forEach(section=>{let next=section.nextElementSibling,visible=false;while(next&&!next.classList.contains('nav-section')){if(next.classList.contains('nav-link')&&!next.classList.contains('hidden'))visible=true;next=next.nextElementSibling;}section.classList.toggle('hidden',!visible)});
  const bug=$('[data-page="bugs"]');if(bug)bug.classList.toggle('hidden',!state.me?.operator);
  const manager=$('[data-page="channel-manager"]');if(manager)manager.classList.toggle('hidden',!state.bundle?.guild?.owner);
}
function wireNavigation(){
  document.addEventListener('click',event=>{const link=event.target.closest('[data-page]');if(!link)return;event.preventDefault();const page=link.dataset.page;if(!pageAllowed(page)||page===state.page)return;cancelPageRender();state.page=page;history.replaceState(null,'',`#${state.page}`);setActiveNav();showPageTransition(page);$('#sidebar').classList.remove('open');requestAnimationFrame(()=>requestAnimationFrame(()=>{if(state.page===page)renderPage()}));});
  $('#menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  $('#refreshGuildData').addEventListener('click',refreshGuildData);
  $('#serverSearch').addEventListener('input',renderServerPicker);
  $('#loadServerChannelCounts').addEventListener('click',loadServerChannelCounts);
  window.addEventListener('orbit-features-changed',()=>{applyAdaptiveNavigation();setActiveNav()});
  const hash=location.hash.slice(1);if(hash)state.page=hash;setActiveNav();
}
async function loadServerChannelCounts(){const button=$('#loadServerChannelCounts'),status=$('#serverSearchStatus');if(!button)return;button.disabled=true;button.textContent='Loading counts…';if(status)status.textContent='Checking channel counts…';try{state.guilds=await api('/api/guilds?include_channel_counts=1',{cache:'no-store'});renderServerPicker();const large=state.guilds.filter(g=>Number(g.channel_count||0)>=50).length;if(status)status.textContent=`${large} server${large===1?'':'s'} have 50+ channels.`;}catch(error){if(status)status.textContent=error.payload?.detail||`Could not load channel counts (${error.message}).`;}finally{button.disabled=false;button.textContent='Find large servers';}}
function setActiveNav(){document.querySelectorAll('[data-page]').forEach(link=>link.classList.toggle('active',link.dataset.page===state.page))}
function showPageTransition(page){const label=page.split('-').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');$('#content').innerHTML=`<div class="page-transition" role="status" aria-live="polite"><span class="orbit-loader" aria-hidden="true"></span><strong>Loading ${escapeHtml(label)}…</strong><span class="loading-line"></span><span class="loading-line short"></span></div>`}
boot();
