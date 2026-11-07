import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { hashPassword, readUsers, usernamePattern } from './auth.mjs';

// Run from the repository root; USER_CONFIG can select a different private file.
const path = resolve(process.env.USER_CONFIG || 'server/private/users.json');
const [command, username] = process.argv.slice(2);
if (!['set', 'remove', 'list'].includes(command) || (command !== 'list' && !usernamePattern.test(username ?? ''))) {
  console.error('用法: node server/users.mjs set|remove <用户名>，或 node server/users.mjs list');
  process.exit(1);
}
let users;
try { users = await readUsers(path); }
catch (error) { if (error.code !== 'ENOENT') throw error; users = []; }
if (command === 'list') {
  console.log(users.map(user => user.username).join('\n'));
} else {
  users = users.filter(user => user.username !== username);
  let password;
  if (command === 'set') {
    password = randomBytes(18).toString('base64url');
    users.push({ username, passwordHash: await hashPassword(password) });
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(users, null, 2)}\n`, { mode: 0o600 });
  console.log(command === 'set' ? `用户名: ${username}\n新密码（请妥善保存）: ${password}` : `已移除用户: ${username}`);
}
