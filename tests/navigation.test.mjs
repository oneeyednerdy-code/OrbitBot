import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('navigation is registry-driven and follows the clean Orbit information architecture', async () => {
  const navigation = await readFile(new URL('../public/js/navigation.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/js/app.js', import.meta.url), 'utf8');
  assert.match(navigation, /label: 'Community'/);
  assert.match(navigation, /label: 'Moderation'/);
  assert.match(navigation, /label: 'Creator'/);
  assert.match(navigation, /'social', 'Social Publishing'/);
  assert.match(navigation, /'features', 'Manage Features'/);
  assert.match(navigation, /'roadmap', 'Roadmap'/);
  assert.match(navigation, /'channel-manager', 'Channel Manager'.*ownerOnly/s);
  assert.match(index, /<nav id="nav" aria-label="Orbit sections"><\/nav>/);
  assert.match(index, /id="sidebarScrim"/);
  assert.match(app, /renderNavigation\(\$\('#nav'\)\)/);
  assert.doesNotMatch(index, /Moderation \+ Honeypot/);
});

test('shared sorting and upcoming queue ordering are wired consistently', async () => {
  const core = await readFile(new URL('../public/js/core.js', import.meta.url), 'utf8');
  const dashboard = await readFile(new URL('../src/modules/dashboard/api.ts', import.meta.url), 'utf8');
  const social = await readFile(new URL('../src/modules/social/api.ts', import.meta.url), 'utf8');
  const scheduler = await readFile(new URL('../src/modules/scheduler/api.ts', import.meta.url), 'utf8');
  assert.match(core, /export function sortGuilds/);
  assert.match(core, /export function sortChannels/);
  assert.match(core, /export function sortRoles/);
  assert.match(dashboard, /parent_position/);
  assert.match(social, /CASE WHEN status IN \('scheduled','queued'\)/);
  assert.match(scheduler, /CASE WHEN status IN \('queued','sending'\)/);
});
