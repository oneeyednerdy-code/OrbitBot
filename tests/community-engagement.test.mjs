import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuestionText, questionKey, validEngagementFrequency } from '../src/modules/community-engagement/questions.js';
import { nextRun } from '../src/modules/scheduler/recurrence.js';
import { readFile } from 'node:fs/promises';

test('question banks ignore blank and duplicate lines while preserving first wording',()=>{
  const questions=parseQuestionText('What are you playing?\n\n what  are you playing? \nWhat are you watching?');
  assert.deepEqual(questions.map(item=>item.question_text),['What are you playing?','What are you watching?']);
  assert.equal(questionKey(' What  are you playing?! '),'what are you playing');
});

test('community engagement accepts all requested frequencies',()=>{
  assert.equal(validEngagementFrequency('daily'),true);
  assert.equal(validEngagementFrequency('weekly'),true);
  assert.equal(validEngagementFrequency('biweekly'),true);
  assert.equal(validEngagementFrequency('monthly'),true);
  assert.equal(validEngagementFrequency('hourly'),false);
});

test('biweekly recurrence preserves local time across DST',()=>{
  const before=Date.parse('2026-10-25T14:00:00Z');
  assert.equal(new Date(nextRun(before,'biweekly','America/Chicago')).toISOString(),'2026-11-08T15:00:00.000Z');
});

test('community engagement source includes persistent history and upload handling',async()=>{
  const api=await readFile(new URL('../src/modules/community-engagement/api.ts',import.meta.url),'utf8');
  const service=await readFile(new URL('../src/modules/community-engagement/service.ts',import.meta.url),'utf8');
  const migration=await readFile(new URL('../migrations/0038_community_engagement.sql',import.meta.url),'utf8');
  const ui=await readFile(new URL('../public/js/pages/community-engagement.js',import.meta.url),'utf8');
  const sample=await readFile(new URL('../public/question-banks/Gamer_Questions.txt',import.meta.url),'utf8');
  assert.match(api,/multipart\/form-data/);
  assert.match(api,/createQuestionBank/);
  assert.match(service,/community_engagement_history/);
  assert.match(service,/ORDER BY RANDOM\(\)/);
  assert.match(service,/question_bank_exhausted/);
  assert.match(migration,/UNIQUE\(guild_id, question_key\)/);
  assert.match(ui,/Upload Question Bank/);
  assert.match(api,/load_sample/);
  assert.match(service,/SAMPLE_QUESTION_BANKS/);
  assert.match(ui,/Load Selected Sample/);
  assert.equal(sample.trim().split(/\r?\n/).length,30);
});
