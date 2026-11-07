import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDatabase } from './database.mjs';
import { usernamePattern } from './auth.mjs';

/** Import an offline backup of the previous Python API without changing it. */
export function migratePrivate(sourcePath, targetPath, usersPath) {
  if ([targetPath, usersPath].some(existsSync)) throw new Error('目标数据库或用户配置已存在，迁移不会覆盖已有文件');
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  const users = source.prepare('SELECT id, username, password, active FROM users ORDER BY id').all();
  const records = [];
  const credentials = [];
  for (const user of users) {
    if (!usernamePattern.test(user.username)) throw new Error('旧账号名称不符合新版本规则，请先检查账号配置');
    const parts = user.password.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') throw new Error('旧密码哈希格式不支持');
    const salt = Buffer.from(parts[1], 'base64'), key = Buffer.from(parts[2], 'base64');
    if (salt.length !== 16 || key.length !== 64) throw new Error('旧密码哈希长度不正确');
    if (user.active) credentials.push({ username: user.username, passwordHash: `scrypt-raw:${salt.toString('hex')}:${key.toString('hex')}` });
    const entries = source.prepare('SELECT key, value FROM state WHERE user_id = ? AND value IS NOT NULL').all(user.id);
    if (entries.some(entry => !/^(?:csf|cstf)-[a-zA-Z0-9_:.-]{1,200}$/.test(entry.key) || typeof entry.value !== 'string')) {
      throw new Error('旧账号存档包含不支持的键或值');
    }
    const data = JSON.stringify(Object.fromEntries(entries.map(entry => [entry.key, entry.value])));
    if (Buffer.byteLength(data) > 10 * 1024 * 1024) throw new Error('旧账号存档超过新 API 的 10 MiB 限制');
    records.push([user.username, data]);
  }
  source.close();
  const target = openDatabase(targetPath);
  target.exec('BEGIN');
  const insert = target.prepare('INSERT INTO accounts (username, data) VALUES (?, ?)');
  for (const record of records) insert.run(...record);
  target.exec('COMMIT');
  target.close();
  mkdirSync(dirname(usersPath), { recursive: true });
  writeFileSync(usersPath, `${JSON.stringify(credentials, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return { accounts: records.length, allowedUsers: credentials.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 3) throw new Error('用法: node server/migrate-private.mjs <旧数据库备份> <新数据库> <新用户配置>');
  console.log(migratePrivate(...args.map(path => resolve(path))));
}
