import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../types';
import { recordMessageAndCheckHoneypot } from '../modules/moderation/honeypot';
import { awardMessageXp } from '../modules/leveling/service';
import { runAutomations } from '../modules/automation/engine';
import { handleCommunityMessage, handleMemberAdd, handleMemberRemove } from '../modules/community/service';
import { shieldMemberJoin, shieldMessage } from '../modules/shield/service';

export class DiscordGateway extends DurableObject<Env> {
  private socket: WebSocket | null = null;
  private heartbeatMs = 45000;
  private sequence: number | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  async fetch(request: Request): Promise<Response> { const url=new URL(request.url); if(url.pathname==='/start'){await this.start();return Response.json({ok:true});} return new Response('not found',{status:404}); }
  async start(): Promise<{ok:boolean}> { if (!this.socket || this.socket.readyState > 1) this.connect(); return {ok:true}; }
  private connect(){
    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json'); this.socket=ws;
    ws.addEventListener('message',(event)=>this.onMessage(String(event.data)));
    ws.addEventListener('close',()=>this.reconnect()); ws.addEventListener('error',()=>this.reconnect());
  }
  private async onMessage(raw:string){
    const packet=JSON.parse(raw); if(packet.s!=null)this.sequence=packet.s;
    if(packet.op===10){this.heartbeatMs=packet.d.heartbeat_interval;this.scheduleHeartbeat();this.identify();return;}
    if(packet.op===7){this.reconnect();return;}
    if(packet.op===0 && packet.t==='MESSAGE_CREATE'){await shieldMessage(this.env,packet.d);await recordMessageAndCheckHoneypot(this.env,packet.d);await awardMessageXp(this.env,packet.d);await handleCommunityMessage(this.env,packet.d);await runAutomations(this.env,packet.d.guild_id,'message_create',{user_id:packet.d.author?.id,channel_id:packet.d.channel_id,role_ids:packet.d.member?.roles||[]});}
    if(packet.op===0 && packet.t==='GUILD_MEMBER_ADD'){await shieldMemberJoin(this.env,packet.d);await handleMemberAdd(this.env,packet.d);}
    if(packet.op===0 && packet.t==='GUILD_MEMBER_REMOVE') await handleMemberRemove(this.env,packet.d);
  }
  private identify(){this.send({op:2,d:{token:this.env.DISCORD_BOT_TOKEN,intents:33283,properties:{os:'linux',browser:'orbit',device:'orbit'}}});}
  private scheduleHeartbeat(){if(this.heartbeatTimer)clearTimeout(this.heartbeatTimer);this.heartbeatTimer=setTimeout(()=>{this.send({op:1,d:this.sequence});this.scheduleHeartbeat();},this.heartbeatMs);}
  private send(value:any){if(this.socket?.readyState===1)this.socket.send(JSON.stringify(value));}
  private reconnect(){if(this.heartbeatTimer)clearTimeout(this.heartbeatTimer);this.heartbeatTimer=null;try{this.socket?.close();}catch{}this.socket=null;setTimeout(()=>this.connect(),5000);}
}
