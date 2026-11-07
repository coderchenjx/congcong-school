import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';

const scrypt = promisify(scryptCallback);
export const usernamePattern = /^[a-zA-Z0-9_-]{1,64}$/;

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

export async function verifyPassword(password, encoded) {
  const [scheme, salt, expected] = encoded.split(':');
  // The previous Python deployment used raw salt bytes with the same scrypt parameters.
  const actual = await scrypt(password, scheme === 'scrypt-raw' ? Buffer.from(salt, 'hex') : salt, 64);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}

export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

export async function readUsers(path) {
  const users = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(users) || users.some(user => !user ||
    typeof user.username !== 'string' || !usernamePattern.test(user.username) ||
    typeof user.passwordHash !== 'string' || !/^scrypt(?:-raw)?:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash)) ||
    new Set(users.map(user => user.username)).size !== users.length) {
    throw new Error('用户配置必须是用户名唯一、包含 username 和 scrypt passwordHash 的数组');
  }
  return users;
}
