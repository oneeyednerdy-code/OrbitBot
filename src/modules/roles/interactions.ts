import type { Env } from '../../types';
import { addRole, removeRole } from '../../discord/client';
import { audit } from '../../repositories/audit';
import { recordSystemError } from '../../repositories/errors';

export async function handleRoleInteraction(env: Env, interaction: any): Promise<any|null> {
  if(interaction.type!==3)return null;
  const custom=String(interaction.data?.custom_id||''); const userId=interaction.member?.user?.id; const guildId=interaction.guild_id;
  if(!userId||!guildId)return null;
  if(custom.startsWith('orbit_role:')){
    const [,panelId,roleId]=custom.split(':'); if(!panelId||!roleId)return null;
    const item=await env.DB.prepare('SELECT i.role_id FROM role_panel_items i JOIN role_panels p ON p.id=i.panel_id WHERE p.guild_id=? AND p.id=? AND i.role_id=? AND p.enabled=1').bind(guildId,Number(panelId),roleId).first(); if(!item)return response('This role option is no longer active.');
    const has=interaction.member.roles?.includes(roleId);const result=has?await removeRole(env,guildId,userId,roleId):await addRole(env,guildId,userId,roleId);
    if(result.ok){await audit(env,guildId,userId,has?'self_role_removed':'self_role_added',{role_id:roleId,panel_id:Number(panelId)});return response(`${has?'Removed':'Added'} <@&${roleId}>.`);}
    let detail:any={};try{detail=await result.clone().json<any>()}catch{}
    const requestId=await recordSystemError(env,guildId,'/guilds/:guild/members/:member/roles/:role',has?'DELETE':'PUT',result.status,'self_role_update_failed',{code:detail?.code||null,message:detail?.message||'Discord rejected the role update.',role_id:roleId,panel_id:Number(panelId)});
    return response(`Orbit could not update that role. Reference ${requestId}.`);
  }
  if(custom.startsWith('orbit_roles:')){
    const panelId=Number(custom.split(':')[1]);const allowed=(await env.DB.prepare('SELECT i.role_id FROM role_panel_items i JOIN role_panels p ON p.id=i.panel_id WHERE p.guild_id=? AND p.id=? AND p.enabled=1').bind(guildId,panelId).all<any>()).results.map(x=>String(x.role_id));if(!allowed.length)return response('This role panel is no longer active.');
    const allowedSet=new Set(allowed),selected=new Set<string>((interaction.data.values||[]).map(String).filter((roleId:string)=>allowedSet.has(roleId))),changed:string[]=[],failed:string[]=[];
    for(const roleId of allowed){
      const has=interaction.member.roles?.includes(roleId),shouldHave=selected.has(roleId);
      if(has===shouldHave)continue;
      const result=shouldHave?await addRole(env,guildId,userId,roleId):await removeRole(env,guildId,userId,roleId);
      if(result.ok)changed.push(roleId);else failed.push(roleId);
    }
    await audit(env,guildId,userId,failed.length?'self_roles_partially_updated':'self_roles_updated',{panel_id:panelId,selected:[...selected],changed_count:changed.length,failed_count:failed.length});
    if(failed.length){const requestId=await recordSystemError(env,guildId,'/guilds/:guild/members/:member/roles/:role','MULTI',400,'self_role_selection_partial',{panel_id:panelId,failed_count:failed.length,changed_count:changed.length});return response(`Orbit updated ${changed.length} role${changed.length===1?'':'s'}, but ${failed.length} failed. Reference ${requestId}.`);}
    return response(changed.length?'Your roles were updated.':'Your roles were already up to date.');
  }
  return null;
}
function response(content:string){return {type:4,data:{content,flags:64}};}
