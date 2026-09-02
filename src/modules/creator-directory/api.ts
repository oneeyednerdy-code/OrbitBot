import type { Env } from '../../types';
import { json } from '../../http/responses';

export async function creatorDirectoryApi(request:Request,env:Env,guildId:string):Promise<Response>{
 if(request.method==='GET'){
  const result=await env.DB.prepare('SELECT * FROM creator_directory WHERE guild_id=? ORDER BY display_name').bind(guildId).all();
  return json({creators:result.results});
 }
 if(request.method==='POST'){
  const body=await request.json<any>();
  if(!body.display_name)return json({error:'display_name_required'},400);
  const now=Date.now();
  if(body.id){
   const id=Number(body.id);
   await env.DB.prepare('UPDATE creator_directory SET discord_user_id=?,display_name=?,twitch_name=?,youtube_channel_id=?,bio=?,live_role_id=?,approved=?,enabled=?,updated_at=? WHERE id=? AND guild_id=?').bind(body.discord_user_id||null,body.display_name,body.twitch_name||null,body.youtube_channel_id||null,body.bio||null,body.live_role_id||null,body.approved===false?0:1,body.enabled===false?0:1,now,id,guildId).run();
   await env.DB.prepare('DELETE FROM creator_role_alert_states WHERE directory_creator_id=? AND guild_id=?').bind(id,guildId).run();
   return json({ok:true});
  }
  const result=await env.DB.prepare('INSERT INTO creator_directory(guild_id,discord_user_id,display_name,twitch_name,youtube_channel_id,bio,live_role_id,approved,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,1,?,?)').bind(guildId,body.discord_user_id||null,body.display_name,body.twitch_name||null,body.youtube_channel_id||null,body.bio||null,body.live_role_id||null,now,now).run();
  return json({ok:true,id:Number(result.meta.last_row_id)});
 }
 if(request.method==='DELETE'){
  const id=Number(new URL(request.url).searchParams.get('id'));
  await env.DB.prepare('DELETE FROM creator_role_alert_states WHERE directory_creator_id=? AND guild_id=?').bind(id,guildId).run();
  await env.DB.prepare('DELETE FROM creator_directory WHERE id=? AND guild_id=?').bind(id,guildId).run();
  return json({ok:true});
 }
 return json({error:'method_not_allowed'},405);
}
