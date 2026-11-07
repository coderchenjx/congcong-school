# 网页端账号与服务端存档

网页端需要登录后使用。账号由管理员配置，没有注册入口；iOS/Android 本轮不变。每个账号可以建立多个孩子档案，进度、错题、奖励、设置、题目反馈及阅读/复习草稿保存在服务端 SQLite 中。录音仍只在浏览器中回放，不上传。

不自动读取或迁移旧浏览器记录。新账号从空白档案开始，页面原有的中立存档导入/导出仍然可用。

## 本地开发（Node.js 24）

在仓库根目录执行：

```sh
npm ci
npm run users -- set learner
npm run start:api
```

`set` 创建账号或重置密码，输出一次随机生成的新密码。用户名允许 1–64 位英文字母、数字、下划线和短横线。密码以带随机盐的 scrypt 哈希保存，不写入前端代码。请保存命令输出的密码，勿提交或公开。

另外一个终端执行 `npm run dev`，打开 <http://localhost:3000>。现有资源准备流程不变；教材、配图和音频仍须按原说明安装。Next 开发服务器将 `/api/` 转发到本机 3001 端口。

管理员命令：

```sh
npm run users -- list
npm run users -- set learner
npm run users -- remove learner
```

配置变更在后续请求生效，无需重启 API。重置密码或移除用户会立即使其旧会话失效；移除账号保留数据库中的存档，以同名重建账号会重新获得该存档。

默认私有文件：`server/private/users.json`（允许登录的用户）、`server/private/progress.sqlite`（账号存档及登录会话）。目录已加入 Git 和 Docker 构建上下文的忽略规则。

## Docker 部署

先构建 API 镜像并创建允许登录的账号，不需要在宿主机安装 Node.js。以下命令可在 PowerShell 或常规 shell 中运行：

```sh
docker compose build api
docker compose run --rm --no-deps --user root -v ./server/private:/app/config:rw api sh -c 'node server/users.mjs set learner && chown node:node /app/config/users.json'
docker compose build web --build-arg ASSETS_RELEASE=v1.8.3
docker compose up -d --no-build --wait --wait-timeout 120
```

第二条命令输出新账号的密码。API 运行时以非 root 用户读取配置；管理命令临时以 root 写入绑定目录，并将配置文件所有权交还给运行用户。将 `set learner` 换成 `remove learner` 或 `list` 可管理现有账号。重置密码重复执行 `set` 命令即可。

打开 <http://localhost:8080> 登录。Nginx 同源代理 `/api/`，API 端口不直接发布到宿主机。`learning-data` 命名卷持久保存数据库，替换或重建容器不丢数据。不要使用 `docker compose down -v`，它会删除数据卷。

修改访问地址时，在仓库 `.env` 设置实际网页来源（协议、主机和端口，不带末尾 `/`），然后重新创建容器：

```dotenv
WEB_ORIGIN=https://school.example.com
COOKIE_SECURE=true
```

正式部署通过 HTTPS 反向代理访问，启用 `COOKIE_SECURE=true`。本机 HTTP 开发保持 `false`。`WEB_ORIGIN` 必须与浏览器地址完全一致，用于拒绝跨站写请求。

## 环境变量

| 变量 | 本机默认值 | 用途 |
| --- | --- | --- |
| `USER_CONFIG` | `server/private/users.json` | API 和账号管理命令读取的用户配置路径 |
| `DATABASE_PATH` | `server/private/progress.sqlite` | SQLite 路径 |
| `API_HOST` | `127.0.0.1` | API 监听地址；容器设为 `0.0.0.0` |
| `API_PORT` | `3001` | API 监听端口；Next 开发代理使用 3001 |
| `WEB_ORIGIN` | `http://localhost:3000` | 唯一允许写操作的网页来源；Compose 默认 `http://localhost:8080` |
| `COOKIE_SECURE` | `false` | HTTPS 部署设为 `true` |

Compose 内的配置和数据库路径分别固定为 `/app/config/users.json` 与 `/app/storage/progress.sqlite`，对应绑定目录和命名卷。

## 保存与多设备使用

登录通过 HttpOnly、SameSite Cookie 保持 7 天，退出会在服务器销毁会话。页面先读取服务端数据，再启动进度和奖励逻辑。用户数据不再写入 localStorage；sessionStorage 仅按账号记录当前标签页选择的孩子。

页面顶部显示保存状态。操作后合并 400 毫秒内的连续变更再保存；退出登录、切换孩子和导入后刷新都会先等保存完成。关闭页面时如有未保存内容，浏览器会尝试提醒；移动浏览器直接终止进程无法保证触发此提醒，应以“已保存到服务端”为准。

打开另一设备后会读取最新已保存的存档。已打开的页面不实时合并其他设备的更改：若存档版本发生冲突，服务器拒绝旧版本覆盖，页面提示下载未保存记录并刷新。建议同一账号同一时间只在一个页面学习；更换设备前先等保存完成，返回旧页面时刷新。

断网或服务错误会保留当前页面内存中的记录并提示重试，恢复联网时会尝试保存。请保存成功后再离开；冲突或网络故障时可下载完整账户恢复文件。恢复文件是包含所有孩子档案的原始存储快照，供管理员恢复使用，与“我的”页的单孩子中立存档格式不同；不要在普通导入入口导入。管理员应先备份数据库，再从恢复文件取 `data` 更新该用户 `accounts.data` 并将 `revision` 加一，随后让该用户所有页面刷新。

单个账号存档上限 10 MiB。登录失败按来源限制为每 15 分钟 10 次。Nginx 对教材 JSON、音频、故事配图和课本原页检查登录状态；Service Worker 不缓存这些受保护资源及 API。页面代码、登录界面和图标保持公开。静态托管或旧 Release 的现成网站无法单独提供这些 API，部署当前网页必须配套本 API 与同源代理。

## 从旧 Python 私有版升级

这与浏览器旧记录迁移不同：现有服务器账号及学习记录需要保留。先使用旧 API 的 `python app.py --backup <路径>` 生成一致性 SQLite 备份，在停止旧 API 后对最终备份执行：

```sh
node server/migrate-private.mjs old-backup.sqlite3 new-progress.sqlite users.json
```

迁移工具只读取旧备份，将每个账号的非空存储键值原样复制到新库；仅将仍启用的用户加入允许登录配置，保留其原 scrypt 密码，不迁移会话。目标文件必须尚不存在。迁移后用户重新登录，原账号密码继续有效。旧数据库和镜像应保留用于回退；先在独立测试端口验证，再切换生产配置。

已有服务器可使用 `deploy/server/compose.yaml` 和同目录的 `env.example`：按发布版本指定 API 镜像、前端目录及 Nginx 配置，同时复用现有 `RESOURCE_DIR` 媒体目录。账号数据和配置分别挂载到独立持久目录。`WEB_LISTEN` 可设置为 `127.0.0.1:18080`，先用不同 Compose 项目名验证候选版本；切换生产时保留原项目名与访问端口。此配置沿用只读容器根目录、tmpfs 和日志轮转。

## 备份与验证

本机可停止 API 后复制整个 `server/private/`。Docker 应停止 API，备份 `learning-data` 卷及 `server/private/users.json` 后再启动；不要仅在运行中复制 SQLite 主文件而遗漏 WAL。更改 Compose 项目名会选择另一个命名卷，部署升级应保留原项目名。

```sh
npm run test:server
npm run check:account-storage
npx tsx scripts/checks/learner-profiles.ts
npm run type-check
```

`/api/health` 可检查 API 存活；实际登录和读写仍应单独验收。

## 真实用户排行榜（v1.9.1）

登录后访问 `/league/`，即可查看所有服务器允许登录账号的本周 XP；尚未登录或没有学习记录的账号显示 0 XP。每个账号一行，合计其所有孩子档案的已保存 `xpHistory`。按北京时间周一至周日统计，只计截至当天的记录；同分并列（例如 1、1、3），同分用户按用户名排序。管理员移除账号后，该账号立即退出榜单。

网页进入排行榜、重新切回页面、点击刷新及页面可见时每 30 秒会更新排名，查询前先保存当前账号的待保存数据。接口 `GET /api/leaderboard` 需要登录，只公开用户名、名次、周 XP 和统计日期，不返回孩子姓名或学习详情。损坏的进度 JSON、非整数或负数日 XP 不参与统计。

网页不再使用影子同学、10 节课解锁和模拟联赛自动奖励；历史段位和已获得的奖励仍保留在存档中。此榜根据用户保存或导入的学习记录计算，未实现服务器逐题核算或防作弊。
