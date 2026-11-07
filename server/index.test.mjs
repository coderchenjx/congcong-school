import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { createApi } from './index.mjs';
import { hashPassword } from './auth.mjs';

test('authenticated account persistence, isolation, conflicts and revocation', async t => {
  const scratch = resolve('.agent-work');
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(join(scratch, 'account-api-test-'));
  const usersPath = join(dir, 'users.json');
  const users = await Promise.all(['alice', 'bob'].map(async username => ({ username, passwordHash: await hashPassword('test-password') })));
  await writeFile(usersPath, JSON.stringify(users));
  const options = { usersPath, databasePath: join(dir, 'data.sqlite'), origin: 'http://localhost:3000' };
  let server = await createApi(options);
  async function listen() { server.listen(0, '127.0.0.1'); await once(server, 'listening'); }
  async function close() { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  await listen();
  t.after(async () => { await close(); await rm(dir, { recursive: true }); });
  async function request(path, { method = 'GET', cookie = '', body, origin = options.origin, username = '' } = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
      method, headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie, 'X-CSF-User': username },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  assert.equal((await request('data')).status, 401);
  assert.equal((await request('leaderboard')).status, 401);
  assert.equal((await request('login', { method: 'POST', body: { username: 'alice', password: 'wrong' } })).status, 401);
  assert.equal((await request('login', { method: 'POST', body: { username: 'alice', password: 'test-password' }, origin: 'https://other.example' })).status, 403);
  const alice = await request('login', { method: 'POST', body: { username: 'alice', password: 'test-password' } });
  assert.equal(alice.status, 200);
  assert.match(alice.cookie, /HttpOnly; SameSite=Strict/);
  assert.match(alice.cookie, /Path=\/;/);
  const cookie = alice.cookie.split(';')[0];
  const initialBoard = await request('leaderboard', { cookie });
  assert.equal(initialBoard.status, 200);
  assert.equal(initialBoard.data.username, 'alice');
  assert.deepEqual(initialBoard.data.rows, [{ username: 'alice', xp: 0, rank: 1 }, { username: 'bob', xp: 0, rank: 1 }]);
  assert.deepEqual((await request('data', { cookie })).data, { username: 'alice', revision: 0, data: {} });
  const data = { 'csf-progress-v1': JSON.stringify({ version: 13, state: { xp: 123 } }), 'csf-learners-v1': '[]' };
  assert.equal((await request('data', { cookie, method: 'PUT', body: { revision: 0, data: { bad: 123 } } })).status, 400);
  assert.equal((await request('data', { cookie, method: 'PUT', username: 'bob', body: { revision: 0, data } })).status, 401);
  assert.equal((await request('data', { cookie, method: 'PUT', username: 'alice', body: { revision: 0, data } })).status, 200);
  assert.equal((await request('data', { cookie, method: 'PUT', body: { revision: 0, data: {} } })).status, 409);
  const bob = await request('login', { method: 'POST', body: { username: 'bob', password: 'test-password' } });
  const bobCookie = bob.cookie.split(';')[0];
  assert.deepEqual((await request('data', { cookie: bobCookie })).data.data, {});
  assert.deepEqual((await request('data', { cookie })).data.data, data);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const rankedData = { ...data, 'csf-progress-v1': JSON.stringify({ state: { xpHistory: { [today]: 42 }, privateNote: 'must stay private' } }) };
  assert.equal((await request('data', { cookie: bobCookie, method: 'PUT', body: { revision: 0, data: rankedData } })).status, 200);
  const updatedBoard = (await request('leaderboard', { cookie })).data;
  assert.deepEqual(updatedBoard.rows, [{ username: 'bob', xp: 42, rank: 1 }, { username: 'alice', xp: 0, rank: 2 }]);
  assert.equal(JSON.stringify(updatedBoard).includes('privateNote'), false);
  await writeFile(usersPath, JSON.stringify([users[0]]));
  assert.deepEqual((await request('leaderboard', { cookie })).data.rows, [{ username: 'alice', xp: 0, rank: 1 }]);
  await writeFile(usersPath, JSON.stringify(users));
  // The database and session survive a complete API process lifecycle.
  await close(); server = await createApi(options); await listen();
  assert.deepEqual((await request('data', { cookie })).data.data, data);
  const otherDevice = await request('login', { method: 'POST', body: { username: 'alice', password: 'test-password' } });
  assert.deepEqual((await request('data', { cookie: otherDevice.cookie.split(';')[0] })).data.data, data);
  await request('logout', { method: 'POST', cookie: bobCookie });
  assert.equal((await request('data', { cookie: bobCookie })).status, 401);
  users[0].passwordHash = await hashPassword('changed-password');
  await writeFile(usersPath, JSON.stringify(users));
  assert.equal((await request('data', { cookie })).status, 401, 'password reset revokes old sessions');
  await writeFile(usersPath, '[]');
  assert.equal((await request('login', { method: 'POST', body: { username: 'alice', password: 'changed-password' } })).status, 401);
  for (let i = 0; i < 9; i++) await request('login', { method: 'POST', body: { username: 'missing', password: 'wrong' } });
  assert.equal((await request('login', { method: 'POST', body: { username: 'missing', password: 'wrong' } })).status, 429);
});
