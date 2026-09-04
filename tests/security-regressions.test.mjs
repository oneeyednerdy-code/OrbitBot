import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('connection OAuth requires an explicitly successful guild authorization',async()=>{
  const source=await readFile(new URL('../src/modules/connections/oauth.ts',import.meta.url),'utf8');
  assert.equal(source.includes('if (!authz)'),false);
  assert.equal((source.match(/if \(!authz\.ok\)/g)||[]).length,2);
});

test('guild API runs central resource validation before module dispatch',async()=>{
  const source=await readFile(new URL('../src/http/api.ts',import.meta.url),'utf8');
  const validateIndex=source.indexOf('validateMutationResources(request,env,guildId,action)');
  const dispatchIndex=source.indexOf('handleGuildApi(request, env, guildId, action');
  assert.ok(validateIndex>0&&dispatchIndex>validateIndex);
});

test('Discord client defaults channel messages to no parsed mentions',async()=>{
  const source=await readFile(new URL('../src/discord/client.ts',import.meta.url),'utf8');
  assert.match(source,/allowed_mentions:\{parse:\[\]\}/);
  assert.match(source,/withSafeMessageMentions/);
});

test('failed protection restores retain their snapshots',async()=>{
  const source=await readFile(new URL('../src/discord/channel-protection.ts',import.meta.url),'utf8');
  assert.match(source,/DELETE FROM \$\{definition\.table\} WHERE guild_id=\? AND channel_id=\?/);
  assert.match(source,/restore_status='failed'/);
});

test('Gateway force retry is owner-only, confirmed, and uses the guarded path',async()=>{
  const source=await readFile(new URL('../src/modules/dashboard/api.ts',import.meta.url),'utf8');
  assert.match(source,/guild\?\.owner !== true/);
  assert.match(source,/RETRY GATEWAY/);
  assert.match(source,/gateway\/start\?force=1/);
  assert.match(source,/gateway_force_retry_requested/);
});

test('diagnostics separates optional checks and retained error history',async()=>{
  const source=await readFile(new URL('../src/modules/diagnostics/api.ts',import.meta.url),'utf8');
  assert.match(source,/category !== 'optional'/);
  assert.match(source,/recent_failures/);
  assert.match(source,/error_history/);
});

test('Channel Manager offers an explicit missing-category recovery',async()=>{
  const api=await readFile(new URL('../src/modules/channel-manager/api.ts',import.meta.url),'utf8');
  const ui=await readFile(new URL('../public/js/pages/channel-manager.js',import.meta.url),'utf8');
  assert.match(api,/add_missing_categories/);
  assert.match(api,/unresolved_categories/);
  assert.match(ui,/Add missing categories to this plan/);
});

test('Level rewards are listed and updated only inside the managed guild',async()=>{
  const api=await readFile(new URL('../src/modules/leveling/api.ts',import.meta.url),'utf8');
  const ui=await readFile(new URL('../public/js/pages/leveling.js',import.meta.url),'utf8');
  assert.match(api,/update_reward/);
  assert.match(api,/WHERE id=\? AND guild_id=\?/);
  assert.match(api,/level_reward_updated/);
  assert.match(ui,/Current role rewards/);
  assert.match(ui,/Edit reward/);
});

test('Role panel edits update the original Discord message and repair a missing one',async()=>{
  const api=await readFile(new URL('../src/modules/roles/api.ts',import.meta.url),'utf8');
  const ui=await readFile(new URL('../public/js/pages/roles.js',import.meta.url),'utf8');
  assert.match(api,/operation==='update_panel'/);
  assert.match(api,/method:'PATCH'/);
  assert.match(api,/discordResponse\?\.status===404/);
  assert.match(api,/WHERE id=\? AND guild_id=\?/);
  assert.match(ui,/Save Panel Changes/);
});

test('Welcome messages can be tested and log Discord delivery failures',async()=>{
  const api=await readFile(new URL('../src/modules/community/api.ts',import.meta.url),'utf8');
  const service=await readFile(new URL('../src/modules/community/service.ts',import.meta.url),'utf8');
  const ui=await readFile(new URL('../public/js/pages/community.js',import.meta.url),'utf8');
  assert.match(api,/test_welcome/);
  assert.match(service,/pingUserIds:\[String\(userId\)\]/);
  assert.match(service,/welcome_message_failed/);
  assert.match(ui,/Send Test Welcome/);
});

test('Discord Audit Feed is opt-in, queued, redacted, and retry-safe',async()=>{
  const audit=await readFile(new URL('../src/repositories/audit.ts',import.meta.url),'utf8');
  const dispatch=await readFile(new URL('../src/modules/logs/dispatch.ts',import.meta.url),'utf8');
  const logs=await readFile(new URL('../src/modules/logs/api.ts',import.meta.url),'utf8');
  const ui=await readFile(new URL('../public/js/pages/diagnostics.js',import.meta.url),'utf8');
  assert.match(audit,/post_audit_events/);
  assert.match(audit,/audit-log-dispatch/);
  assert.match(dispatch,/discord_log_lease_until/);
  assert.match(dispatch,/SAFE_DETAIL_KEYS/);
  assert.match(dispatch,/Full sanitized entry: Orbit → Logs/);
  assert.match(logs,/test_feed/);
  assert.match(ui,/Post every new Orbit audit event/);
  assert.doesNotMatch(dispatch,/event\.details\}/);
});
