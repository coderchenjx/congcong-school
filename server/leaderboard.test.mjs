import test from 'node:test';
import assert from 'node:assert/strict';
import { leaderboard } from './leaderboard.mjs';

const progress = xpHistory => JSON.stringify({ version: 13, state: { xpHistory } });
const account = (username, data) => ({ username, data: JSON.stringify(data) });

test('real accounts aggregate learners, include zero XP and tie; ignore invalid and out-of-week XP', () => {
  const result = leaderboard(['alice', 'bob', 'carol', 'neverLoggedIn'].map(username => ({ username })), [
    account('alice', {
      'csf-progress-v1': progress({ '2026-11-02': 10, '2026-11-07': 20, '2026-11-08': 900, '2026-11-01': 800 }),
      'csf-progress-v1:learner:child-2': progress({ '2026-11-03': 30, '2026-11-04': -5, '2026-11-05': '100', '2026-11-06': 1.5 }),
      'csf-progress-v1:learner:broken': '{',
      'csf-progress-v1:learner:empty': 'null',
      'csf-progress-v1:learner:array': progress([]),
      'csf-other': progress({ '2026-11-02': 999 }),
    }),
    account('bob', { 'csf-progress-v1': progress({ '2026-11-02': 60 }) }),
    account('carol', { 'csf-progress-v1': progress({ '2026-11-02': 5 }) }),
    account('removed', { 'csf-progress-v1': progress({ '2026-11-02': 999 }) }),
  ], new Date('2026-11-07T12:00:00Z'));
  assert.equal(result.weekStart, '2026-11-02');
  assert.equal(result.weekEnd, '2026-11-08');
  assert.deepEqual(result.rows, [
    { username: 'alice', xp: 60, rank: 1 }, { username: 'bob', xp: 60, rank: 1 },
    { username: 'carol', xp: 5, rank: 3 }, { username: 'neverLoggedIn', xp: 0, rank: 4 },
  ]);
});

test('China Monday rollover and year boundary reuse calendar weeks regardless of server timezone', () => {
  const users = [{ username: 'alice' }];
  const data = [account('alice', { 'csf-progress-v1': progress({ '2026-12-28': 10, '2027-01-03': 20, '2027-01-04': 30 }) })];
  const sunday = leaderboard(users, data, new Date('2027-01-03T15:59:59Z'));
  assert.equal(sunday.weekStart, '2026-12-28');
  assert.equal(sunday.rows[0].xp, 30);
  const monday = leaderboard(users, data, new Date('2027-01-03T16:00:00Z'));
  assert.equal(monday.weekStart, '2027-01-04');
  assert.equal(monday.rows[0].xp, 30);
});
