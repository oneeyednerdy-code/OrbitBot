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

function read(path){return readFileSync(new URL(`../${path}`,import.meta.url),'utf8')}
