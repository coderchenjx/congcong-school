import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { hashPassword, readUsers, tokenHash, verifyPassword, usernamePattern } from './auth.mjs';
import { openDatabase } from './database.mjs';

const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 登录有效期：7 天。
const MAX_BODY = 10 * 1024 * 1024; // 含错题快照的整份账户存档，最多 10 MiB。
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 同一来源每 15 分钟最多 10 次失败登录。

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function jsonBody(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, '请提交 JSON');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, '存档超过 10 MiB 限制');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'JSON 格式错误'); }
}

// Storage values remain strings, matching the existing Web Storage contract.
function validateData(body) {
  if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 ||
    !body.data || typeof body.data !== 'object' || Array.isArray(body.data) ||
    Object.entries(body.data).some(([key, value]) =>
      !/^(?:csf|cstf)-[a-zA-Z0-9_:.-]{1,200}$/.test(key) || typeof value !== 'string')) {
    throw new HttpError(400, '存档格式错误');
  }
  return body;
}

export async function createApi({
  databasePath = resolve(process.env.DATABASE_PATH || 'server/private/progress.sqlite'),
  usersPath = resolve(process.env.USER_CONFIG || 'server/private/users.json'),
  origin = process.env.WEB_ORIGIN || 'http://localhost:3000',
  secureCookie = process.env.COOKIE_SECURE === 'true',
} = {}) {
  await readUsers(usersPath); // 配置错误在启动时直接报错，不静默启用匿名模式。
  const db = openDatabase(databasePath);
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  const failures = new Map();
  const cookie = (value, age) => `csf_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookie ? '; Secure' : ''}`;

  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => { response.writeHead(status); response.end(JSON.stringify(data)); };
    try {
      const path = new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '');
      const method = request.method;
      if (method === 'GET' && path === '/api/health') { send(200, { ok: true }); return; }
      if (['POST', 'PUT', 'DELETE'].includes(method) && request.headers.origin !== origin) {
        throw new HttpError(403, '请求来源不允许，请检查 WEB_ORIGIN 配置');
      }
      const users = await readUsers(usersPath);
      const token = /(?:^|;\s*)csf_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
      const session = token ? db.prepare('SELECT * FROM sessions WHERE token = ? AND expires > ?').get(tokenHash(token), Date.now()) : undefined;
      const user = session && users.find(user => user.username === session.username && user.passwordHash === session.credential);

      if (method === 'POST' && path === '/api/login') {
        const now = Date.now();
        for (const [ip, failure] of failures) if (failure.until <= now) failures.delete(ip);
        // The API port is private in Compose; nginx replaces X-Real-IP.
        const ip = request.headers['x-real-ip'] || request.socket.remoteAddress;
        const failure = failures.get(ip);
        if (failure?.count >= 10) throw new HttpError(429, '登录尝试过多，请 15 分钟后重试');
        const body = await jsonBody(request);
        if (!body || typeof body.username !== 'string' || !usernamePattern.test(body.username) ||
          typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 256) {
          throw new HttpError(400, '请输入有效的用户名和密码');
        }
        const account = users.find(user => user.username === body.username);
        const valid = await verifyPassword(body.password, account?.passwordHash || dummyHash);
        if (!account || !valid) {
          failures.set(ip, { count: (failure?.count || 0) + 1, until: failure?.until || now + LOGIN_WINDOW_MS });
          throw new HttpError(401, '用户名或密码错误');
        }
        failures.delete(ip);
        db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now);
        if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(token));
        const nextToken = randomBytes(32).toString('hex');
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(tokenHash(nextToken), account.username, account.passwordHash, now + SESSION_MS);
        db.prepare('INSERT OR IGNORE INTO accounts (username) VALUES (?)').run(account.username);
        response.setHeader('Set-Cookie', cookie(nextToken, SESSION_MS / 1000));
        send(200, { username: account.username }); return;
      }
      if (method === 'POST' && path === '/api/logout') {
        if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(tokenHash(token));
        response.setHeader('Set-Cookie', cookie('', 0));
        send(200, { ok: true }); return;
      }
      if (!user) throw new HttpError(401, '请登录后继续');
      if (request.headers['x-csf-user'] && request.headers['x-csf-user'] !== user.username) {
        throw new HttpError(401, '登录账号已改变，请下载未保存记录后刷新');
      }
      if (method === 'GET' && path === '/api/session') { send(200, { username: user.username }); return; }
      if (method === 'GET' && path === '/api/data') {
        const account = db.prepare('SELECT data, revision FROM accounts WHERE username = ?').get(user.username);
        send(200, { username: user.username, data: JSON.parse(account.data), revision: account.revision }); return;
      }
      if (method === 'PUT' && path === '/api/data') {
        const body = validateData(await jsonBody(request));
        // Compare-and-swap prevents an older open tab/device from replacing newer progress.
        const result = db.prepare('UPDATE accounts SET data = ?, revision = revision + 1 WHERE username = ? AND revision = ?')
          .run(JSON.stringify(body.data), user.username, body.revision);
        if (!result.changes) throw new HttpError(409, '其他页面已更新存档，请导出当前记录后刷新');
        send(200, { revision: body.revision + 1 }); return;
      }
      throw new HttpError(404, '接口不存在');
    } catch (error) {
      if (!(error instanceof HttpError)) console.error(error);
      send(error instanceof HttpError ? error.status : 500, { error: error instanceof HttpError ? error.message : '服务暂时不可用，请联系管理员' });
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const server = await createApi();
  const port = Number(process.env.API_PORT || 3001);
  server.listen(port, process.env.API_HOST || '127.0.0.1', () => console.log(`学习数据 API 已启动，端口 ${port}`));
}
