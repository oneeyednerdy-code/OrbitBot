import type { Env } from '../../types';
import { addRole, removeRole } from '../../discord/client';
import { sendDiscordMessage } from '../../discord/messages';
import { audit } from '../../repositories/audit';
import { recordSystemError } from '../../repositories/errors';

type LevelReward={role_id:string;level:number;remove_previous:number};
type LevelingConfig={enabled?:number;announce_channel_id?:string|null};

export async function awardMessageXp(env:Env,event:any):Promise<void>{
  if(!event.guild_id||!event.author?.id||event.author.bot)return;
  const config=await env.DB.prepare('SELECT enabled,xp_min,xp_max,cooldown_seconds,announce_channel_id FROM leveling_configs WHERE guild_id=?').bind(event.guild_id).first<any>();
  if(!config?.enabled)return;

  const now=Date.now(),cutoff=now-Number(config.cooldown_seconds||60)*1000,min=Math.min(config.xp_min,config.xp_max),max=Math.max(config.xp_min,config.xp_max),gain=min+Math.floor(Math.random()*(max-min+1));
  const username=String(event.author.global_name||event.author.username||'').trim().slice(0,100)||null;
  const awarded=await env.DB.prepare(`INSERT INTO xp_members(guild_id,user_id,username,xp,level,last_xp_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET username=COALESCE(excluded.username,xp_members.username),xp=xp_members.xp+excluded.xp,last_xp_at=excluded.last_xp_at,updated_at=excluded.updated_at WHERE xp_members.last_xp_at IS NULL OR xp_members.last_xp_at<=?`)
    .bind(event.guild_id,event.author.id,username,gain,0,now,now,cutoff).run();
  if(!awarded.meta.changes)return;
  await applyLevelUp(env,event.guild_id,event.author.id,config,event.author,null);
}

export async function addManualXp(env:Env,guildId:string,userId:string,amount:number,username:string|null,actorId:string):Promise<{xp:number;level:number;previousLevel:number}> {
  const config=await env.DB.prepare('SELECT enabled,announce_channel_id FROM leveling_configs WHERE guild_id=?').bind(guildId).first<LevelingConfig>()||{};
  const existing=await env.DB.prepare('SELECT xp,level,username FROM xp_members WHERE guild_id=? AND user_id=?').bind(guildId,userId).first<any>();
  const previousLevel=Number(existing?.level||0);
  await env.DB.prepare(`INSERT INTO xp_members(guild_id,user_id,username,xp,level,last_xp_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET username=COALESCE(excluded.username,xp_members.username),xp=xp_members.xp+excluded.xp,updated_at=excluded.updated_at`)
    .bind(guildId,userId,username,amount,0,null,Date.now()).run();
  const row=await env.DB.prepare('SELECT xp,level,username FROM xp_members WHERE guild_id=? AND user_id=?').bind(guildId,userId).first<any>();
  await applyLevelUp(env,guildId,userId,config,{id:userId,username:username||row?.username||null},actorId);
  const updated=await env.DB.prepare('SELECT xp,level FROM xp_members WHERE guild_id=? AND user_id=?').bind(guildId,userId).first<any>();
  await audit(env,guildId,userId,'leveling_xp_added',{amount,xp:Number(updated?.xp||0),level:Number(updated?.level||0)},actorId);
  return {xp:Number(updated?.xp||0),level:Number(updated?.level||0),previousLevel};
}

async function applyLevelUp(env:Env,guildId:string,userId:string,config:LevelingConfig,author:any,actorId:string|null):Promise<void>{
  const now=Date.now();
  const row=await env.DB.prepare('SELECT xp,level FROM xp_members WHERE guild_id=? AND user_id=?').bind(guildId,userId).first<any>();
  const xp=Number(row?.xp||0),previousLevel=Number(row?.level||0),level=Math.floor(Math.sqrt(xp/100));
  if(level<=previousLevel)return;
  const claimed=await env.DB.prepare('UPDATE xp_members SET level=?,updated_at=? WHERE guild_id=? AND user_id=? AND level<?').bind(level,now,guildId,userId,level).run();
  if(!claimed.meta.changes)return;

  const rewards=(await env.DB.prepare('SELECT role_id,level,remove_previous FROM level_rewards WHERE guild_id=? AND level<=? ORDER BY level,id').bind(guildId,level).all<LevelReward>()).results;
  const newlyReached=rewards.filter(reward=>Number(reward.level)>previousLevel),failures:Array<{role_id:string;operation:string;status:number}>=[];
  for(const reward of newlyReached){
    const added=await addRole(env,guildId,userId,reward.role_id);
    if(!added.ok){failures.push({role_id:reward.role_id,operation:'add',status:added.status});continue;}
    if(reward.remove_previous){
      for(const previous of rewards.filter(candidate=>Number(candidate.level)<Number(reward.level)&&candidate.role_id!==reward.role_id)){
        const removed=await removeRole(env,guildId,userId,previous.role_id);
        if(!removed.ok&&removed.status!==404)failures.push({role_id:previous.role_id,operation:'remove',status:removed.status});
      }
    }
  }

  await audit(env,guildId,userId,'level_up',{level,xp,rewards_reached:newlyReached.length,reward_failures:failures.length},actorId||userId);
  if(failures.length)await recordSystemError(env,guildId,'/gateway/leveling/rewards','EVENT',400,'level_reward_assignment_partial',{user_id:userId,level,failures});
  if(config.announce_channel_id){
    const announced=await sendDiscordMessage(env,String(config.announce_channel_id),{content:`🎉 <@${userId}> reached **Level ${level}**!`,pingUserIds:[String(userId)]});
    if(!announced.ok){let detail:any={};try{detail=await announced.clone().json<any>()}catch{}await recordSystemError(env,guildId,'/channels/:channel/messages','POST',announced.status,'level_announcement_failed',{message:detail?.message||'Discord rejected the level announcement.',code:detail?.code||null,level,user_id:userId});}
  }
}
