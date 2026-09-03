import { $, api, escapeHtml, state } from './core.js';
import { renderError, renderGuildAuthorizationError, renderInstallNeeded, renderLoading, renderNoServers, renderPage } from './pages.js';
import { initDiagnosticsDrawer, refreshDiagnostics } from './diagnostics-drawer.js';

const pageFeatures={
  moderation:'protection',shield:'protection',verification:'protection',security:'protection',safety:'protection',logs:'protection',
  creator:'alerts',tickets:'tickets',roles:'roles',scheduler:'scheduler',leveling:'leveling',kofi:'kofi',automation:'automation',social:'social',
  directory:'creator_community',events:'creator_community',community:'creator_community',applications:'creator_community',health:'creator_community',operations:'creator_community'
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
function renderServerPicker(){const picker=$('#serverPicker');picker.innerHTML='<option value="">Select a server</option>'+state.guilds.map(g=>`<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');picker.addEventListener('change',()=>picker.value&&selectGuild(picker.value));}
async function selectGuild(guildId){
  state.guildId=guildId;$('#serverPicker').value=guildId;renderLoading();
  try{
    state.bundle=await api(`/api/guilds/${guildId}/bootstrap`);$('#installTop').href=`/oauth/install?guild_id=${guildId}`;
    applyAdaptiveNavigation();
    if(!state.bundle.onboarding?.completed_at){state.page='onboarding';history.replaceState(null,'','#onboarding');}
    else if(!pageAllowed(state.page)){state.page='overview';history.replaceState(null,'','#overview');}
    setActiveNav();renderPage();refreshDiagnostics(false);
  }catch(error){state.bundle=null;if(error.message==='bot_not_in_guild')renderInstallNeeded(error.payload?.install_url||`/oauth/install?guild_id=${guildId}`);else renderGuildAuthorizationError(error);}
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
  document.addEventListener('click',event=>{const link=event.target.closest('[data-page]');if(!link)return;event.preventDefault();const page=link.dataset.page;if(!pageAllowed(page)||page===state.page)return;state.page=page;history.replaceState(null,'',`#${state.page}`);setActiveNav();showPageTransition(page);$('#sidebar').classList.remove('open');requestAnimationFrame(()=>requestAnimationFrame(()=>{if(state.page===page)renderPage()}));});
  $('#menu').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
  window.addEventListener('orbit-features-changed',()=>{applyAdaptiveNavigation();setActiveNav()});
  const hash=location.hash.slice(1);if(hash)state.page=hash;setActiveNav();
}
function setActiveNav(){document.querySelectorAll('[data-page]').forEach(link=>link.classList.toggle('active',link.dataset.page===state.page))}
function showPageTransition(page){const label=page.split('-').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');$('#content').innerHTML=`<div class="page-transition" role="status" aria-live="polite"><span class="orbit-loader" aria-hidden="true"></span><strong>Loading ${escapeHtml(label)}…</strong><span class="loading-line"></span><span class="loading-line short"></span></div>`}
boot();
