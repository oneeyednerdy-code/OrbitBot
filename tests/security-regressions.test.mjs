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
