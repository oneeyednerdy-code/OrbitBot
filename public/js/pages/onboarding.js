import { api, escapeHtml, state } from '../core.js';

const choices=[
  ['protection','Protect My Community','Moderation, verification, Honeypot, Shield Mode and security tools.'],
  ['alerts','Creator Alerts','Twitch and YouTube live, upload and VOD notifications.'],
  ['tickets','Support Tickets','Private support channels with categories and staff routing.'],
  ['roles','Roles','Buttons, dropdowns, reaction roles and automatic roles.'],
  ['scheduler','Schedule Posts','Announcements, recurring messages and reminders.'],
  ['leveling','Levels & Engagement','XP, levels, leaderboards and role rewards.'],
  ['kofi','Ko-fi','Supporter notifications, goals and milestones.'],
  ['automation','Automations','Trigger → Conditions → Actions without extra bots.'],
  ['social','Socials','Connect social publishing and social-to-Discord workflows.'],
  ['creator_community','Creator Community','Creator directory, events, applications and community tools.'],
];

export function renderOnboarding(manage=false){
  const existing=new Set((state.bundle?.features||[]).filter(x=>Number(x.enabled)===1).map(x=>x.feature_key));
  document.querySelector('#content').innerHTML=`
    <div class="eyebrow">${manage?'Manage Features':'Welcome to Orbit'}</div>
    <h1 class="page-title">${manage?'Choose what Orbit shows you.':'What do you want Orbit to help with?'}</h1>
    <p class="page-intro">Pick only what you need. You can add or hide features later without deleting their configuration.</p>
    <div class="feature-choice-grid">${choices.map(([key,title,copy])=>`<label class="feature-choice"><input type="checkbox" value="${key}" ${existing.has(key)?'checked':''}><span class="feature-check">✓</span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></label>`).join('')}</div>
    <div class="card onboarding-actions"><div><strong>You can change this anytime.</strong><div class="small">Turning a feature off hides it. Orbit keeps its existing settings and data.</div></div><div class="button-row"><button id="chooseAll" class="btn secondary" type="button">I Want Everything</button><button id="saveNeeds" class="btn" type="button">${manage?'Save Features':'Continue'}</button></div></div>
    <div id="onboardingNotice"></div>`;
  document.querySelector('#chooseAll').onclick=()=>document.querySelectorAll('.feature-choice input').forEach(x=>x.checked=true);
  document.querySelector('#saveNeeds').onclick=saveNeeds;
}

async function saveNeeds(){
  const features=[...document.querySelectorAll('.feature-choice input:checked')].map(x=>x.value);
  const notice=document.querySelector('#onboardingNotice');
  try{
    const saved=await api(`/api/guilds/${state.guildId}/onboarding`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({features})});
    state.bundle.onboarding={...(state.bundle.onboarding||{}),community_type:saved.community_type||state.bundle.onboarding?.community_type||'custom',completed_at:Date.now()};
    state.bundle.features=choices.map(([feature_key])=>({feature_key,enabled:features.includes(feature_key)?1:0}));
    window.dispatchEvent(new CustomEvent('orbit-features-changed'));
    state.page='overview';history.replaceState(null,'','#overview');
    const {renderPage}=await import('../pages.js');renderPage();
  }catch(e){notice.innerHTML=`<div class="notice error">Could not save your Orbit setup: ${escapeHtml(e.message)}</div>`}
}
