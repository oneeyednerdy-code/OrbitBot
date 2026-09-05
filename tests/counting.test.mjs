import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('counting module is wired as a guarded Gateway-backed Discord module', async () => {
  const service = await readFile(new URL('../src/modules/counting/service.ts', import.meta.url), 'utf8');
  const gateway = await readFile(new URL('../src/gateway/discord-gateway.ts', import.meta.url), 'utf8');
  const api = await readFile(new URL('../src/modules/counting/api.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../migrations/0049_counting.sql', import.meta.url), 'utf8');
  const page = await readFile(new URL('../public/js/pages/counting.js', import.meta.url), 'utf8');
  assert.match(gateway, /handleCountingMessage/);
  assert.match(service, /current_number=\?/);
  assert.match(service, /require_alternating=0 OR last_user_id/);
  assert.match(service, /counting_activity/);
  assert.match(service, /allowed_mentions|pingUserIds/);
  assert.match(api, /counting_channel_required/);
  assert.match(api, /operation === 'reset'/);
  assert.match(migration, /counting_configs/);
  assert.match(migration, /counting_activity/);
  assert.match(page, /Enable counting/);
  assert.match(page, /Reset Count/);
});

test('birthday module keeps dates private and announcements duplicate-safe', async () => {
  const api = await readFile(new URL('../src/modules/birthdays/api.ts', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/modules/birthdays/service.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../migrations/0050_birthdays.sql', import.meta.url), 'utf8');
  const page = await readFile(new URL('../public/js/pages/birthdays.js', import.meta.url), 'utf8');
  assert.match(page, /No birth year/);
  assert.match(api, /delete_mine/);
  assert.match(api, /validTimezone/);
  assert.match(service, /birthday_announcement_runs/);
  assert.match(service, /announcement_year/);
  assert.match(service, /pingRoleIds/);
  assert.match(migration, /UNIQUE\(birthday_id,announcement_year\)/);
  assert.match(page, /Save My Birthday/);
  assert.match(page, /Remove Mine/);
});
