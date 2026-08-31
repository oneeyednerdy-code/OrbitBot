import { $, api, escapeHtml, state, title, usableRoles } from '../core.js';

export function renderSettings(){
  const guild=state.bundle.guild;
  $('#content').innerHTML=`<div class="eyebrow">SYSTEM</div><h1 class="page-title">Settings</h1><p class="page-intro">Server-level Orbit configuration and installation controls.</p><div class="grid"><section class="card span-8"><h2>${escapeHtml(guild.name)}</h2><p class="page-intro">Orbit is installed and connected to this server.</p><div class="button-row"><a class="btn secondary" href="/oauth/install?guild_id=${guild.id}">Review / Reinstall Orbit</a></div></section><aside class="card span-4"><div class="maker">NERDSPACE LABS</div><h2>Orbit</h2><p class="small">A Nerdspace Labs product with its own control-center identity.</p></aside></div>`;
}
