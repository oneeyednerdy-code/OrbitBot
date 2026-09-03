import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { audit } from '../../repositories/audit';
import { recordSystemError } from '../../repositories/errors';

export async function dispatchChannelManagerJob(env:Env,jobId:number):Promise<void>{
  const now=Date.now();const claim=await env.DB.prepare("UPDATE channel_manager_jobs SET status='running',started_at=COALESCE(started_at,?),lease_expires_at=?,heartbeat_at=?,attempt_count=attempt_count+1 WHERE id=? AND (status='queued' OR (status='running' AND COALESCE(lease_expires_at,0)<=?))").bind(now,now+5*60_000,now,jobId,now).run();if(!claim.meta.changes)return;
  const job=await env.DB.prepare('SELECT * FROM channel_manager_jobs WHERE id=?').bind(jobId).first<any>();if(!job)return;
  if(Number(job.attempt_count||0)>1)await env.DB.prepare("UPDATE channel_manager_job_items SET status='failed',error_code='uncertain_after_worker_retry',completed_at=? WHERE job_id=? AND status='running'").bind(now,jobId).run();
  let failures:any[]=[];
  try{
    const request=parse(job.request_json);
    if(job.operation==='delete')failures=await runDelete(env,job,request);
    else if(job.operation==='create')failures=await runCreate(env,job,request);
    else if(job.operation==='restore')failures=await runRestore(env,job,request);
    else if(job.operation==='reorder')failures=await runReorder(env,job,request);
    else throw new Error(`unsupported_operation_${job.operation}`);
  }catch(error:any){failures.push({error:'job_exception',detail:String(error?.message||error).slice(0,500)});}
  const counts=await env.DB.prepare("SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) failed FROM channel_manager_job_items WHERE job_id=?").bind(jobId).first<any>();
  const completed=Number(counts?.completed||0),failed=Number(counts?.failed||0),status=(failed||failures.length)?(completed?'partial':'failed'):'completed';
  await env.DB.prepare('UPDATE channel_manager_jobs SET status=?,completed_items=?,failed_items=?,error_summary_json=?,lease_expires_at=NULL,heartbeat_at=?,finished_at=? WHERE id=?').bind(status,completed,failed,JSON.stringify(failures.slice(0,100)),Date.now(),Date.now(),jobId).run();
  await audit(env,job.guild_id,null,`channel_manager_${job.operation}_${status}`,{job_id:jobId,completed,failed,reason:job.reason},job.created_by);
}

async function runDelete(env:Env,job:any,request:any):Promise<any[]>{
  const failures:any[]=[];const rows=await items(env,job.id);const ordered=[...rows].sort((a,b)=>(Number(a.channel_type)===4?1:0)-(Number(b.channel_type)===4?1:0));
  for(const row of ordered){
    await startItem(env,job.id,row.id);
    const response=await discord(env,`/channels/${row.channel_id}`,{method:'DELETE',headers:auditHeader(job.reason)});
    if(response.ok||response.status===404)await finishItem(env,row.id,'completed',null,null,row.channel_id);
    else failures.push(await failItem(env,job,row,response,'channel_delete_failed'));
  }
  return failures;
}

async function runCreate(env:Env,job:any,request:any):Promise<any[]>{
  const failures:any[]=[];const rows=await items(env,job.id);const categories=rows.filter(row=>Number(row.channel_type)===4),channels=rows.filter(row=>Number(row.channel_type)!==4),tempMap=new Map<string,string>();
  for(const row of [...categories,...channels]){
    await startItem(env,job.id,row.id);
    const item=parse(row.payload_json),parentId=item.parent_temp_id?tempMap.get(String(item.parent_temp_id)):item.parent_id||null;
    if(item.parent_temp_id&&!parentId){failures.push(await failLocal(env,row,'parent_create_failed','The new parent category was not created.'));continue;}
    const payload:any={name:item.name,type:Number(row.channel_type)};
    if(parentId)payload.parent_id=parentId;if(Number(row.channel_type)===0){if(item.topic)payload.topic=item.topic;payload.nsfw=Boolean(item.nsfw);payload.rate_limit_per_user=Number(item.slowmode||0)}if(Number(row.channel_type)===2){payload.bitrate=Number(item.bitrate||64000);payload.user_limit=Number(item.user_limit||0)}
    const response=await discord(env,`/guilds/${job.guild_id}/channels`,{method:'POST',headers:auditHeader(job.reason),body:JSON.stringify(payload)});
    if(response.ok){const created=await response.json<any>();row.new_channel_id=String(created.id);if(item.temp_id)tempMap.set(String(item.temp_id),String(created.id));await finishItem(env,row.id,'completed',null,null,String(created.id));}
    else failures.push(await failItem(env,job,row,response,'channel_create_failed'));
  }
  return failures;
}

async function runReorder(env:Env,job:any,request:any):Promise<any[]>{
  const rows=await items(env,job.id),payload=(Array.isArray(request.items)?request.items:[]).map((item:any)=>({id:String(item.id),position:Number(item.position||0),parent_id:item.parent_id?String(item.parent_id):null,lock_permissions:false}));
  for(const row of rows)await startItem(env,job.id,row.id);
  const response=await discord(env,`/guilds/${job.guild_id}/channels`,{method:'PATCH',headers:auditHeader(job.reason),body:JSON.stringify(payload)});
  if(response.ok){for(const row of rows)await finishItem(env,row.id,'completed',null,null,row.channel_id);return []}
  let detail:any={};try{detail=await response.clone().json<any>()}catch{}const requestId=await recordSystemError(env,job.guild_id,'channel-manager/discord','PATCH',response.status,'channel_reorder_failed',detail),failure={error:'channel_reorder_failed',detail:detail?.message||`Discord returned HTTP ${response.status}.`,discord_code:detail?.code||null,request_id:requestId};for(const row of rows)await finishItem(env,row.id,'failed',String(detail?.code||'channel_reorder_failed'),requestId,null);return [failure];
}

async function runRestore(env:Env,job:any,request:any):Promise<any[]>{
  const failures:any[]=[];const rows=await items(env,job.id),oldToNew=new Map<string,string>();
  const createRows=rows.filter(row=>!parse(row.payload_json).reorder_only),reorderRows=rows.filter(row=>parse(row.payload_json).reorder_only);
  const ordered=[...createRows].sort((a,b)=>(Number(a.channel_type)===4?-1:0)-(Number(b.channel_type)===4?-1:0));
  for(const row of ordered){
    await startItem(env,job.id,row.id);
    const item=parse(row.payload_json),mappedParent=item.parent_id?oldToNew.get(String(item.parent_id)):null;
    if(item.parent_id&&!mappedParent&&createRows.some(candidate=>candidate.channel_id===item.parent_id)){failures.push(await failLocal(env,row,'parent_restore_failed','The parent category could not be restored.'));continue;}
    const payload=restorePayload(item,mappedParent||item.parent_id||null);
    const response=await discord(env,`/guilds/${job.guild_id}/channels`,{method:'POST',headers:auditHeader(job.reason),body:JSON.stringify(payload)});
    if(response.ok){const created=await response.json<any>();row.new_channel_id=String(created.id);oldToNew.set(String(item.id),String(created.id));await finishItem(env,row.id,'completed',null,null,String(created.id));}
    else failures.push(await failItem(env,job,row,response,'channel_restore_failed'));
  }
  const positionRows=[...createRows.filter(row=>row.new_channel_id),...reorderRows],positions:any[]=[],positionItemRows:any[]=[];
  for(const row of reorderRows)await startItem(env,job.id,row.id);
  for(const row of positionRows){const item=parse(row.payload_json),parentWasRecreated=item.parent_id&&createRows.some(candidate=>candidate.channel_id===String(item.parent_id)),parentId=item.parent_id?(oldToNew.get(String(item.parent_id))||String(item.parent_id)):null;if(parentWasRecreated&&!oldToNew.has(String(item.parent_id))){if(item.reorder_only)failures.push(await failLocal(env,row,'parent_restore_failed','The restored parent category is unavailable.'));continue;}positions.push({id:row.new_channel_id||String(item.id),position:Number(item.position||0),parent_id:Number(item.type)===4?null:parentId,lock_permissions:false});positionItemRows.push(row)}
  if(positions.length){const response=await discord(env,`/guilds/${job.guild_id}/channels`,{method:'PATCH',headers:auditHeader(job.reason),body:JSON.stringify(positions)});if(response.ok){for(const row of reorderRows)if(positionItemRows.includes(row))await finishItem(env,row.id,'completed',null,null,row.channel_id)}else{let detail:any={};try{detail=await response.clone().json<any>()}catch{}const requestId=await recordSystemError(env,job.guild_id,'channel-manager/discord','PATCH',response.status,'channel_restore_order_failed',detail);failures.push({error:'channel_restore_order_failed',detail:detail?.message||`Discord returned HTTP ${response.status}.`,request_id:requestId});for(const row of reorderRows)if(positionItemRows.includes(row))await finishItem(env,row.id,'failed',String(detail?.code||'channel_restore_order_failed'),requestId,null)}}
  return failures;
}

function restorePayload(item:any,parentId:string|null):any{
  const payload:any={name:String(item.name||'restored-channel').slice(0,100),type:Number(item.type),permission_overwrites:Array.isArray(item.permission_overwrites)?item.permission_overwrites:[]};if(parentId)payload.parent_id=parentId;
  if([0,5,15,16].includes(payload.type)){if(item.topic!=null)payload.topic=String(item.topic).slice(0,1024);payload.nsfw=Boolean(item.nsfw);payload.rate_limit_per_user=Number(item.rate_limit_per_user||0)}
  if([2,13].includes(payload.type)){if(item.bitrate)payload.bitrate=Number(item.bitrate);payload.user_limit=Number(item.user_limit||0)}return payload;
}

async function items(env:Env,jobId:number):Promise<any[]>{return (await env.DB.prepare("SELECT * FROM channel_manager_job_items WHERE job_id=? AND status='queued' ORDER BY sort_order,id").bind(jobId).all<any>()).results}
async function startItem(env:Env,jobId:number,id:number){const now=Date.now();await env.DB.batch([env.DB.prepare("UPDATE channel_manager_job_items SET status='running',attempt_count=attempt_count+1 WHERE id=? AND job_id=? AND status='queued'").bind(id,jobId),env.DB.prepare('UPDATE channel_manager_jobs SET heartbeat_at=?,lease_expires_at=? WHERE id=?').bind(now,now+5*60_000,jobId)])}
async function finishItem(env:Env,id:number,status:string,error:string|null,requestId:string|null,newId:string|null){await env.DB.prepare('UPDATE channel_manager_job_items SET status=?,error_code=?,request_id=?,new_channel_id=?,completed_at=? WHERE id=?').bind(status,error,requestId,newId,Date.now(),id).run()}
async function failLocal(env:Env,row:any,code:string,detail:string):Promise<any>{await finishItem(env,row.id,'failed',code,null,null);return {item_id:row.id,name:row.name,error:code,detail}}
async function failItem(env:Env,job:any,row:any,response:Response,code:string):Promise<any>{let detail:any={};try{detail=await response.clone().json<any>()}catch{}const requestId=await recordSystemError(env,job.guild_id,'channel-manager/discord',job.operation==='delete'?'DELETE':'POST',response.status,code,detail);await finishItem(env,row.id,'failed',String(detail?.code||code),requestId,null);return {item_id:row.id,name:row.name,status:response.status,discord_code:detail?.code||null,error:code,detail:detail?.message||`Discord returned HTTP ${response.status}.`,request_id:requestId}}
function auditHeader(reason:string):Headers{const headers=new Headers();headers.set('X-Audit-Log-Reason',encodeURIComponent(`Orbit Channel Manager: ${String(reason||'Owner operation').slice(0,400)}`));return headers}
function parse(raw:string):any{try{return JSON.parse(raw)}catch{return {}}}
