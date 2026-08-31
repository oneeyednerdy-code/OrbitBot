import type { Env } from '../../types';
import { addRole, removeRole } from '../../discord/client';
import { audit } from '../../repositories/audit';

export async function handleRoleInteraction(env: Env, interaction: any): Promise<any|null> {
  if(interaction.type!==3)return null;
  const custom=String(interaction.data?.custom_id||''); const userId=interaction.member?.user?.id; const guildId=interaction.guild_id;
  if(!userId||!guildId)return null;
  if(custom.startsWith('orbit_role:')){
    const [,panelId,roleId]=custom.split(':'); if(!panelId||!roleId)return null;
    const item=await env.DB.prepare('SELECT i.role_id FROM role_panel_items i JOIN role_panels p ON p.id=i.panel_id WHERE p.guild_id=? AND p.id=? AND i.role_id=? AND p.enabled=1').bind(guildId,Number(panelId),roleId).first(); if(!item)return response('This role option is no longer active.');
    const has=interaction.member.roles?.includes(roleId); const r=has?await removeRole(env,guildId,userId,roleId):await addRole(env,guildId,userId,roleId); if(r.ok)await audit(env,guildId,userId,has?'self_role_removed':'self_role_added',{role_id:roleId,panel_id:Number(panelId)}); return response(r.ok?`${has?'Removed':'Added'} <@&${roleId}>.`:'Orbit could not update that role.');
  }
  if(custom.startsWith('orbit_roles:')){
    const panelId=Number(custom.split(':')[1]);const allowed=(await env.DB.prepare('SELECT i.role_id FROM role_panel_items i JOIN role_panels p ON p.id=i.panel_id WHERE p.guild_id=? AND p.id=? AND p.enabled=1').bind(guildId,panelId).all<any>()).results.map(x=>x.role_id);if(!allowed.length)return response('This role panel is no longer active.');
    const selected=new Set<string>(interaction.data.values||[]);for(const roleId of allowed){const has=interaction.member.roles?.includes(roleId);if(selected.has(roleId)&&!has)await addRole(env,guildId,userId,roleId);else if(!selected.has(roleId)&&has)await removeRole(env,guildId,userId,roleId);}await audit(env,guildId,userId,'self_roles_updated',{panel_id:panelId,selected:[...selected]});return response('Your roles were updated.');
  }
  return null;
}
function response(content:string){return {type:4,data:{content,flags:64}};}
