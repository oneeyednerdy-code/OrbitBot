import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');

test('Applications and Appeals can post and manage Discord panels',async()=>{
  const api=await read('src/modules/applications/api.ts');
  const page=await read('public/js/pages/applications.js');
  const migration=await read('migrations/0047_application_panels_and_paging.sql');
  assert.match(api,/body\.op==='post_panel'/);
  assert.match(api,/panel_message_id/);
  assert.match(api,/method:'PATCH'/);
  assert.match(api,/orbit_application_open:/);
  assert.match(page,/Post to Channel/);
  assert.match(page,/Manage Panel/);
  assert.match(page,/Delete Panel/);
  assert.match(migration,/panel_channel_id/);
  assert.match(migration,/panel_message_id/);
});

test('six to ten question forms use a persisted Continue flow instead of chaining modals',async()=>{
  const interactions=await read('src/modules/applications/interactions.ts');
  const access=await read('src/modules/access/interactions.ts');
  const migration=await read('migrations/0047_application_panels_and_paging.sql');
  assert.match(interactions,/fields\.length>5&&page===1/);
  assert.match(interactions,/type:4,data:\{content:'Page 1 of 2 saved/);
  assert.match(interactions,/Continue · Page 2 of 2/);
  assert.match(interactions,/orbit_application_continue:/);
  assert.match(interactions,/fields\.slice\(5,10\)/);
  assert.match(interactions,/application_form_sessions/);
  assert.match(interactions,/expires_at/);
  assert.match(access,/handleApplicationInteraction/);
  assert.match(migration,/application_form_sessions/);
});

test('Discord submissions are duplicate-resistant and guild/user scoped',async()=>{
  const interactions=await read('src/modules/applications/interactions.ts');
  const migration=await read('migrations/0047_application_panels_and_paging.sql');
  assert.match(interactions,/interaction_id/);
  assert.match(interactions,/session_id=\? AND form_id=\? AND guild_id=\? AND user_id=\?/);
  assert.match(interactions,/application_submitted/);
  assert.match(migration,/UNIQUE INDEX IF NOT EXISTS idx_application_submissions_interaction_id/);
});
