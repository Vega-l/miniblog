# Miniblog

一个前后端分离的小型发布页：Vue 3 + Pinia 前端，Hono 提供的 RESTful 后端，数据存在服务端内存里。
浏览器不再保存任何业务数据，刷新页面靠 Cookie 会话保持登录。

项目以 TDD 方式推进：`tests/` 下的 182 个用例先于实现编写，覆盖路由契约、校验与错误码、内存存储、API 客户端错误映射、store 并发与回滚、组件交互。

## 功能

- **账号**：注册、登录、退出，用户名唯一（不区分大小写），密码加盐哈希后只存在服务端
- **发布**：登录后可发布，单条上限 280 字，空内容不可提交
- **时间线**：按发布时间倒序展示，最新在最上面
- **评论**：每条动态可展开评论，评论上限 140 字，实时更新评论数
- **点赞**：登录后可点赞/取消点赞，重复提交幂等，计数对所有访客可见
- **收藏**：登录后可收藏/取消收藏；个人主页「我的收藏」按收藏时间倒序，可一键定位原帖
- **个人主页**：查看自己发过的帖子、发表过的评论和收藏的帖子，评论与收藏都能定位回原帖
- **游客浏览**：未登录可以看时间线和评论，点发布、评论、点赞或收藏时引导登录
- **持久化**：数据在 API 进程的内存里，刷新页面、重开标签页都还在；重启 API 进程后清空
- **热搜侧栏**：右侧展示全网热搜 TOP 10，可手动刷新，请求失败自动回退缓存或内置数据
- **布局**：双栏（主内容 + 侧栏），1040px 以下侧栏自动沉到内容下方
- **视觉**：新粗野主义 —— 米黄纸感底、3px 黑描边、无模糊硬阴影、黄粉蓝撞色

不含删除、编辑资料、多设备同步。

## 技术栈

| 用途 | 选型 |
| --- | --- |
| 构建与开发服务器 | Vite 8 |
| 视图 | Vue 3（`<script setup>` + Composition API） |
| 状态管理 | Pinia |
| 语言 | TypeScript |
| 后端 | Hono 4 + `@hono/node-server` |
| 存储 | 服务端内存（`Map` / 数组），进程重启即清空 |
| 测试 | Vitest + Vue Test Utils + jsdom / node |

## 目录

```text
miniblog/
├── index.html
├── vite.config.ts          # 构建、别名、/api 代理、Vitest 配置
├── tsconfig.json
├── shared/                 # 前后端共享的唯一事实来源
│   ├── contract.ts         # 长度上限、校验规则、DTO、错误码与状态码
│   └── text.ts             # cleanText：trim + 截断
├── server/                 # Hono RESTful 后端
│   ├── app.ts              # createApp()：全部路由、会话、统一错误处理
│   ├── index.ts            # @hono/node-server 启动入口（默认 8787）
│   ├── store.ts            # createMemoryStore()：users / posts / comments / sessions
│   ├── password.ts         # 随机盐 + SHA-256 + 常量时间比较
│   └── validation.ts       # 用户名 / 昵称 / 密码 / 内容校验
├── scripts/dev.mjs         # 一条命令同时拉起 API 与 Vite
├── public/
│   └── data/trending.json  # 热搜数据源，可替换为自己的接口
├── src/
│   ├── main.ts             # 创建应用、安装 Pinia、引入全局样式
│   ├── App.vue             # 页面骨架：页头、双栏、弹窗、提示条
│   ├── core/               # 不依赖 Vue 的核心层
│   │   ├── api.ts          # HTTP 客户端：URL 构造、Cookie、错误映射
│   │   ├── types.ts        # 从共享契约再导出前端用的类型
│   │   ├── constants.ts    # 从共享契约再导出 LIMITS / 校验规则
│   │   ├── schema.ts       # cleanText 再导出
│   │   ├── trending.ts     # 热搜清洗、内存缓存、超时与降级
│   │   └── format.ts       # 作者、时间展示
│   ├── stores/             # Pinia：auth / blog / engagement / trending / ui
│   ├── components/         # SiteHeader、ComposerBox、PostItem、ProfileView…
│   └── assets/styles.css
└── tests/
    ├── server/             # 路由契约与内存存储（node 环境）
    ├── core/               # API 客户端、清洗、热搜
    ├── stores/             # Pinia store 行为
    ├── components/         # 组件交互
    └── helpers/            # 有状态假后端、Pinia 安装、数据工厂
```

## 本地运行

需要 Node.js 20+（开发时使用 Node 24）。

```bash
npm install
npm run dev         # 同时启动 API(8787) 与 Vite(5173)，/api 走 Vite 代理

npm test            # 全部测试
npm run test:server # 只跑后端用例
npm run test:web    # 只跑前端用例
npm run test:watch  # 监听模式
npm run typecheck   # vue-tsc 类型检查（含 server/ 与 shared/）
npm run build       # 类型检查 + 生产构建，产物在 dist/

npm run start:api   # 只启动后端
npm run dev:api     # 只启动后端（watch）
npm run dev:web     # 只启动前端
```

开发时浏览器只和 `localhost:5173` 打交道，`/api` 由 Vite 代理到 `127.0.0.1:8787`，因此会话 Cookie 是同源的；用 `MINIBLOG_API_TARGET` 可以改代理目标。`npm run preview` 同样带代理。

## REST API

基础路径 `/api`，请求与响应都是 JSON；`204` 无响应体。

| 方法 | 路径 | 鉴权 | 成功 | 主要失败 |
| --- | --- | --- | --- | --- |
| GET | `/api/health` | 否 | 200 `{ status: "ok" }` | - |
| POST | `/api/users` | 否 | 201 `{ user }` + Set-Cookie | 400 `INVALID_INPUT` / 409 `USERNAME_TAKEN` |
| GET | `/api/users` | 否 | 200 `{ users }` | - |
| POST | `/api/session` | 否 | 200 `{ user }` + Set-Cookie | 400 `INVALID_INPUT` / 401 `INVALID_CREDENTIALS` |
| GET | `/api/session` | 否 | 200 `{ user \| null }` | - |
| DELETE | `/api/session` | 否 | 204 | - |
| GET | `/api/posts?authorId=` | 否 | 200 `{ posts }`（倒序） | - |
| POST | `/api/posts` | 是 | 201 `{ post }` | 401 `UNAUTHORIZED` / 400 `INVALID_INPUT` |
| GET | `/api/posts/:postId` | 否 | 200 `{ post }` | 404 `NOT_FOUND` |
| GET | `/api/posts/:postId/comments` | 否 | 200 `{ comments }`（正序） | 404 `NOT_FOUND` |
| POST | `/api/posts/:postId/comments` | 是 | 201 `{ comment }` | 401 / 404 / 400 |
| GET | `/api/comments?authorId=` | 否 | 200 `{ comments }`（正序） | - |
| GET | `/api/engagement` | 否 | 200 `{ engagement }`（点赞总数 + 本人点赞/收藏） | - |
| PUT | `/api/posts/:postId/like` | 是 | 200 `{ like }`（幂等） | 401 / 404 |
| DELETE | `/api/posts/:postId/like` | 是 | 200 `{ like }`（幂等） | 401 / 404 |
| PUT | `/api/posts/:postId/bookmark` | 是 | 200 `{ bookmark }`（幂等） | 401 / 404 |
| DELETE | `/api/posts/:postId/bookmark` | 是 | 200 `{ bookmark }`（幂等） | 401 / 404 |

错误响应统一为：

```json
{ "error": { "code": "INVALID_INPUT", "message": "请输入内容" } }
```

错误码：`INVALID_INPUT`(400)、`INVALID_CREDENTIALS`(401)、`UNAUTHORIZED`(401)、`NOT_FOUND`(404)、`USERNAME_TAKEN`(409)、`INTERNAL`(500)，请求体超过 16KB 返回 413。未捕获异常只回「服务器内部错误」，堆栈仅进服务端日志。

`shared/contract.ts` 是前后端唯一的契约来源：长度上限、用户名校验正则、DTO、错误码与对应状态码都在这里，改一处两边同时生效。

### 会话

- `HttpOnly`、`SameSite=Lax`、`Path=/`、`Max-Age=7 天` 的 `miniblog_session` Cookie
- 服务端用 `Map<token, userId>` 保存会话，访问时惰性清理过期项；`DELETE /api/session` 同时删 token 与 Cookie
- 注册即登录，与改造前行为一致

### 快速验证

```bash
curl -i http://localhost:5173/api/health
curl -i -c cookie.txt -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret123"}' http://localhost:5173/api/users
curl -i -b cookie.txt -H 'Content-Type: application/json' \
  -d '{"content":"第一条动态"}' http://localhost:5173/api/posts
# 点赞 / 收藏（把 <postId> 换成上一步返回的 id）
curl -i -b cookie.txt -X PUT http://localhost:5173/api/posts/<postId>/like
curl -i -b cookie.txt -X PUT http://localhost:5173/api/posts/<postId>/bookmark
curl -i -b cookie.txt http://localhost:5173/api/engagement
```

## 数据与校验

- 用户、帖子、评论、会话全部在 `createMemoryStore()` 里，每个 `createApp()` 默认一份，用例之间天然隔离
- 想换成数据库或文件持久化：实现 `MemoryStore` 接口即可，路由层不用改
- 用户名 2–16 位汉字/字母/数字/下划线，大小写不敏感唯一；密码 6–64 位；昵称 ≤ 16 字，缺省等于用户名
- 帖子与评论 trim 后按上限截断（280 / 140），trim 后为空返回 400
- 帖子按 `createdAt` 倒序、同毫秒按创建顺序稳定；评论正序
- 点赞按「帖子 + 用户」去重，收藏同理；重复 `PUT` 幂等，`DELETE` 不存在的记录也返回成功
- 点赞总数对所有人可见；`likedPostIds` 与 `bookmarks` 只返回当前会话用户的数据，游客拿到空数组
- 收藏按 `createdAt` 倒序，同毫秒按收藏顺序倒序
- `PublicUser` 只含 `id / username / displayName / createdAt`，`salt` 与 `passwordHash` 永远不出现在响应里

## 前端数据流

- `src/core/api.ts` 是唯一出口：统一 `credentials: 'include'`、`Accept: application/json`，把 HTTP 错误映射成 `ApiError`（`code` / `status` / `message`），网络故障标记为 `NETWORK`
- `useAuthStore` 并发拉取会话与用户列表；`register` / `login` 成功后刷新用户列表并重拉时间线
- `useBlogStore` 的写入以**服务端返回值**为准，不本地生成 id 与时间
- `hydrate()` 带请求序号，并与本地新增项按 `id` 合并：请求在途时刚发布的帖子不会被旧快照覆盖
- `useEngagementStore` 负责点赞与收藏：`hydrate()` 只采纳最后一次响应，登录后重新拉取、退出登录立即清空
- 点赞/收藏以服务端返回的计数与状态为准，失败只提示、不做乐观更新，避免界面与后端不一致
- 失败时保留旧数据并给出可读提示，避免「界面有、刷新就没」

## 热搜数据

侧栏读取同源的 `public/data/trending.json`，格式：

```json
{
  "updatedAt": "2026-11-13 09:40",
  "source": "演示数据（可替换为真实接口）",
  "items": [{ "title": "标题", "hot": "982.4万", "tag": "科技" }]
}
```

- 只取前 10 条，`hot`、`tag` 可以省略
- 请求成功后写入**内存缓存**（5 分钟内复用，刷新页面即失效）；失败时先回退缓存（来源标注「缓存」），再回退内置数据
- 请求带 6 秒超时与 `AbortController`
- 换成自己的接口：修改 `src/core/trending.ts` 顶部的 `TRENDING_ENDPOINT`
- 仓库里这份 JSON 是演示内容，不是实时热搜

## TDD 分层

1. `server/` 用例用 `app.request()` 直接驱动 Hono，注入固定时钟与 ID 生成器，覆盖 400/401/404/409/413/500 与 Cookie 属性、会话过期边界
2. `core/api.ts` 用鸭子类型的 `fetch` 替身，覆盖 16 个方法的 URL/方法/请求体、204 不读 body、错误码映射、非 JSON 错误体、网络异常
3. store 用例使用 `tests/helpers/api.ts` 里的有状态假后端（校验规则与真实服务端对齐），可单独注入某个方法失败
4. 组件测试只断言用户可见行为（按钮禁用、文案、评论数、弹窗开合与 `showModal` 调用），不依赖内部实现

失败路径同样是测试目标：未登录写入、帖子不存在、用户名占用、密码错误、请求体超限、接口不可达、hydrate 竞态、退出登录失败。

## 账号的安全边界

这是演示项目，请按以下前提使用：

- 数据只在内存里，重启 API 进程即全部丢失；没有备份与导出
- 密码用随机盐 + 单轮 SHA-256（非 bcrypt/scrypt/argon2），仅作演示，**不要使用任何真实密码**
- Cookie 没有 `Secure` 标记，因为本地是 HTTP；上线必须启用 HTTPS 并补上 `Secure`（或 `__Host-` 前缀）
- 没有找回密码、邮箱验证、频率限制、CSRF token（依赖 `SameSite=Lax` 缓解）
- 模板插值代替 `innerHTML`，配合 `white-space: pre-wrap` 保留换行，天然规避 HTML 注入

## 部署

前端 `npm run build` 输出 `dist/`，作为静态站点根目录发布；后端用 `npm run start:api` 常驻（或先用 `tsx`/`tsc` 编译成 JS）。
生产环境建议由一个反向代理同域转发：`/` 指向 `dist/`，`/api` 指向 API 进程，这样 Cookie 才是同源的。

## 许可

仅供学习与个人演示使用。页面不包含任何第三方平台的名称、图标或标识。
