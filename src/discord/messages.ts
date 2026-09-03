import type { Env } from '../types';
import { discord } from './client';

export type SafeMessage = Record<string,unknown> & { content?: string; pingRoleIds?: string[]; pingUserIds?: string[] };

export function safeMessageBody(input:SafeMessage):Record<string,unknown>{
  const {pingRoleIds=[],pingUserIds=[],...payload}=input;
  return {...payload,allowed_mentions:{parse:[],roles:[...new Set(pingRoleIds.map(String))].slice(0,100),users:[...new Set(pingUserIds.map(String))].slice(0,100),replied_user:false}};
}

export function sendDiscordMessage(env:Env,channelId:string,input:SafeMessage):Promise<Response>{
  return discord(env,`/channels/${channelId}/messages`,{method:'POST',body:JSON.stringify(safeMessageBody(input))});
}
