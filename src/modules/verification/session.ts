import type { Env } from '../../types';
import { randomToken, sha256 } from '../../security/crypto';

export async function createVerificationSession(env:Env,guildId:string,userId:string):Promise<string>{
  if(!/^\d+$/.test(guildId)||!/^\d+$/.test(userId))throw new Error('invalid_verification_identity');
  const token=randomToken();
  const hash=await sha256(token);
  const now=Date.now();
  await env.DB.prepare('INSERT INTO verification_sessions(token_hash,guild_id,user_id,expires_at,completed_at,created_at) VALUES(?,?,?,?,?,?)').bind(hash,guildId,userId,now+15*60_000,null,now).run();
  return `${env.APP_ORIGIN}/verify/${token}`;
}
