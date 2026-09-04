import type { Env } from '../../types';
import { json } from '../../http/responses';
import { loadGuildResources, validateChannelIds, validateRoleIds } from '../../discord/guild-resources';
import { audit } from '../../repositories/audit';
import { addManualXp } from './service';

export async function levelingApi(request:Request,env:Env,guildId:string,actorId:string):Promise<Response>{
  if(request.method==='GET'){
    const [config,leaders,rewards]=await Promise.all([
      env.DB.prepare('SELECT * FROM leveling_configs WHERE guild_id=?').bind(guildId).first(),
      env.DB.prepare('SELECT user_id,username,xp,level,updated_at FROM xp_members WHERE guild_id=? ORDER BY xp DESC LIMIT 100').bind(guildId).all(),
      env.DB.prepare('SELECT id,guild_id,level,role_id,remove_previous FROM level_rewards WHERE guild_id=? ORDER BY level,id').bind(guildId).all(),
    ]);
    return json({config:config??{},leaders:leaders.results,rewards:rewards.results});
  }
  if(request.method==='DELETE'){
    const id=positiveInteger(new URL(request.url).searchParams.get('id'),0);
    if(!id)return json({error:'invalid_reward',detail:'Choose an existing role reward to delete.'},400);
    const existing=await env.DB.prepare('SELECT id,level,role_id FROM level_rewards WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
    if(!existing)return json({error:'reward_not_found',detail:'That role reward no longer exists.'},404);
    await env.DB.prepare('DELETE FROM level_rewards WHERE id=? AND guild_id=?').bind(id,guildId).run();
    await audit(env,guildId,null,'level_reward_deleted',{reward_id:id,level:existing.level,role_id:existing.role_id},actorId);
    return json({ok:true});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);

  const body=await request.json<any>();
  const operation=String(body.operation||'save_settings');
  if(operation==='save_settings')return saveSettings(env,guildId,actorId,body);
  if(operation==='create_reward')return createReward(env,guildId,actorId,body);
  if(operation==='update_reward')return updateReward(env,guildId,actorId,body);
  if(operation==='add_xp')return grantManualXp(env,guildId,actorId,body);
  return json({error:'invalid_operation',detail:'Choose a supported leveling operation.'},400);
}

async function grantManualXp(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  const userId=String(body.user_id||'').trim();
  const amount=Number(body.amount);
  if(!/^\d{15,22}$/.test(userId)||!Number.isInteger(amount)||amount<1||amount>1000000)return json({error:'invalid_xp_adjustment',detail:'Enter a valid Discord user ID and an XP amount from 1 to 1,000,000.'},400);
  const username=String(body.username||'').trim().slice(0,100)||null;
  const result=await addManualXp(env,guildId,userId,amount,username,actorId);
  return json({ok:true,user_id:userId,xp:result.xp,level:result.level,previous_level:result.previousLevel});
}

async function saveSettings(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  const resources=await loadGuildResources(env,guildId,{channels:Boolean(body.announce_channel_id)});
  if(!resources.ok)return json(resources,resources.status);
  const badChannel=validateChannelIds(resources,[body.announce_channel_id].filter(Boolean));
  if(badChannel)return json(badChannel,badChannel.status);
  const xpMin=Math.max(1,positiveInteger(body.xp_min,15));
  const xpMax=Math.max(xpMin,positiveInteger(body.xp_max,25));
  const cooldown=Math.max(10,positiveInteger(body.cooldown_seconds,60));
  const now=Date.now();
  await env.DB.prepare(`INSERT INTO leveling_configs(guild_id,enabled,xp_min,xp_max,cooldown_seconds,announce_channel_id,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id) DO UPDATE SET enabled=excluded.enabled,xp_min=excluded.xp_min,xp_max=excluded.xp_max,cooldown_seconds=excluded.cooldown_seconds,announce_channel_id=excluded.announce_channel_id,updated_at=excluded.updated_at`).bind(guildId,body.enabled?1:0,xpMin,xpMax,cooldown,body.announce_channel_id||null,now).run();
  await audit(env,guildId,null,'leveling_settings_updated',{enabled:Boolean(body.enabled),xp_min:xpMin,xp_max:xpMax,cooldown_seconds:cooldown,announce_channel_id:body.announce_channel_id||null},actorId);
  return json({ok:true});
}

async function createReward(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  const level=positiveInteger(body.level,0),roleId=String(body.role_id||'');
  const invalid=await validateReward(env,guildId,level,roleId);
  if(invalid)return invalid;
  const duplicate=await env.DB.prepare('SELECT id FROM level_rewards WHERE guild_id=? AND level=? AND role_id=?').bind(guildId,level,roleId).first<any>();
  if(duplicate)return json({error:'duplicate_reward',detail:'That role is already awarded at this level.'},409);
  const inserted=await env.DB.prepare('INSERT INTO level_rewards(guild_id,level,role_id,remove_previous) VALUES(?,?,?,?)').bind(guildId,level,roleId,body.remove_previous?1:0).run();
  const id=Number(inserted.meta.last_row_id);
  await audit(env,guildId,null,'level_reward_created',{reward_id:id,level,role_id:roleId,remove_previous:Boolean(body.remove_previous)},actorId);
  return json({ok:true,reward_id:id});
}

async function updateReward(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  const id=positiveInteger(body.reward_id,0),level=positiveInteger(body.level,0),roleId=String(body.role_id||'');
  if(!id)return json({error:'invalid_reward',detail:'Choose an existing role reward to edit.'},400);
  const existing=await env.DB.prepare('SELECT id FROM level_rewards WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();
  if(!existing)return json({error:'reward_not_found',detail:'That role reward no longer exists.'},404);
  const invalid=await validateReward(env,guildId,level,roleId);
  if(invalid)return invalid;
  const duplicate=await env.DB.prepare('SELECT id FROM level_rewards WHERE guild_id=? AND level=? AND role_id=? AND id<>?').bind(guildId,level,roleId,id).first<any>();
  if(duplicate)return json({error:'duplicate_reward',detail:'That role is already awarded at this level.'},409);
  await env.DB.prepare('UPDATE level_rewards SET level=?,role_id=?,remove_previous=? WHERE id=? AND guild_id=?').bind(level,roleId,body.remove_previous?1:0,id,guildId).run();
  await audit(env,guildId,null,'level_reward_updated',{reward_id:id,level,role_id:roleId,remove_previous:Boolean(body.remove_previous)},actorId);
  return json({ok:true,reward_id:id});
}

async function validateReward(env:Env,guildId:string,level:number,roleId:string):Promise<Response|null>{
  if(!level||!roleId)return json({error:'invalid_reward',detail:'Choose a positive level and an assignable role.'},400);
  const resources=await loadGuildResources(env,guildId,{roles:true});
  if(!resources.ok)return json(resources,resources.status);
  const badRole=validateRoleIds(resources,[roleId],{assignable:true});
  return badRole?json(badRole,badRole.status):null;
}

function positiveInteger(value:unknown,fallback:number):number{
  const number=Number(value);
  return Number.isInteger(number)&&number>0?number:fallback;
}
