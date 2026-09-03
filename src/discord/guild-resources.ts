import type { Env } from '../types';
import { discord } from './client';

export type GuildChannel = { id: string; guild_id?: string; type: number; name?: string; parent_id?: string | null };
export type GuildRole = { id: string; name?: string; managed?: boolean; mentionable?: boolean; position?: number };
export type ResourceFailure = { ok: false; status: number; error: string; detail: string };
export type ResourceSuccess = { ok: true; channels: Map<string,GuildChannel>; roles: Map<string,GuildRole> };

export async function loadGuildResources(env:Env,guildId:string,options:{channels?:boolean;roles?:boolean}={}):Promise<ResourceSuccess|ResourceFailure>{
  const wantChannels=options.channels!==false;
  const wantRoles=Boolean(options.roles);
  const [channelsResponse,rolesResponse]=await Promise.all([
    wantChannels?discord(env,`/guilds/${guildId}/channels`):Promise.resolve(null),
    wantRoles?discord(env,`/guilds/${guildId}/roles`):Promise.resolve(null),
  ]);
  if(channelsResponse&&!channelsResponse.ok)return {ok:false,status:502,error:'discord_channels_unavailable',detail:`Discord returned HTTP ${channelsResponse.status} while validating server channels.`};
  if(rolesResponse&&!rolesResponse.ok)return {ok:false,status:502,error:'discord_roles_unavailable',detail:`Discord returned HTTP ${rolesResponse.status} while validating server roles.`};
  const channels=channelsResponse?await channelsResponse.json<GuildChannel[]>():[];
  const roles=rolesResponse?await rolesResponse.json<GuildRole[]>():[];
  return {ok:true,channels:new Map(channels.map(item=>[String(item.id),item])),roles:new Map(roles.map(item=>[String(item.id),item]))};
}

export function validateChannelIds(resources:ResourceSuccess,ids:unknown[],allowedTypes:number[]=[0,5]):ResourceFailure|null{
  for(const raw of ids){
    const id=String(raw||'');
    const channel=resources.channels.get(id);
    if(!/^\d+$/.test(id)||!channel||!allowedTypes.includes(Number(channel.type)))return {ok:false,status:400,error:'invalid_guild_channel',detail:'A selected channel is missing, has the wrong type, or does not belong to this server.'};
  }
  return null;
}

export function validateRoleIds(resources:ResourceSuccess,ids:unknown[],options:{mentionable?:boolean;assignable?:boolean}={}):ResourceFailure|null{
  for(const raw of ids){
    const id=String(raw||'');
    const role=resources.roles.get(id);
    if(!/^\d+$/.test(id)||!role||role.name==='@everyone'||(options.assignable&&role.managed)||(options.mentionable&&(!role.mentionable||role.managed)))return {ok:false,status:400,error:'invalid_guild_role',detail:options.mentionable?'A selected ping role is missing, managed, not Mentionable, or belongs to another server.':'A selected role is missing, managed, or belongs to another server.'};
  }
  return null;
}

export async function isGuildMessageChannel(env:Env,guildId:string,channelId:string):Promise<boolean>{
  if(!/^\d+$/.test(channelId))return false;
  const response=await discord(env,`/channels/${channelId}`);if(!response.ok)return false;
  const channel=await response.json<GuildChannel>();return String(channel.guild_id)===guildId&&[0,5].includes(Number(channel.type));
}
