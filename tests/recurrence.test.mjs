import test from 'node:test';
import assert from 'node:assert/strict';
import { nextRun } from '../src/modules/scheduler/recurrence.js';

test('daily recurrence preserves local time across spring DST',()=>{
  const before=Date.parse('2026-03-07T15:00:00Z');
  assert.equal(new Date(nextRun(before,'daily','America/Chicago')).toISOString(),'2026-03-08T14:00:00.000Z');
});

test('weekly recurrence preserves local time across fall DST',()=>{
  const before=Date.parse('2026-10-31T14:00:00Z');
  assert.equal(new Date(nextRun(before,'weekly','America/Chicago')).toISOString(),'2026-11-07T15:00:00.000Z');
});

test('monthly recurrence clamps to the final day of a shorter month',()=>{
  const before=Date.parse('2027-01-31T15:00:00Z');
  assert.equal(new Date(nextRun(before,'monthly','America/Chicago')).toISOString(),'2027-02-28T15:00:00.000Z');
});

test('invalid timezone safely falls back to UTC',()=>{
  const before=Date.parse('2026-06-01T12:00:00Z');
  assert.equal(new Date(nextRun(before,'daily','not/a-zone')).toISOString(),'2026-06-02T12:00:00.000Z');
});
