import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('roadmap names current APIs and forward dependencies clearly', async () => {
  const roadmap = await readFile(new URL('../public/js/pages/roadmap.js', import.meta.url), 'utf8');
  assert.match(roadmap, /TikTok API/);
  assert.match(roadmap, /YouTube API/);
  assert.match(roadmap, /Awaiting provider approval/);
  assert.match(roadmap, /Built, approval pending/);
  assert.match(roadmap, /Ko-fi webhook foundation/);
  assert.match(roadmap, /Twitter\/X publishing/);
  assert.match(roadmap, /after Ko-fi foundation/);
  assert.match(roadmap, /paywalling it/);
  assert.match(roadmap, /Facebook Page posting/);
  assert.match(roadmap, /Cross-platform analytics/);
  assert.match(roadmap, /Expanded media retention/);
  assert.match(roadmap, /Recent patches/);
});
