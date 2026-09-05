import type { Env } from '../../types';
import { discord } from '../../discord/client';
import { json } from '../../http/responses';
import { audit } from '../../repositories/audit';
import { createActionJob, listActionJobs } from '../../repositories/action-jobs';

const STRUCTURAL_TYPES = new Set([0, 2, 4, 5, 13, 15, 16]);
type Channel = { id:string; name:string; type:number; parent_id:string|null; position:number; topic?:string|null; nsfw?:boolean; rate_limit_per_user?:number; bitrate?:number; user_limit?:number; permission_overwrites?:any[] };

export async function channelManagerApi(request:Request,env:Env,guildId:string,actorId:string,guild:any):Promise<Response>{
  if(guild?.owner!==true)return json({error:'owner_only',detail:'Only the Discord server owner can use Channel Manager.'},403);
  if(request.method==='GET')return loadManager(env,guildId);
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  const body=await request.json<any>();
  if(body.op==='preview-delete')return previewDelete(env,guildId,body);
  if(body.op==='execute-delete')return executeDelete(env,guildId,actorId,body);
  if(body.op==='preview-create')return previewCreate(env,guildId,body);
  if(body.op==='execute-create')return executeCreate(env,guildId,actorId,body);
  if(body.op==='preview-edit')return previewEdit(env,guildId,body);
  if(body.op==='execute-edit')return executeEdit(env,guildId,actorId,body);
  if(body.op==='preview-reorder')return previewReorder(env,guildId,body);
  if(body.op==='execute-reorder')return executeReorder(env,guildId,actorId,body);
  if(body.op==='create-backup')return createManualBackup(env,guildId,actorId,body);
  if(body.op==='preview-restore')return previewRestore(env,guildId,body);
  if(body.op==='execute-restore')return executeRestore(env,guildId,actorId,body);
  return json({error:'invalid_operation'},400);
}

async function loadManager(env:Env,guildId:string):Promise<Response>{
  const [channels,guild,dependencies,jobs,snapshots]=await Promise.all([
    getChannels(env,guildId),getDiscordGuild(env,guildId),scanDependencies(env,guildId),
    env.DB.prepare('SELECT id,operation,status,total_items,completed_items,failed_items,reason,snapshot_id,action_job_id,created_at,started_at,finished_at,error_summary_json FROM channel_manager_jobs WHERE guild_id=? ORDER BY created_at DESC LIMIT 20').bind(guildId).all<any>(),
    env.DB.prepare('SELECT id,name,source,created_at,expires_at,target_ids_json FROM channel_manager_snapshots WHERE guild_id=? ORDER BY created_at DESC LIMIT 20').bind(guildId).all<any>(),
  ]);
  const protectedIds=[guild.rules_channel_id,guild.public_updates_channel_id,guild.system_channel_id,guild.afk_channel_id].filter(Boolean).map(String);
  return json({owner_only:true,channels,dependencies,protected_ids:protectedIds,system_channels:{rules:guild.rules_channel_id||null,updates:guild.public_updates_channel_id||null,system:guild.system_channel_id||null,afk:guild.afk_channel_id||null},jobs:jobs.results.map(parseJob),action_jobs:await safeActionJobs(env,guildId),snapshots:snapshots.results.map((row:any)=>({...row,target_count:safeArray(row.target_ids_json).length}))});
}

async function previewDelete(env:Env,guildId:string,body:any):Promise<Response>{
  const channels=await getChannels(env,guildId),guild=await getDiscordGuild(env,guildId),dependencies=await scanDependencies(env,guildId),manualIds=parseSnowflakeList(body.manual_channel_ids),manual=await resolveManualDeleteTargets(env,guildId,manualIds,channels);
  if(manual.unresolved.length)return json({error:'manual_channel_unavailable',detail:`Orbit cannot validate ${manual.unresolved.join(', ')} as channels in this server. Refresh Channel Manager or create an Orbit backup while the channel is visible, then try again.`,unresolved_channel_ids:manual.unresolved},400);
  const inventory=[...channels,...manual.targets];
  const requested=new Set<string>([...(Array.isArray(body.channel_ids)?body.channel_ids:[]),...(Array.isArray(body.category_ids)?body.category_ids:[]),...manualIds]);
  const categories=new Set(inventory.filter(c=>c.type===4&&requested.has(c.id)).map(c=>c.id));
  if(body.cascade_categories)for(const channel of inventory)if(channel.parent_id&&categories.has(channel.parent_id))requested.add(channel.id);
  const system=new Set([guild.rules_channel_id,guild.public_updates_channel_id,guild.system_channel_id,guild.afk_channel_id].filter(Boolean).map(String));
  const targets=inventory.filter(c=>requested.has(c.id));
  if(!targets.length)return json({error:'nothing_selected',detail:'Select at least one channel or category.'},400);
  const blocked=targets.filter(c=>system.has(c.id)||(dependencies[c.id]||[]).some((item:any)=>item.blocking)).map(c=>({id:c.id,name:c.name,type:c.type,reasons:[...(system.has(c.id)?['Discord system/community channel']:[]),...(dependencies[c.id]||[]).map((item:any)=>item.label)]}));
  const deletable=targets.filter(c=>!blocked.some(b=>b.id===c.id)).sort((a,b)=>(a.type===4?1:0)-(b.type===4?1:0));
  const fingerprint=await digest(deletable.map(c=>c.id).sort().join(','));
  return json({targets:deletable,blocked,manual_targets:manual.targets.map(channel=>channel.id),cascade_categories:Boolean(body.cascade_categories),fingerprint,confirmation_phrase:`DELETE ${deletable.length} CHANNELS`,warning:'Discord permanently deletes every selected channel and its message history. Orbit backups restore channel structure and permissions only—never deleted messages, threads, attachments, webhooks, or original channel IDs.'});
}

async function executeDelete(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  if(!env.JOBS)return json({error:'queue_unavailable',detail:'The Orbit job queue is not configured, so destructive channel work is disabled.'},503);
  if(!await botCanManageChannels(env,guildId))return json({error:'missing_manage_channels',detail:'Orbit needs Manage Channels in Discord before it can delete channels. Reauthorize or update the bot role, then preview again.'},403);
  const previewResponse=await previewDelete(env,guildId,body);const preview=await previewResponse.clone().json<any>();
  if(!previewResponse.ok)return previewResponse;
  if(preview.blocked?.length)return json({error:'blocked_dependencies',detail:'Move or disable every listed Orbit/system dependency before deleting.',blocked:preview.blocked},409);
  if(body.fingerprint!==preview.fingerprint)return json({error:'preview_changed',detail:'The server structure changed. Preview the deletion again.'},409);
  if(String(body.confirmation||'')!==preview.confirmation_phrase)return json({error:'confirmation_required',detail:`Type ${preview.confirmation_phrase} exactly.`},400);
  if(!body.acknowledged)return json({error:'acknowledgement_required',detail:'Confirm that you reviewed the preview and intend to update Discord.'},400);
  const reason=String(body.reason||'').trim().slice(0,512);if(reason.length<3)return json({error:'reason_required',detail:'Enter a deletion reason for the audit log.'},400);
  const active=await activeJob(env,guildId);if(active)return json({error:'operation_in_progress',detail:`Channel Manager job #${active.id} is already ${active.status}. Wait for it to finish before sending another change.`},409);
  const snapshotId=await snapshot(env,guildId,actorId,`Before delete: ${reason.slice(0,80)}`,'automatic-delete',preview.targets.map((c:any)=>c.id));
  const request={targets:preview.targets,cascade_categories:Boolean(body.cascade_categories)};
  const jobId=await createJob(env,guildId,actorId,'delete',reason,snapshotId,request,preview.targets);
  await env.JOBS.send({type:'channel-manager-execute',jobId});
  await audit(env,guildId,null,'channel_manager_delete_queued',{job_id:jobId,snapshot_id:snapshotId,count:preview.targets.length,reason},actorId);
  return json({ok:true,job_id:jobId,snapshot_id:snapshotId,status:'queued'});
}

async function previewCreate(env:Env,guildId:string,body:any):Promise<Response>{
  const channels=await getChannels(env,guildId);let items=Array.isArray(body.items)?body.items.slice(0,100):[];
  items=items.map((raw:any,index:number)=>({temp_id:String(raw.temp_id||`new-${index}`),name:String(raw.name||'').trim(),kind:String(raw.kind||'text'),parent_id:raw.parent_id?String(raw.parent_id):null,parent_temp_id:raw.parent_temp_id?String(raw.parent_temp_id):null,unresolved_parent_name:raw.unresolved_parent_name?String(raw.unresolved_parent_name).slice(0,100):null,position:Number.isFinite(Number(raw.position))?Math.max(0,Number(raw.position)):index,topic:String(raw.topic||'').slice(0,1024),nsfw:Boolean(raw.nsfw),slowmode:Math.max(0,Math.min(21600,Number(raw.slowmode||0))),bitrate:Math.max(8000,Math.min(384000,Number(raw.bitrate||64000))),user_limit:Math.max(0,Math.min(99,Number(raw.user_limit||0)))}));
  const errors:string[]=[];if(!items.length)errors.push('Add at least one category or channel.');
  for(const item of items){if(!item.name||item.name.length>100)errors.push(`Every name must contain 1–100 characters.`);if(!['category','text','voice'].includes(item.kind))errors.push(`${item.name||'Unnamed item'} has an unsupported type.`);if(item.unresolved_parent_name)errors.push(`${item.name||'Unnamed item'} references unknown category ${item.unresolved_parent_name}.`)}
  const newCategories=items.filter((i:any)=>i.kind==='category');
  if(new Set(items.map((item:any)=>item.temp_id)).size!==items.length)errors.push('Every planned item needs a unique draft ID. Refresh the plan and try again.');
  if(new Set(newCategories.map((item:any)=>item.name.toLowerCase())).size!==newCategories.length)errors.push('New category names must be unique so channels cannot be assigned to the wrong category.');
  if(channels.length+items.length>500)errors.push('This plan would exceed Discord’s 500-channel server limit.');
  if(channels.filter(c=>c.type===4).length+newCategories.length>50)errors.push('This plan would exceed Discord’s 50-category limit.');
  const tempIds=new Set(newCategories.map((i:any)=>i.temp_id));for(const item of items)if(item.parent_temp_id&&!tempIds.has(item.parent_temp_id))errors.push(`${item.name} references a new category that is not in this plan.`);
  const existingCategoryIds=new Set(channels.filter(channel=>channel.type===4).map(channel=>channel.id));for(const item of items)if(item.parent_id&&!existingCategoryIds.has(item.parent_id))errors.push(`${item.name} references an existing category that is no longer available.`);
  for(const category of channels.filter(c=>c.type===4)){const planned=items.filter((item:any)=>item.parent_id===category.id).length,current=channels.filter(c=>c.parent_id===category.id).length;if(current+planned>50)errors.push(`${category.name} would exceed Discord’s 50-channel category limit.`)}
  for(const category of newCategories)if(items.filter((item:any)=>item.parent_temp_id===category.temp_id).length>50)errors.push(`${category.name} would exceed Discord’s 50-channel category limit.`);
  items.sort((a:any,b:any)=>{const categoryOrder=(a.kind==='category'?0:1)-(b.kind==='category'?0:1);if(categoryOrder)return categoryOrder;if(a.kind==='category')return a.position-b.position;const parentA=a.parent_temp_id||a.parent_id||'~',parentB=b.parent_temp_id||b.parent_id||'~';return parentA.localeCompare(parentB)||a.position-b.position});
  const fingerprint=await digest(JSON.stringify(items));
  const unresolvedCategories=[...new Set(items.map((item:any)=>item.unresolved_parent_name).filter(Boolean))];
  return json({
    ...(errors.length ? { error:'invalid_create_plan', detail:errors[0] } : {}),
    items,
    errors,
    unresolved_categories:unresolvedCategories,
    recovery:unresolvedCategories.length ? {
      action:'add_missing_categories',
      label:'Add missing categories to this plan',
      categories:unresolvedCategories,
      detail:'Orbit will add these names to the New categories draft and preview again. Nothing is sent to Discord until the owner confirms the validated plan.',
    } : null,
    fingerprint,
    confirmation_phrase:`CREATE ${items.length} CHANNELS`,
    warning:'Orbit will create these items one at a time through Discord and record the result of each item.',
  },errors.length?400:200);
}

async function executeCreate(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  if(!env.JOBS)return json({error:'queue_unavailable',detail:'The Orbit job queue is not configured, so bulk channel work is disabled.'},503);
  if(!await botCanManageChannels(env,guildId))return json({error:'missing_manage_channels',detail:'Orbit needs Manage Channels in Discord before it can create channels.'},403);
  const previewResponse=await previewCreate(env,guildId,body);const preview=await previewResponse.clone().json<any>();if(!previewResponse.ok)return previewResponse;
  if(body.fingerprint!==preview.fingerprint)return json({error:'preview_changed',detail:'The create plan changed. Preview it again.'},409);
  if(String(body.confirmation||'')!==preview.confirmation_phrase)return json({error:'confirmation_required',detail:`Type ${preview.confirmation_phrase} exactly.`},400);
  if(!body.acknowledged)return json({error:'acknowledgement_required',detail:'Confirm that you reviewed the preview and intend to update Discord.'},400);
  const active=await activeJob(env,guildId);if(active)return json({error:'operation_in_progress',detail:`Channel Manager job #${active.id} is already ${active.status}. Wait for it to finish before sending another change.`},409);
  const reason=String(body.reason||'Bulk channel creation').trim().slice(0,512);
  const snapshotId=await snapshot(env,guildId,actorId,`Before create: ${reason.slice(0,80)}`,'automatic-create',[]);
  const jobId=await createJob(env,guildId,actorId,'create',reason,snapshotId,{items:preview.items},preview.items);
  await env.JOBS.send({type:'channel-manager-execute',jobId});await audit(env,guildId,null,'channel_manager_create_queued',{job_id:jobId,snapshot_id:snapshotId,count:preview.items.length,reason},actorId);
  return json({ok:true,job_id:jobId,snapshot_id:snapshotId,status:'queued'});
}

async function previewEdit(env:Env,guildId:string,body:any):Promise<Response>{
  const channels=await getChannels(env,guildId),channelMap=new Map(channels.map(channel=>[channel.id,channel])),raw=Array.isArray(body.items)?body.items.slice(0,100):[],errors:string[]=[],seen=new Set<string>(),items:any[]=[];
  for(const draft of raw){
    const id=String(draft.id||''),current=channelMap.get(id);
    if(!current){errors.push(`Unknown channel or category ${id||'(missing ID)'}.`);continue;}
    if(seen.has(id)){errors.push(`${current.name} appears more than once.`);continue;}seen.add(id);
    const name=String(draft.name??current.name).trim();
    if(!name||name.length>100)errors.push(`${current.name} must have a name from 1–100 characters.`);
    const item:any={...current,id,name,type:current.type,parent_id:current.type===4?null:(draft.parent_id===undefined?current.parent_id:(draft.parent_id?String(draft.parent_id):null)),topic:current.topic??'',nsfw:draft.nsfw===undefined?Boolean(current.nsfw):Boolean(draft.nsfw),rate_limit_per_user:clamp(draft.rate_limit_per_user,0,21600,current.rate_limit_per_user||0),bitrate:clamp(draft.bitrate,8000,384000,current.bitrate||64000),user_limit:clamp(draft.user_limit,0,99,current.user_limit||0)};
    if(item.parent_id){const parent=channelMap.get(item.parent_id);if(!parent||parent.type!==4)errors.push(`${name} must use an existing category from this server.`);if(item.parent_id===id)errors.push(`${name} cannot be its own parent category.`)}
    if([0,5,15,16].includes(current.type)){item.topic=String(draft.topic??current.topic??'').slice(0,1024);item.nsfw=Boolean(draft.nsfw);}
    items.push(item);
  }
  const finalCounts=new Map<string,number>();
  for(const channel of channels.filter(channel=>channel.type!==4&&channel.parent_id))finalCounts.set(String(channel.parent_id),channels.filter(candidate=>candidate.type!==4&&candidate.parent_id===channel.parent_id).length);
  for(const item of items){const before=channelMap.get(item.id)!;if(before.parent_id&&before.parent_id!==item.parent_id)finalCounts.set(before.parent_id,Math.max(0,(finalCounts.get(before.parent_id)||0)-1));if(item.parent_id&&before.parent_id!==item.parent_id)finalCounts.set(item.parent_id,(finalCounts.get(item.parent_id)||0)+1)}
  for(const [categoryId,count] of finalCounts)if(count>50)errors.push(`${channelMap.get(categoryId)?.name||'That category'} would exceed Discord’s 50-channel category limit.`);
  const changes=items.filter(item=>{const before=channelMap.get(item.id)!;return before.name!==item.name||before.parent_id!==item.parent_id||([0,5,15,16].includes(before.type)&&((before.topic||'')!==item.topic||Boolean(before.nsfw)!==Boolean(item.nsfw)||Number(before.rate_limit_per_user||0)!==Number(item.rate_limit_per_user||0)))||([2,13].includes(before.type)&&(Number(before.bitrate||0)!==Number(item.bitrate||0)||Number(before.user_limit||0)!==Number(item.user_limit||0)))});
  if(!raw.length)errors.push('Select at least one existing category or channel to edit.');
  if(!changes.length&&!errors.length)errors.push('Nothing changed. Adjust a name, category, or channel setting first.');
  if(errors.length)return json({error:'invalid_edit_plan',detail:errors[0],errors,items,changes},400);
  const fingerprint=await digest(JSON.stringify(changes.map(editSignature)));
  return json({items,changes,fingerprint,confirmation_phrase:`EDIT ${changes.length} CHANNELS`,warning:'Orbit will apply these edits one at a time through Discord and record each result. A structural backup is captured first.'});
}

async function executeEdit(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  if(!env.JOBS)return json({error:'queue_unavailable',detail:'The Orbit job queue is not configured, so channel edits are disabled.'},503);
  if(!await botCanManageChannels(env,guildId))return json({error:'missing_manage_channels',detail:'Orbit needs Manage Channels in Discord before it can edit channels.'},403);
  const previewResponse=await previewEdit(env,guildId,body),preview=await previewResponse.clone().json<any>();if(!previewResponse.ok)return previewResponse;
  if(body.fingerprint!==preview.fingerprint)return json({error:'preview_changed',detail:'The Discord structure changed. Preview the edits again.'},409);
  if(String(body.confirmation||'')!==preview.confirmation_phrase)return json({error:'confirmation_required',detail:`Type ${preview.confirmation_phrase} exactly.`},400);
  if(!body.acknowledged)return json({error:'acknowledgement_required',detail:'Confirm that you reviewed the edits and intend to update Discord.'},400);
  const active=await activeJob(env,guildId);if(active)return json({error:'operation_in_progress',detail:`Channel Manager job #${active.id} is already ${active.status}. Wait for it to finish before sending another change.`},409);
  const reason=(String(body.reason||'').trim()||'Owner edited existing channel structure').slice(0,512),snapshotId=await snapshot(env,guildId,actorId,`Before edit: ${reason.slice(0,80)}`,'automatic-edit',preview.changes.map((item:any)=>item.id));
  const jobId=await createJob(env,guildId,actorId,'edit',reason,snapshotId,{items:preview.changes},preview.changes);await env.JOBS.send({type:'channel-manager-execute',jobId});await audit(env,guildId,null,'channel_manager_edit_queued',{job_id:jobId,snapshot_id:snapshotId,count:preview.changes.length,reason},actorId);
  return json({ok:true,job_id:jobId,snapshot_id:snapshotId,status:'queued'});
}

async function previewReorder(env:Env,guildId:string,body:any):Promise<Response>{
  const channels=await getChannels(env,guildId),current=canonicalOrder(channels);const raw=Array.isArray(body.items)?body.items:[];
  if(raw.length!==channels.length)return json({error:'incomplete_order',detail:'The order must include every category and channel currently visible. Refresh and try again.'},409);
  const channelMap=new Map(channels.map(channel=>[channel.id,channel])),seen=new Set<string>(),errors:string[]=[];
  const desired=raw.map((item:any,index:number)=>{const id=String(item.id||''),channel=channelMap.get(id),parentId=item.parent_id?String(item.parent_id):null,requestedPosition=Number(item.position),position=Number.isFinite(requestedPosition)?Math.max(0,requestedPosition):index;if(!channel)errors.push(`Unknown channel ${id||index}.`);if(seen.has(id))errors.push(`Channel ${id} appears more than once.`);seen.add(id);if(channel?.type===4&&parentId)errors.push(`Category ${channel.name} cannot be placed inside another category.`);if(parentId&&channelMap.get(parentId)?.type!==4)errors.push(`${channel?.name||id} has an invalid parent category.`);return {id,name:channel?.name||String(item.name||'Unknown'),type:Number(channel?.type??item.type??0),parent_id:channel?.type===4?null:parentId,position}});
  if(seen.size!==channels.length)errors.push('One or more current channels are missing from the order.');
  for(const category of channels.filter(channel=>channel.type===4))if(desired.filter((item:any)=>item.parent_id===category.id).length>50)errors.push(`${category.name} would exceed Discord’s 50-channel category limit.`);
  if(errors.length)return json({error:'invalid_order',detail:errors[0],errors},400);
  const currentMap=new Map(current.map((item:any)=>[item.id,item])),changes=desired.filter((item:any)=>{const before=currentMap.get(item.id);return !before||before.parent_id!==item.parent_id||before.position!==item.position});
  if(!changes.length)return json({error:'order_unchanged',detail:'Nothing moved. Drag a category or channel into a new position first.'},409);
  const fingerprint=await digest(JSON.stringify({current:current.map(orderSignature),desired:desired.map(orderSignature)}));
  return json({items:desired,changes,fingerprint,confirmation_phrase:`APPLY ${changes.length} MOVES`,warning:'Orbit will preserve channel permission overwrites while changing category membership and display order. A structural backup is captured first.'});
}

async function executeReorder(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  if(!env.JOBS)return json({error:'queue_unavailable',detail:'The Orbit job queue is not configured, so channel reordering is disabled.'},503);
  if(!await botCanManageChannels(env,guildId))return json({error:'missing_manage_channels',detail:'Orbit needs Manage Channels in Discord before it can reorder channels.'},403);
  const previewResponse=await previewReorder(env,guildId,body),preview=await previewResponse.clone().json<any>();if(!previewResponse.ok)return previewResponse;
  if(body.fingerprint!==preview.fingerprint)return json({error:'preview_changed',detail:'The Discord hierarchy changed. Refresh the order and preview it again.'},409);
  if(String(body.confirmation||'')!==preview.confirmation_phrase)return json({error:'confirmation_required',detail:`Type ${preview.confirmation_phrase} exactly.`},400);
  if(!body.acknowledged)return json({error:'acknowledgement_required',detail:'Confirm that you reviewed the hierarchy and intend to update Discord.'},400);
  const active=await activeJob(env,guildId);if(active)return json({error:'operation_in_progress',detail:`Channel Manager job #${active.id} is already ${active.status}. Wait for it to finish before sending another change.`},409);
  const reason=(String(body.reason||'').trim()||'Owner reordered the channel hierarchy').slice(0,512),snapshotId=await snapshot(env,guildId,actorId,`Before reorder: ${reason.slice(0,80)}`,'automatic-reorder',[]);
  const jobId=await createJob(env,guildId,actorId,'reorder',reason,snapshotId,{items:preview.items},preview.changes);await env.JOBS.send({type:'channel-manager-execute',jobId});await audit(env,guildId,null,'channel_manager_reorder_queued',{job_id:jobId,snapshot_id:snapshotId,count:preview.changes.length,reason},actorId);
  return json({ok:true,job_id:jobId,snapshot_id:snapshotId,status:'queued'});
}

async function createManualBackup(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  const name=(String(body.name||'').trim()||'Manual channel backup').slice(0,100);const id=await snapshot(env,guildId,actorId,name,'manual',[]);await audit(env,guildId,null,'channel_manager_backup_created',{snapshot_id:id,name},actorId);return json({ok:true,snapshot_id:id});
}

async function previewRestore(env:Env,guildId:string,body:any):Promise<Response>{
  const id=Number(body.snapshot_id);const row=await env.DB.prepare('SELECT * FROM channel_manager_snapshots WHERE id=? AND guild_id=?').bind(id,guildId).first<any>();if(!row)return json({error:'snapshot_not_found'},404);
  const stored=parseStructure(row.structure_json),current=await getChannels(env,guildId),currentIds=new Set(current.map(c=>c.id));
  const snapshotTargets=safeArray(row.target_ids_json);const requested=Array.isArray(body.channel_ids)&&body.channel_ids.length?body.channel_ids:(snapshotTargets.length?snapshotTargets:stored.channels.map((channel:Channel)=>channel.id));const selected=new Set(requested.map(String));
  const missing=stored.channels.filter((c:Channel)=>selected.has(c.id)&&!currentIds.has(c.id));
  const restoredCategories=new Set(missing.filter((c:Channel)=>c.type===4).map((c:Channel)=>c.id));
  const storedOrder=new Map(canonicalOrder(stored.channels).map(item=>[item.id,item])),currentOrder=new Map(canonicalOrder(current).map(item=>[item.id,item]));
  const changed=stored.channels.filter((channel:Channel)=>selected.has(channel.id)&&currentIds.has(channel.id)).filter((channel:Channel)=>{const before=storedOrder.get(channel.id),now=currentOrder.get(channel.id);return before&&now&&(before.parent_id!==now.parent_id||before.position!==now.position)}).map((channel:Channel)=>({...channel,...storedOrder.get(channel.id),reorder_only:true}));
  const reparent=stored.channels.filter((channel:Channel)=>currentIds.has(channel.id)&&channel.parent_id&&restoredCategories.has(channel.parent_id)).map((channel:Channel)=>({...channel,...storedOrder.get(channel.id),reorder_only:true}));
  const existingChanges=new Map([...changed,...reparent].map((item:any)=>[item.id,item])),items=[...missing,...existingChanges.values()];
  if(!items.length)return json({error:'nothing_to_restore',detail:'No missing selected structure was found in this backup.'},409);
  const fingerprint=await digest(JSON.stringify(items.map((i:any)=>[i.id,i.parent_id,i.position,Boolean(i.reorder_only)])));
  return json({snapshot:{id:row.id,name:row.name,created_at:row.created_at,source:row.source},items,fingerprint,confirmation_phrase:`RESTORE ${items.length} CHANNELS`,warning:'Restore reapplies saved positions and category membership, and recreates missing categories/channels where Discord accepts them. Recreated channels receive new IDs. Deleted messages, threads, attachments and webhooks cannot be restored.'});
}

async function executeRestore(env:Env,guildId:string,actorId:string,body:any):Promise<Response>{
  if(!env.JOBS)return json({error:'queue_unavailable',detail:'The Orbit job queue is not configured, so structural restore is disabled.'},503);
  if(!await botCanManageChannels(env,guildId))return json({error:'missing_manage_channels',detail:'Orbit needs Manage Channels in Discord before it can restore channel structure.'},403);
  const previewResponse=await previewRestore(env,guildId,body);const preview=await previewResponse.clone().json<any>();if(!previewResponse.ok)return previewResponse;
  if(body.fingerprint!==preview.fingerprint)return json({error:'preview_changed',detail:'The server structure changed. Preview the restore again.'},409);
  if(String(body.confirmation||'')!==preview.confirmation_phrase)return json({error:'confirmation_required',detail:`Type ${preview.confirmation_phrase} exactly.`},400);
  if(!body.acknowledged)return json({error:'acknowledgement_required',detail:'Confirm that you reviewed the restore preview and intend to update Discord.'},400);
  const active=await activeJob(env,guildId);if(active)return json({error:'operation_in_progress',detail:`Channel Manager job #${active.id} is already ${active.status}. Wait for it to finish before sending another change.`},409);
  const reason=String(body.reason||`Restore backup ${preview.snapshot.name}`).trim().slice(0,512);
  const safetySnapshot=await snapshot(env,guildId,actorId,`Before restore: ${preview.snapshot.name}`,'automatic-restore',[]);
  const jobId=await createJob(env,guildId,actorId,'restore',reason,safetySnapshot,{snapshot_id:preview.snapshot.id,items:preview.items},preview.items);
  await env.JOBS.send({type:'channel-manager-execute',jobId});await audit(env,guildId,null,'channel_manager_restore_queued',{job_id:jobId,source_snapshot_id:preview.snapshot.id,safety_snapshot_id:safetySnapshot,count:preview.items.length},actorId);
  return json({ok:true,job_id:jobId,snapshot_id:safetySnapshot,status:'queued'});
}

async function createJob(env:Env,guildId:string,actorId:string,operation:string,reason:string,snapshotId:number,request:any,items:any[]):Promise<number>{
  const now=Date.now();const inserted=await env.DB.prepare('INSERT INTO channel_manager_jobs(guild_id,operation,status,request_json,total_items,created_by,reason,snapshot_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(guildId,operation,'queued',JSON.stringify(request),items.length,actorId,reason,snapshotId,now).run();const jobId=Number(inserted.meta.last_row_id);
  try{const actionJobId=await createActionJob(env,{guildId,module:'channel-manager',action:operation,actorUserId:actorId,request});await env.DB.prepare('UPDATE channel_manager_jobs SET action_job_id=? WHERE id=?').bind(actionJobId,jobId).run();}catch{}
  for(let index=0;index<items.length;index++){const item=items[index];await env.DB.prepare('INSERT INTO channel_manager_job_items(job_id,guild_id,operation,channel_id,channel_type,name,payload_json,status,sort_order,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(jobId,guildId,operation,item.id||null,item.type??kindType(item.kind),item.name,JSON.stringify(item),'queued',index,now).run();}
  return jobId;
}

async function snapshot(env:Env,guildId:string,actorId:string,name:string,source:string,targetIds:string[]):Promise<number>{
  const channels=await getChannels(env,guildId),visibleIds=new Set(channels.map(channel=>channel.id)),missingIds=targetIds.filter(id=>!visibleIds.has(String(id))),known=await loadKnownSnapshotChannels(env,guildId,missingIds),all=[...channels,...known];const data={version:1,guild_id:guildId,channels:all,captured_at:Date.now(),limitations:['No messages','No threads','No attachments','No webhooks','Restored channels receive new Discord IDs']};
  const result=await env.DB.prepare('INSERT INTO channel_manager_snapshots(guild_id,name,source,structure_json,target_ids_json,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(guildId,name,source,JSON.stringify(data),JSON.stringify(targetIds),actorId,Date.now(),Date.now()+90*86400000).run();
  await env.DB.prepare('DELETE FROM channel_manager_snapshots WHERE guild_id=? AND source<>? AND expires_at IS NOT NULL AND expires_at<?').bind(guildId,'manual',Date.now()).run();return Number(result.meta.last_row_id);
}

async function getChannels(env:Env,guildId:string):Promise<Channel[]>{const response=await discord(env,`/guilds/${guildId}/channels`);if(!response.ok)throw new Error(`discord_channels_${response.status}`);const raw=await response.json<any[]>();return raw.filter(c=>STRUCTURAL_TYPES.has(Number(c.type))).map(normalizeChannel).sort((a,b)=>a.position-b.position);}
async function resolveManualDeleteTargets(env:Env,guildId:string,ids:string[],visible:Channel[]):Promise<{targets:Channel[];unresolved:string[]}>{const visibleIds=new Set(visible.map(channel=>channel.id)),needed=ids.filter(id=>!visibleIds.has(id));if(!needed.length)return {targets:[],unresolved:[]};const targets=await loadKnownSnapshotChannels(env,guildId,needed),found=new Set(targets.map(channel=>channel.id));return {targets,unresolved:needed.filter(id=>!found.has(id))};}
async function loadKnownSnapshotChannels(env:Env,guildId:string,ids:string[]):Promise<Channel[]>{const wanted=new Set(ids.map(String));if(!wanted.size)return [];const rows=await env.DB.prepare('SELECT structure_json FROM channel_manager_snapshots WHERE guild_id=? ORDER BY created_at DESC LIMIT 20').bind(guildId).all<any>(),found=new Map<string,Channel>();for(const row of rows.results){for(const channel of parseStructure(row.structure_json).channels){const normalized=normalizeChannel(channel);if(wanted.has(normalized.id)&&!found.has(normalized.id))found.set(normalized.id,normalized);}}return [...found.values()];}
function normalizeChannel(c:any):Channel{return {id:String(c.id),name:String(c.name||'Unnamed'),type:Number(c.type),parent_id:c.parent_id?String(c.parent_id):null,position:Number(c.position||0),topic:c.topic??null,nsfw:Boolean(c.nsfw),rate_limit_per_user:Number(c.rate_limit_per_user||0),bitrate:Number(c.bitrate||0),user_limit:Number(c.user_limit||0),permission_overwrites:Array.isArray(c.permission_overwrites)?c.permission_overwrites.map((o:any)=>({id:String(o.id),type:Number(o.type),allow:String(o.allow||'0'),deny:String(o.deny||'0')})):[]};}
async function getDiscordGuild(env:Env,guildId:string):Promise<any>{const response=await discord(env,`/guilds/${guildId}`);if(!response.ok)throw new Error(`discord_guild_${response.status}`);return response.json<any>();}
async function activeJob(env:Env,guildId:string):Promise<any>{return env.DB.prepare("SELECT id,status FROM channel_manager_jobs WHERE guild_id=? AND (status='queued' OR (status='running' AND COALESCE(lease_expires_at,0)>?)) ORDER BY created_at ASC LIMIT 1").bind(guildId,Date.now()).first<any>()}
async function botCanManageChannels(env:Env,guildId:string):Promise<boolean>{const [rolesResponse,memberResponse]=await Promise.all([discord(env,`/guilds/${guildId}/roles`),discord(env,`/guilds/${guildId}/members/${env.DISCORD_CLIENT_ID}`)]);if(!rolesResponse.ok||!memberResponse.ok)return false;const roles=await rolesResponse.json<any[]>(),member=await memberResponse.json<any>();let permissions=0n;for(const role of roles)if(role.id===guildId||member.roles?.includes(role.id))permissions|=BigInt(role.permissions||0);return Boolean((permissions&8n)||(permissions&16n))}

async function scanDependencies(env:Env,guildId:string):Promise<Record<string,any[]>>{
  const out:Record<string,any[]>={};const add=(id:any,module:string,label:string,blocking=true)=>{if(!id)return;(out[String(id)]??=[]).push({module,label,blocking});};
  const queries:[string,string,(row:any)=>void][]=[
    ['guild_config','SELECT admin_log_channel_id FROM guild_config WHERE guild_id=?',r=>add(r.admin_log_channel_id,'settings','Admin log destination')],
    ['honeypot_configs','SELECT channel_id,log_channel_id FROM honeypot_configs WHERE guild_id=?',r=>{add(r.channel_id,'honeypot','Honeypot channel');add(r.log_channel_id,'honeypot','Honeypot log channel')}],
    ['role_panels','SELECT channel_id FROM role_panels WHERE guild_id=?',r=>add(r.channel_id,'roles','Published role panel')],
    ['ticket_categories','SELECT discord_category_id,panel_channel_id FROM ticket_categories WHERE guild_id=?',r=>{add(r.discord_category_id,'tickets','Ticket category');add(r.panel_channel_id,'tickets','Ticket panel channel')}],
    ['tickets','SELECT channel_id,status FROM tickets WHERE guild_id=?',r=>add(r.channel_id,'tickets',`Ticket (${r.status})`,['open','claimed','creating'].includes(r.status))],
    ['scheduled_posts','SELECT channel_id,status FROM scheduled_posts WHERE guild_id=?',r=>add(r.channel_id,'scheduler',`Scheduled post (${r.status})`,['queued','sending'].includes(r.status))],
    ['community_configs','SELECT welcome_channel_id,goodbye_channel_id FROM community_configs WHERE guild_id=?',r=>{add(r.welcome_channel_id,'community','Welcome channel');add(r.goodbye_channel_id,'community','Goodbye channel')}],
    ['sticky_configs','SELECT channel_id FROM sticky_configs WHERE guild_id=?',r=>add(r.channel_id,'community','Sticky message channel')],
    ['leveling_configs','SELECT announce_channel_id FROM leveling_configs WHERE guild_id=?',r=>add(r.announce_channel_id,'leveling','Level-up announcement channel')],
    ['creator_sources','SELECT discord_channel_id FROM creator_sources WHERE guild_id=?',r=>add(r.discord_channel_id,'alerts','Creator alert destination')],
    ['creator_role_alert_configs','SELECT discord_channel_id FROM creator_role_alert_configs WHERE guild_id=?',r=>add(r.discord_channel_id,'alerts','Role-gated live alert destination')],
    ['community_events','SELECT discord_channel_id FROM community_events WHERE guild_id=?',r=>add(r.discord_channel_id,'events','Discord event channel')],
    ['application_forms','SELECT destination_channel_id FROM application_forms WHERE guild_id=?',r=>add(r.destination_channel_id,'applications','Application destination')],
    ['kofi_integrations','SELECT default_channel_id FROM kofi_integrations WHERE guild_id=?',r=>add(r.default_channel_id,'kofi','Ko-fi destination')],
    ['social_integrations','SELECT discord_channel_id FROM social_integrations WHERE guild_id=?',r=>add(r.discord_channel_id,'social','Social destination')],
  ];
  for(const [,sql,visit] of queries){const rows=await env.DB.prepare(sql).bind(guildId).all<any>();for(const row of rows.results)visit(row)}
  const jsonRows:[string,string[]][]=[['security_configs',['lockdown_channel_ids_json','alert_channel_id']],['shield_configs',['channel_ids_json','alert_channel_id']],['creator_safety_configs',['channel_ids_json','alert_channel_id']]];
  for(const [table,fields] of jsonRows){const row=await env.DB.prepare(`SELECT ${fields.join(',')} FROM ${table} WHERE guild_id=?`).bind(guildId).first<any>();if(!row)continue;for(const field of fields){if(field.endsWith('_json'))for(const id of safeArray(row[field]))add(id,table.replace('_configs',''),`${table.replace('_configs','').replace('_',' ')} protected channel`);else add(row[field],table.replace('_configs',''),`${table.replace('_configs','').replace('_',' ')} alert channel`)}}
  const automations=await env.DB.prepare('SELECT name,conditions_json,actions_json FROM automations WHERE guild_id=?').bind(guildId).all<any>();for(const automation of automations.results){const raw=`${automation.conditions_json||''} ${automation.actions_json||''}`;for(const id of raw.match(/\d{15,22}/g)||[])add(id,'automation',`Automation: ${automation.name}`)}
  return out;
}

async function safeActionJobs(env:Env,guildId:string):Promise<any[]>{try{return await listActionJobs(env,guildId,20)}catch{return []}}

function kindType(kind:string):number{return kind==='category'?4:kind==='voice'?2:0}
function parseSnowflakeList(value:any):string[]{const values=Array.isArray(value)?value:String(value||'').split(/[\s,]+/);return [...new Set(values.map(item=>String(item).trim()).filter(item=>/^\d{15,22}$/.test(item)))].slice(0,25)}
function clamp(value:any,min:number,max:number,fallback:number):number{const parsed=Number(value);return Number.isFinite(parsed)?Math.floor(Math.max(min,Math.min(max,parsed))):fallback}
function editSignature(item:any):any[]{return [item.id,item.name,item.parent_id||null,item.topic||'',Boolean(item.nsfw),Number(item.rate_limit_per_user||0),Number(item.bitrate||0),Number(item.user_limit||0)]}
function canonicalOrder(channels:Channel[]):any[]{const categories=channels.filter(channel=>channel.type===4).sort((a,b)=>a.position-b.position),items:any[]=[];categories.forEach((category,position)=>{items.push({id:category.id,name:category.name,type:category.type,parent_id:null,position});channels.filter(channel=>channel.type!==4&&channel.parent_id===category.id).sort((a,b)=>a.position-b.position).forEach((channel,index)=>items.push({id:channel.id,name:channel.name,type:channel.type,parent_id:category.id,position:index}))});channels.filter(channel=>channel.type!==4&&!channel.parent_id).sort((a,b)=>a.position-b.position).forEach((channel,index)=>items.push({id:channel.id,name:channel.name,type:channel.type,parent_id:null,position:index}));return items}
function orderSignature(item:any):any[]{return [item.id,item.parent_id||null,Number(item.position||0)]}
function safeArray(raw:any):any[]{try{const value=typeof raw==='string'?JSON.parse(raw):raw;return Array.isArray(value)?value:[]}catch{return []}}
function parseStructure(raw:string):{channels:Channel[]}{try{const value=JSON.parse(raw);return {channels:Array.isArray(value.channels)?value.channels:[]}}catch{return {channels:[]}}}
function parseJob(row:any){return {...row,errors:safeArray(row.error_summary_json)}}
async function digest(value:string):Promise<string>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('')}
