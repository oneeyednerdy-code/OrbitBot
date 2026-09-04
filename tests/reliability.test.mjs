import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { automationConditionMatches, discordActionSucceeded, shouldHandleAutomationMessage } from '../src/modules/automation/policy.js';
import { MAX_QUEUE_ATTEMPTS, queueRetryDecision } from '../src/modules/scheduler/retry-policy.js';

test('automation ignores bot and webhook messages',()=>{
  const message={guild_id:'1',author:{id:'2',bot:false}};
  assert.equal(shouldHandleAutomationMessage(message),true);
  assert.equal(shouldHandleAutomationMessage({...message,author:{id:'2',bot:true}}),false);
  assert.equal(shouldHandleAutomationMessage({...message,webhook_id:'3'}),false);
  assert.equal(shouldHandleAutomationMessage({author:{id:'2',bot:false}}),false);
});

test('automation conditions fail closed and Discord failures are not successes',()=>{
  const context={user_id:'2',channel_id:'3',role_ids:['4']};
  assert.equal(automationConditionMatches({type:'channel_is',channel_id:'3'},context),true);
  assert.equal(automationConditionMatches({type:'has_role',role_id:'4'},context),true);
  assert.equal(automationConditionMatches({type:'future_condition'},context),false);
  assert.equal(discordActionSucceeded(204),true);
  assert.equal(discordActionSucceeded(403),false);
  assert.equal(discordActionSucceeded(500),false);
});

test('queue retries are bounded and back off',()=>{
  assert.deepEqual(queueRetryDecision(1),{retry:true,delaySeconds:10});
  assert.deepEqual(queueRetryDecision(2),{retry:true,delaySeconds:20});
  assert.deepEqual(queueRetryDecision(MAX_QUEUE_ATTEMPTS),{retry:false,delaySeconds:0});
  assert.deepEqual(queueRetryDecision(100),{retry:false,delaySeconds:0});
});

test('a newer page render aborts the prior page request without logging a network failure',async()=>{
  globalThis.window={addEventListener(){}};
  globalThis.document={querySelector(){return null;}};
  globalThis.location={origin:'https://orbit.test'};
  globalThis.fetch=(_url,init)=>new Promise((resolve,reject)=>{
    init.signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError')),{once:true});
  });
  const core=await import(`../public/js/core.js?test=${Date.now()}`);
  core.state.page='roles';core.state.guildId='1';core.beginPageRender();
  const pending=core.api('/api/guilds/1/roles');
  core.beginPageRender();
  await assert.rejects(pending,error=>error?.name==='AbortError'&&error?.message==='stale_navigation');
  assert.equal(core.clientDiagnostics.networkFailures.length,0);
});

test('reliability control plane exposes permission doctor, action history, and rate-limit persistence',()=>{
  const migration=read('migrations/0039_reliability_control_plane.sql');
  const backupMigration=read('migrations/0040_config_backups.sql');
  const permissions=read('src/discord/permissions.ts');
  const reliability=read('src/modules/operations/reliability.ts');
  const backups=read('src/repositories/config-backups.ts');
  const client=read('src/discord/client.ts');
  assert.match(migration,/orbit_action_jobs/);
  assert.match(migration,/orbit_resource_bindings/);
  assert.match(migration,/orbit_rate_limit_buckets/);
  assert.match(backupMigration,/orbit_config_backups/);
  assert.match(permissions,/effectivePermissions/);
  assert.match(permissions,/permissionDoctor/);
  assert.match(reliability,/resource_drift/);
  assert.match(reliability,/required_permissions/);
  assert.match(client,/getDiscordRateLimitStatus/);
  assert.match(client,/persistRateLimitObservation/);
  assert.match(reliability,/create_config_backup/);
  assert.match(reliability,/restore_config_backup/);
  assert.match(backups,/CONFIG_BACKUP_TABLES/);
  assert.match(backups,/credential_ciphertext/);
});

test('events can post RSVP buttons and record guild-scoped responses',()=>{
  const api=read('src/modules/events/api.ts');
  const interactions=read('src/modules/events/interactions.ts');
  assert.match(api,/orbit_event_rsvp/);
  assert.match(api,/event_message_id/);
  assert.match(interactions,/event_signups/);
  assert.match(interactions,/guild_id=\?/);
});

test('events page fetches its data before rendering the event list',()=>{
  const page=read('public/js/pages/events.js');
  assert.match(page,/const data=await api\(`\/api\/guilds\/\$\{state\.guildId\}\/events`\)/);
  assert.match(page,/const events=Array\.isArray\(data\.events\)\?data\.events:\[\]/);
  assert.doesNotMatch(page,/\$\{data\.events\.length\?/);
});

test('resource drift names the missing Discord reference and links to repair settings',()=>{
  const reliability=read('src/modules/operations/reliability.ts');
  const page=read('public/js/pages/operations.js');
  assert.match(reliability,/driftSummary\(drift\.missing\)/);
  assert.match(page,/saved Discord setting/);
  assert.match(page,/driftPage\(item\.module\)/);
});

test('operations UI includes Action Center and Permission Doctor controls',()=>{
  const page=read('public/js/pages/operations.js');
  assert.match(page,/runReliabilityScan/);
  assert.match(page,/runPermissionDoctor/);
  assert.match(page,/Action Center/);
  assert.match(page,/resource_drift/);
  assert.match(page,/Create Configuration Backup/);
  assert.match(page,/Restore This Backup/);
});

test('gateway status publishes its intent manifest and heartbeat health',()=>{
  const gateway=read('src/gateway/discord-gateway.ts');
  assert.match(gateway,/GATEWAY_INTENT_MANIFEST/);
  assert.match(gateway,/heartbeat_misses/);
  assert.match(gateway,/last_heartbeat_ack_at/);
  assert.match(gateway,/intents: GATEWAY_INTENTS/);
});

test('creator alerts support podcast and TikTok feeds, deduplication, and stream-end automations',()=>{
  const api=read('src/modules/creator/api.ts');
  const poll=read('src/modules/creator/poll.ts');
  const migration=read('migrations/0042_creator_source_items.sql');
  const page=read('public/js/pages/creator.js');
  assert.match(api,/podcast/);
  assert.match(api,/tiktok/);
  assert.match(api,/delete_role_automation/);
  assert.match(api,/role_automation_status/);
  assert.match(poll,/creator_source_items/);
  assert.match(poll,/stream_end/);
  assert.match(poll,/vod_url/);
  assert.match(migration,/PRIMARY KEY \(source_id, external_id\)/);
  assert.match(page,/Podcast RSS/);
  assert.match(page,/TikTok feed/);
  assert.match(page,/Delete Automation/);
});

test('automation and scheduler support editing, deletion, stream-end templates, and role mentionability repair',()=>{
  const automationApi=read('src/modules/automation/api.ts');
  const automationEngine=read('src/modules/automation/engine.ts');
  const automationPage=read('public/js/pages/automation.js');
  const schedulerApi=read('src/modules/scheduler/api.ts');
  const schedulerPage=read('public/js/pages/scheduler.js');
  assert.match(automationApi,/stream_end/);
  assert.match(automationApi,/body.op==='edit'/);
  assert.match(automationPage,/auEdit/);
  assert.match(automationPage,/auDelete/);
  assert.match(automationEngine,/renderTemplate/);
  assert.match(automationEngine,/vod_url/);
  assert.match(schedulerApi,/op==='edit'/);
  assert.match(schedulerApi,/make_role_mentionable/);
  assert.match(schedulerPage,/spEdit/);
  assert.match(schedulerPage,/spDelete/);
  assert.match(schedulerPage,/Every 2 weeks/);
});

test('TikTok OAuth can relay new videos to a selected Discord channel without duplicates',()=>{
  const oauth=read('src/modules/connections/oauth.ts');
  const api=read('src/modules/connections/api.ts');
  const poll=read('src/modules/tiktok/poll.ts');
  const scheduler=read('src/modules/scheduler/jobs.ts');
  const page=read('public/js/pages/connections.js');
  const migration=read('migrations/0043_tiktok_announcements.sql');
  assert.match(oauth,/tiktok/);
  assert.match(oauth,/video\.list/);
  assert.match(oauth,/v2\/oauth\/token/);
  assert.match(api,/save_tiktok_announce/);
  assert.match(api,/validateChannelIds/);
  assert.match(poll,/v2\/video\/list/);
  assert.match(poll,/tiktok_announcement_videos/);
  assert.match(poll,/refresh_token/);
  assert.match(scheduler,/pollTikTokAnnouncements/);
  assert.match(page,/Authorize TikTok/);
  assert.match(page,/Save TikTok Announcements/);
  assert.match(migration,/tiktok_announce_configs/);
  assert.match(migration,/PRIMARY KEY\s*\(config_id,\s*video_id\)/);
});

test('short-form video and social management stay separate and enforce platform limits',()=>{
  const videoApi=read('src/modules/short-video/api.ts');
  const videoProviders=read('src/modules/short-video/providers.ts');
  const videoDispatch=read('src/modules/short-video/dispatch.ts');
  const videoPage=read('public/js/pages/short-video.js');
  const socialApi=read('src/modules/social/api.ts');
  const socialLimits=read('src/modules/social/limits.ts');
  const socialPage=read('public/js/pages/social.js');
  const migration=read('migrations/0044_short_video_posts.sql');
  assert.match(videoApi,/short_video_posts/);
  assert.match(videoApi,/youtube\.upload/);
  assert.match(videoProviders,/videos\?uploadType=resumable/);
  assert.match(videoProviders,/v2\/post\/publish\/video\/init/);
  assert.match(videoProviders,/graph\.instagram\.com/);
  assert.match(videoDispatch,/short-video-dispatch/);
  assert.match(videoDispatch,/status='processing'/);
  assert.match(videoPage,/Post Video Now/);
  assert.match(videoPage,/Schedule Video/);
  assert.match(socialApi,/text_limit_exceeded/);
  assert.match(socialLimits,/bluesky: 300/);
  assert.match(socialLimits,/threads: 500/);
  assert.match(socialPage,/Post Now/);
  assert.match(socialPage,/Schedule Post/);
  assert.match(migration,/short_video_runs/);
});

test('server search can load channel counts without replacing the current session',()=>{
  const dashboard=read('src/modules/dashboard/api.ts');
  const api=read('src/http/api.ts');
  const app=read('public/js/app.js');
  const index=read('public/index.html');
  assert.match(dashboard,/include_channel_counts/);
  assert.match(dashboard,/channel_count/);
  assert.match(api,/listManageableGuilds\(request, env, session\)/);
  assert.match(app,/loadServerChannelCounts/);
  assert.match(app,/serverSearch/);
  assert.match(index,/Find large servers/);
});

function read(path){return readFileSync(new URL(`../${path}`,import.meta.url),'utf8')}
