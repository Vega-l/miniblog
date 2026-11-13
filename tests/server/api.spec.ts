// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type ApiErrorBody,
  type Comment,
  type EngagementSummary,
  type Post,
  type PublicUser,
} from '../../shared/contract';
import { createApp } from '../../server/app';
import { createMemoryStore } from '../../server/store';

const BASE_TIME = 1_700_000_000_000;

type App = ReturnType<typeof createApp>;

interface Harness {
  app: App;
  clock: { now: number };
  advance: (ms: number) => void;
}

function createHarness(): Harness {
  const clock = { now: BASE_TIME };
  // 按前缀独立计数，断言里的 user_1 / post_1 才稳定
  const counters = new Map<string, number>();
  const makeId = (prefix: string): string => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}_${next}`;
  };

  return {
    app: createApp({
      clock: () => clock.now,
      makeId,
    }),
    clock,
    advance: (ms) => {
      clock.now += ms;
    },
  };
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  rawBody?: string;
  cookie?: string;
}

async function call(app: App, path: string, options: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  const hasBody = options.body !== undefined || options.rawBody !== undefined;
  if (hasBody) headers['content-type'] = 'application/json';
  if (options.cookie) headers.cookie = options.cookie;

  const method = options.method ?? (hasBody ? 'POST' : 'GET');
  const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));

  return app.request(path, { method, headers, body });
}

/** 取出 Set-Cookie 的 `name=value` 部分，同时确认 Cookie 名正确。 */
function sessionCookie(res: Response): string {
  const pair = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  expect(pair.startsWith(`${SESSION_COOKIE}=`)).toBe(true);
  return pair;
}

async function signUp(app: App, patch: Record<string, unknown> = {}): Promise<string> {
  const res = await call(app, '/api/users', {
    body: { username: 'alice', password: 'secret1', ...patch },
  });
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

describe('GET /api/health', () => {
  it('返回 {status:"ok"}', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/health');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});

describe('POST /api/users', () => {
  it('注册成功返回 201 与公开用户字段', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', { body: { username: 'alice', password: 'secret1' } });

    expect(res.status).toBe(201);
    const payload = (await res.json()) as { user: PublicUser };
    expect(payload.user).toEqual({
      id: 'user_1',
      username: 'alice',
      displayName: 'alice',
      createdAt: BASE_TIME,
    });
    expect(Object.keys(payload.user).sort()).toEqual(['createdAt', 'displayName', 'id', 'username']);
  });

  it('显式 displayName 按提供值保存', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', {
      body: { username: 'alice', displayName: '爱丽丝', password: 'secret1' },
    });

    const payload = (await res.json()) as { user: PublicUser };
    expect(payload.user.displayName).toBe('爱丽丝');
  });

  it('响应体不含 salt / passwordHash，并直接建立会话', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', { body: { username: 'alice', password: 'secret1' } });
    const raw = await res.text();
    const cookie = res.headers.get('set-cookie') ?? '';

    expect(raw).not.toContain('salt');
    expect(raw).not.toContain('passwordHash');
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
  });

  it('用户名过短 → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', { body: { username: 'a', password: 'secret1' } });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as ApiErrorBody;
    expect(payload.error.code).toBe('INVALID_INPUT');
    expect(payload.error.message).toContain('用户名需为');
  });

  it('用户名含非法字符 → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', { body: { username: 'bad name', password: 'secret1' } });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('INVALID_INPUT');
  });

  it('密码过短 → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', { body: { username: 'alice', password: '12345' } });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as ApiErrorBody;
    expect(payload.error.code).toBe('INVALID_INPUT');
    expect(payload.error.message).toContain('密码至少');
  });

  it('密码超过 64 位 → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', { body: { username: 'alice', password: 'p'.repeat(65) } });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.message).toContain('密码最多');
  });

  it('昵称超长 → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', {
      body: { username: 'alice', displayName: '字'.repeat(17), password: 'secret1' },
    });

    expect(res.status).toBe(400);
    const payload = (await res.json()) as ApiErrorBody;
    expect(payload.error.code).toBe('INVALID_INPUT');
    expect(payload.error.message).toContain('昵称最多');
  });

  it('重名（大小写不同）→ 409 USERNAME_TAKEN', async () => {
    const { app } = createHarness();
    await signUp(app, { username: 'alice' });

    const res = await call(app, '/api/users', { body: { username: 'ALICE', password: 'secret1' } });
    expect(res.status).toBe(409);
    expect(((await res.json()) as ApiErrorBody).error).toEqual({
      code: 'USERNAME_TAKEN',
      message: '该用户名已被占用',
    });
  });
});

describe('POST /api/session', () => {
  it('登录成功 → 200 + 带 HttpOnly 的会话 Cookie', async () => {
    const { app } = createHarness();
    await signUp(app);

    const res = await call(app, '/api/session', { body: { username: 'alice', password: 'secret1' } });
    expect(res.status).toBe(200);

    const payload = (await res.json()) as { user: PublicUser };
    expect(payload.user.username).toBe('alice');

    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_MS / 1000}`);
  });

  it('用户名大小写不敏感', async () => {
    const { app } = createHarness();
    await signUp(app);

    const res = await call(app, '/api/session', { body: { username: 'ALICE', password: 'secret1' } });
    expect(res.status).toBe(200);
  });

  it('密码错误 → 401 INVALID_CREDENTIALS', async () => {
    const { app } = createHarness();
    await signUp(app);

    const res = await call(app, '/api/session', {
      body: { username: 'alice', password: 'wrong-pass' },
    });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('用户不存在 → 401 INVALID_CREDENTIALS', async () => {
    const { app } = createHarness();

    const res = await call(app, '/api/session', { body: { username: 'ghost', password: 'secret1' } });
    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('密码超长 → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();
    await signUp(app);

    const res = await call(app, '/api/session', {
      body: { username: 'alice', password: 'p'.repeat(65) },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.message).toContain('密码最多');
  });

  it('缺少字段 → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();

    const res = await call(app, '/api/session', { body: { username: 'alice' } });
    expect(res.status).toBe(400);
    const payload = (await res.json()) as ApiErrorBody;
    expect(payload.error.code).toBe('INVALID_INPUT');
    expect(payload.error.message).toContain('请输入用户名和密码');
  });
});

describe('会话', () => {
  it('带 Cookie 返回当前用户', async () => {
    const { app } = createHarness();
    const cookie = await signUp(app);

    const res = await call(app, '/api/session', { cookie });
    expect(res.status).toBe(200);

    const payload = (await res.json()) as { user: PublicUser | null };
    expect(payload.user?.username).toBe('alice');
    expect(Object.keys(payload.user ?? {}).sort()).toEqual([
      'createdAt',
      'displayName',
      'id',
      'username',
    ]);
  });

  it('不带 Cookie 返回 user: null', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/session');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null });
  });

  it('DELETE 后旧 Cookie 失效', async () => {
    const { app } = createHarness();
    const cookie = await signUp(app);

    const res = await call(app, '/api/session', { method: 'DELETE', cookie });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');

    const after = await call(app, '/api/session', { cookie });
    expect(await after.json()).toEqual({ user: null });
  });

  it('推进 7 天后会话过期', async () => {
    const { app, advance } = createHarness();
    const cookie = await signUp(app);

    advance(SESSION_TTL_MS - 1);
    expect(await (await call(app, '/api/session', { cookie })).json()).not.toEqual({ user: null });

    advance(1);
    expect(await (await call(app, '/api/session', { cookie })).json()).toEqual({ user: null });
  });
});

describe('帖子', () => {
  it('未登录发帖 → 401 UNAUTHORIZED', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/posts', { body: { content: '你好' } });

    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('登录后发帖 201，内容 trim 且 authorId 正确', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts', { cookie, body: { content: '  第一条动态  ' } });
    expect(res.status).toBe(201);

    const payload = (await res.json()) as { post: Post };
    expect(payload.post).toEqual({
      id: 'post_1',
      authorId: 'user_1',
      content: '第一条动态',
      createdAt: harness.clock.now,
    });
  });

  it('超长内容截断到 280 字', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts', { cookie, body: { content: 'x'.repeat(300) } });
    const payload = (await res.json()) as { post: Post };
    expect(payload.post.content).toHaveLength(280);
  });

  it('空白内容 → 400 INVALID_INPUT', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts', { cookie, body: { content: '   ' } });
    expect(res.status).toBe(400);
    const payload = (await res.json()) as ApiErrorBody;
    expect(payload.error.code).toBe('INVALID_INPUT');
    expect(payload.error.message).toContain('请输入内容');
  });

  it('列表按 createdAt 倒序，同毫秒按创建顺序稳定', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    await call(harness.app, '/api/posts', { cookie, body: { content: '第一' } });
    await call(harness.app, '/api/posts', { cookie, body: { content: '第二' } });
    harness.advance(1000);
    await call(harness.app, '/api/posts', { cookie, body: { content: '第三' } });

    const res = await call(harness.app, '/api/posts');
    const payload = (await res.json()) as { posts: Post[] };
    expect(payload.posts.map((post) => post.content)).toEqual(['第三', '第二', '第一']);
  });

  it('?authorId= 过滤作者', async () => {
    const harness = createHarness();
    const alice = await signUp(harness.app, { username: 'alice' });
    await call(harness.app, '/api/posts', { cookie: alice, body: { content: 'alice 的帖子' } });

    const bob = await signUp(harness.app, { username: 'bob' });
    await call(harness.app, '/api/posts', { cookie: bob, body: { content: 'bob 的帖子' } });

    const res = await call(harness.app, '/api/posts?authorId=user_1');
    const payload = (await res.json()) as { posts: Post[] };
    expect(payload.posts).toHaveLength(1);
    expect(payload.posts[0].authorId).toBe('user_1');
    expect(payload.posts[0].content).toBe('alice 的帖子');
  });

  it('GET /api/posts/:postId 命中或 404', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const created = await call(harness.app, '/api/posts', { cookie, body: { content: '帖子' } });
    const { post } = (await created.json()) as { post: Post };

    const hit = await call(harness.app, `/api/posts/${post.id}`);
    expect(hit.status).toBe(200);
    expect(((await hit.json()) as { post: Post }).post.id).toBe(post.id);

    const miss = await call(harness.app, '/api/posts/post_missing');
    expect(miss.status).toBe(404);
    expect(((await miss.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });
});

describe('评论', () => {
  async function createPost(harness: Harness, cookie: string): Promise<Post> {
    const res = await call(harness.app, '/api/posts', { cookie, body: { content: '被评论的帖子' } });
    return ((await res.json()) as { post: Post }).post;
  }

  it('帖子不存在 → 404 NOT_FOUND', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts/post_missing/comments', {
      cookie,
      body: { content: '评论' },
    });
    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('未登录评论 → 401 UNAUTHORIZED', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const post = await createPost(harness, cookie);

    const res = await call(harness.app, `/api/posts/${post.id}/comments`, {
      body: { content: '评论' },
    });
    expect(res.status).toBe(401);
  });

  it('登录后 201、截断 140、列表正序', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const post = await createPost(harness, cookie);

    const first = await call(harness.app, `/api/posts/${post.id}/comments`, {
      cookie,
      body: { content: '第一条' },
    });
    expect(first.status).toBe(201);
    expect(((await first.json()) as { comment: Comment }).comment.authorId).toBe('user_1');

    harness.advance(5);
    await call(harness.app, `/api/posts/${post.id}/comments`, {
      cookie,
      body: { content: '第二条' },
    });

    const long = await call(harness.app, `/api/posts/${post.id}/comments`, {
      cookie,
      body: { content: 'y'.repeat(200) },
    });
    expect(((await long.json()) as { comment: Comment }).comment.content).toHaveLength(140);

    const res = await call(harness.app, `/api/posts/${post.id}/comments`);
    const payload = (await res.json()) as { comments: Comment[] };
    expect(payload.comments.map((comment) => comment.content)).toEqual([
      '第一条',
      '第二条',
      'y'.repeat(140),
    ]);
  });

  it('空评论 → 400 INVALID_INPUT', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const post = await createPost(harness, cookie);

    const res = await call(harness.app, `/api/posts/${post.id}/comments`, {
      cookie,
      body: { content: '' },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.message).toContain('请输入评论');
  });

  it('GET /api/comments?authorId= 过滤', async () => {
    const harness = createHarness();
    const alice = await signUp(harness.app, { username: 'alice' });
    const post = await createPost(harness, alice);
    await call(harness.app, `/api/posts/${post.id}/comments`, {
      cookie: alice,
      body: { content: 'alice 的评论' },
    });

    const bob = await signUp(harness.app, { username: 'bob' });
    await call(harness.app, `/api/posts/${post.id}/comments`, {
      cookie: bob,
      body: { content: 'bob 的评论' },
    });

    const res = await call(harness.app, '/api/comments?authorId=user_2');
    const payload = (await res.json()) as { comments: Comment[] };
    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0].content).toBe('bob 的评论');
  });

  it('GET /api/comments 不带过滤时返回全部评论', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const post = await createPost(harness, cookie);
    await call(harness.app, `/api/posts/${post.id}/comments`, { cookie, body: { content: '甲' } });
    await call(harness.app, `/api/posts/${post.id}/comments`, { cookie, body: { content: '乙' } });

    const res = await call(harness.app, '/api/comments');
    const payload = (await res.json()) as { comments: Comment[] };
    expect(payload.comments.map((comment) => comment.content)).toEqual(['甲', '乙']);
  });

  it('帖子不存在时 GET 评论列表 → 404', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/posts/post_missing/comments');
    expect(res.status).toBe(404);
  });
});

describe('点赞', () => {
  async function publish(app: App, cookie: string, content = '被点赞的帖子'): Promise<Post> {
    const res = await call(app, '/api/posts', { cookie, body: { content } });
    return ((await res.json()) as { post: Post }).post;
  }

  it('未登录点赞 → 401 UNAUTHORIZED', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/posts/post_1/like', { method: 'PUT' });

    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('帖子不存在 → 404 NOT_FOUND', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts/post_missing/like', { method: 'PUT', cookie });

    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('PUT 幂等：重复点赞只算一次，并返回当前计数', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const post = await publish(harness.app, cookie);

    const first = await call(harness.app, `/api/posts/${post.id}/like`, { method: 'PUT', cookie });
    const second = await call(harness.app, `/api/posts/${post.id}/like`, { method: 'PUT', cookie });

    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      like: { postId: post.id, likeCount: 1, liked: true },
    });
    expect(await second.json()).toEqual({
      like: { postId: post.id, likeCount: 1, liked: true },
    });
  });

  it('DELETE 取消点赞并返回最新计数，重复取消同样幂等', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const post = await publish(harness.app, cookie);
    await call(harness.app, `/api/posts/${post.id}/like`, { method: 'PUT', cookie });

    const first = await call(harness.app, `/api/posts/${post.id}/like`, {
      method: 'DELETE',
      cookie,
    });
    const second = await call(harness.app, `/api/posts/${post.id}/like`, {
      method: 'DELETE',
      cookie,
    });

    expect(await first.json()).toEqual({
      like: { postId: post.id, likeCount: 0, liked: false },
    });
    expect(await second.json()).toEqual({
      like: { postId: post.id, likeCount: 0, liked: false },
    });
  });

  it('不同用户点赞累加，各自只看到自己的点赞状态', async () => {
    const harness = createHarness();
    const alice = await signUp(harness.app, { username: 'alice' });
    const post = await publish(harness.app, alice);

    const bob = await signUp(harness.app, { username: 'bob' });
    await call(harness.app, `/api/posts/${post.id}/like`, { method: 'PUT', cookie: bob });

    const forAlice = (await (
      await call(harness.app, '/api/engagement', { cookie: alice })
    ).json()) as { engagement: EngagementSummary };
    const forBob = (await (
      await call(harness.app, '/api/engagement', { cookie: bob })
    ).json()) as { engagement: EngagementSummary };

    expect(forAlice.engagement.likeCounts).toEqual({ [post.id]: 1 });
    expect(forAlice.engagement.likedPostIds).toEqual([]);
    expect(forBob.engagement.likedPostIds).toEqual([post.id]);
  });

  it('游客 GET /api/engagement 能看到总数，但个人状态为空', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);
    const post = await publish(harness.app, cookie);
    await call(harness.app, `/api/posts/${post.id}/like`, { method: 'PUT', cookie });

    const res = await call(harness.app, '/api/engagement');
    const payload = (await res.json()) as { engagement: EngagementSummary };

    expect(res.status).toBe(200);
    expect(payload.engagement.likeCounts).toEqual({ [post.id]: 1 });
    expect(payload.engagement.likedPostIds).toEqual([]);
    expect(payload.engagement.bookmarks).toEqual([]);
  });
});

describe('收藏', () => {
  async function publish(app: App, cookie: string, content = '被收藏的帖子'): Promise<Post> {
    const res = await call(app, '/api/posts', { cookie, body: { content } });
    return ((await res.json()) as { post: Post }).post;
  }

  it('未登录收藏 → 401 UNAUTHORIZED', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/posts/post_1/bookmark', { method: 'PUT' });

    expect(res.status).toBe(401);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('UNAUTHORIZED');
  });

  it('帖子不存在 → 404 NOT_FOUND', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts/post_missing/bookmark', {
      method: 'PUT',
      cookie,
    });

    expect(res.status).toBe(404);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('收藏/取消收藏幂等，engagement 只返回本人收藏且最新在前', async () => {
    const harness = createHarness();
    const alice = await signUp(harness.app, { username: 'alice' });
    const first = await publish(harness.app, alice, '第一篇');
    harness.advance(1000);
    const second = await publish(harness.app, alice, '第二篇');

    expect(
      await (await call(harness.app, `/api/posts/${first.id}/bookmark`, {
        method: 'PUT',
        cookie: alice,
      })).json()
    ).toEqual({ bookmark: { postId: first.id, bookmarked: true } });
    await call(harness.app, `/api/posts/${first.id}/bookmark`, { method: 'PUT', cookie: alice });
    await call(harness.app, `/api/posts/${second.id}/bookmark`, { method: 'PUT', cookie: alice });

    const summary = (await (
      await call(harness.app, '/api/engagement', { cookie: alice })
    ).json()) as { engagement: EngagementSummary };
    expect(summary.engagement.bookmarks.map((item) => item.postId)).toEqual([
      second.id,
      first.id,
    ]);

    const removed = await call(harness.app, `/api/posts/${first.id}/bookmark`, {
      method: 'DELETE',
      cookie: alice,
    });
    expect(await removed.json()).toEqual({ bookmark: { postId: first.id, bookmarked: false } });

    const after = (await (
      await call(harness.app, '/api/engagement', { cookie: alice })
    ).json()) as { engagement: EngagementSummary };
    expect(after.engagement.bookmarks.map((item) => item.postId)).toEqual([second.id]);

    const bob = await signUp(harness.app, { username: 'bob' });
    const forBob = (await (
      await call(harness.app, '/api/engagement', { cookie: bob })
    ).json()) as { engagement: EngagementSummary };
    expect(forBob.engagement.bookmarks).toEqual([]);
  });
});

describe('GET /api/users', () => {
  it('返回公开字段且不含敏感字段', async () => {
    const harness = createHarness();
    await signUp(harness.app);

    const res = await call(harness.app, '/api/users');
    expect(res.status).toBe(200);

    const raw = await res.text();
    expect(raw).not.toContain('salt');
    expect(raw).not.toContain('passwordHash');

    const payload = JSON.parse(raw) as { users: PublicUser[] };
    expect(payload.users).toHaveLength(1);
    expect(Object.keys(payload.users[0]).sort()).toEqual([
      'createdAt',
      'displayName',
      'id',
      'username',
    ]);
  });
});

describe('通用错误处理', () => {
  it('未知路由 → 404 JSON', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/unknown');

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('NOT_FOUND');
  });

  it('非法 JSON body → 400 INVALID_INPUT', async () => {
    const { app } = createHarness();
    const res = await call(app, '/api/users', { rawBody: '{"username": ' });

    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('INVALID_INPUT');
  });

  it('缺少 body 的写接口 → 400 INVALID_INPUT', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts', { method: 'POST', cookie });
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('INVALID_INPUT');
  });

  it('请求体超过 16KB → 413 INVALID_INPUT', async () => {
    const harness = createHarness();
    const cookie = await signUp(harness.app);

    const res = await call(harness.app, '/api/posts', {
      cookie,
      body: { content: 'x'.repeat(20_000) },
    });

    expect(res.status).toBe(413);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe('INVALID_INPUT');
  });

  it('未捕获异常 → 500 INTERNAL', async () => {
    const store = createMemoryStore();
    const app = createApp({
      store: {
        ...store,
        listPosts() {
          throw new Error('boom');
        },
      },
    });

    const res = await call(app, '/api/posts');
    expect(res.status).toBe(500);
    expect(((await res.json()) as ApiErrorBody).error).toEqual({
      code: 'INTERNAL',
      message: '服务器内部错误',
    });
  });

  it('两个 createApp 实例数据隔离', async () => {
    const first = createHarness();
    const second = createHarness();

    const cookie = await signUp(first.app);
    await call(first.app, '/api/posts', { cookie, body: { content: '只属于第一个实例' } });

    expect(
      ((await (await call(second.app, '/api/users')).json()) as { users: PublicUser[] }).users
    ).toEqual([]);
    expect(((await (await call(second.app, '/api/posts')).json()) as { posts: Post[] }).posts).toEqual(
      []
    );
    expect(
      (
        (await (await call(second.app, '/api/session', { cookie })).json()) as {
          user: PublicUser | null;
        }
      ).user
    ).toBeNull();
  });
});
