import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import {
  API_ERRORS,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  type ApiErrorBody,
  type ApiErrorCode,
  type EngagementSummary,
  type PublicUser,
} from '../shared/contract';
import { createSalt, hashPassword, verifyPassword } from './password';
import { createMemoryStore, type MemoryStore, type UserRecord } from './store';
import {
  COMMENT_CONTENT_RULE,
  POST_CONTENT_RULE,
  validateContent,
  validateCredentials,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from './validation';

export interface CreateAppOptions {
  store?: MemoryStore;
  clock?: () => number;
  makeId?: (prefix: string) => string;
}

/** 错误响应只会用到这些状态码。 */
type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 500;

export function createApp(options: CreateAppOptions = {}) {
  const store = options.store ?? createMemoryStore({ clock: options.clock, makeId: options.makeId });
  const app = new Hono();

  function toPublicUser(user: UserRecord): PublicUser {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      createdAt: user.createdAt,
    };
  }

  function errorBody(code: ApiErrorCode, message?: string): ApiErrorBody {
    return { error: { code, message: message ?? API_ERRORS[code].message } };
  }

  function fail(c: Context, code: ApiErrorCode, message?: string) {
    return c.json(errorBody(code, message), API_ERRORS[code].status as ErrorStatus);
  }

  /** body 不是合法 JSON 对象时返回 null，由调用方转成 400。 */
  async function readJsonBody(c: Context): Promise<Record<string, unknown> | null> {
    try {
      const payload: unknown = await c.req.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
      return payload as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  function invalidBody(c: Context) {
    return fail(c, 'INVALID_INPUT', '请求体需为合法的 JSON 对象');
  }

  function sessionUser(c: Context): UserRecord | null {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) return null;

    const session = store.findSession(token);
    if (!session) return null;

    return store.findUserById(session.userId);
  }

  /** 点赞总数对所有人可见；点赞状态与收藏只属于当前会话用户。 */
  function engagementOf(c: Context): EngagementSummary {
    const user = sessionUser(c);
    return {
      likeCounts: store.listLikeCounts(),
      likedPostIds: user ? store.listLikedPostIds(user.id) : [],
      bookmarks: user
        ? store.listBookmarks(user.id).map(({ postId, createdAt }) => ({ postId, createdAt }))
        : [],
    };
  }

  function startSession(c: Context, userId: string): void {
    const session = store.createSession(userId);
    setCookie(c, SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  }

  // 所有写接口的 body 都是小 JSON，超过 16KB 直接拒绝，避免整块读进内存
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => c.json(errorBody('INVALID_INPUT', '请求体过大'), 413),
    })
  );

  app.get('/api/health', (c) => c.json({ status: 'ok' as const }));

  app.post('/api/users', async (c) => {
    const body = await readJsonBody(c);
    if (!body) return invalidBody(c);

    const username = validateUsername(body.username);
    if (!username.ok) return fail(c, username.code, username.message);

    const displayName = validateDisplayName(body.displayName, username.value);
    if (!displayName.ok) return fail(c, displayName.code, displayName.message);

    const password = validatePassword(body.password);
    if (!password.ok) return fail(c, password.code, password.message);

    // 大小写不同也算重名
    if (store.findUserByUsername(username.value)) return fail(c, 'USERNAME_TAKEN');

    const salt = createSalt();
    const user = store.addUser({
      id: store.makeId('user'),
      username: username.value,
      usernameLower: username.value.toLowerCase(),
      displayName: displayName.value,
      salt,
      passwordHash: hashPassword(password.value, salt),
      createdAt: store.now(),
    });

    // 注册即登录，与改造前的行为保持一致
    startSession(c, user.id);
    return c.json({ user: toPublicUser(user) }, 201);
  });

  app.get('/api/users', (c) => c.json({ users: store.listUsers().map(toPublicUser) }));

  app.post('/api/session', async (c) => {
    const body = await readJsonBody(c);
    if (!body) return invalidBody(c);

    const credentials = validateCredentials(body.username, body.password);
    if (!credentials.ok) return fail(c, credentials.code, credentials.message);

    const user = store.findUserByUsername(credentials.value.username);
    if (!user) return fail(c, 'INVALID_CREDENTIALS');
    if (!verifyPassword(credentials.value.password, user.salt, user.passwordHash)) {
      return fail(c, 'INVALID_CREDENTIALS');
    }

    startSession(c, user.id);
    return c.json({ user: toPublicUser(user) });
  });

  app.get('/api/session', (c) => {
    const user = sessionUser(c);
    return c.json({ user: user ? toPublicUser(user) : null });
  });

  app.delete('/api/session', (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) store.deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.body(null, 204);
  });

  app.get('/api/posts', (c) => {
    const authorId = c.req.query('authorId');
    return c.json({ posts: store.listPosts(authorId ? { authorId } : {}) });
  });

  app.post('/api/posts', async (c) => {
    const user = sessionUser(c);
    if (!user) return fail(c, 'UNAUTHORIZED');

    const body = await readJsonBody(c);
    if (!body) return invalidBody(c);

    const content = validateContent(body.content, POST_CONTENT_RULE);
    if (!content.ok) return fail(c, content.code, content.message);

    const post = store.addPost({
      id: store.makeId('post'),
      authorId: user.id,
      content: content.value,
      createdAt: store.now(),
    });
    return c.json({ post }, 201);
  });

  app.get('/api/posts/:postId', (c) => {
    const post = store.findPost(c.req.param('postId'));
    if (!post) return fail(c, 'NOT_FOUND', '帖子不存在');
    return c.json({ post });
  });

  app.delete('/api/posts/:postId', (c) => {
    const user = sessionUser(c);
    if (!user) return fail(c, 'UNAUTHORIZED');

    const postId = c.req.param('postId');
    const post = store.findPost(postId);
    if (!post) return fail(c, 'NOT_FOUND', '帖子不存在');
    if (post.authorId !== user.id) return fail(c, 'FORBIDDEN', '只能删除自己的帖子');

    store.deletePost(postId);
    return c.body(null, 204);
  });

  app.get('/api/posts/:postId/comments', (c) => {
    const postId = c.req.param('postId');
    if (!store.findPost(postId)) return fail(c, 'NOT_FOUND', '帖子不存在');
    return c.json({ comments: store.listComments({ postId }) });
  });

  app.post('/api/posts/:postId/comments', async (c) => {
    const user = sessionUser(c);
    if (!user) return fail(c, 'UNAUTHORIZED');

    const postId = c.req.param('postId');
    if (!store.findPost(postId)) return fail(c, 'NOT_FOUND', '帖子不存在');

    const body = await readJsonBody(c);
    if (!body) return invalidBody(c);

    const content = validateContent(body.content, COMMENT_CONTENT_RULE);
    if (!content.ok) return fail(c, content.code, content.message);

    const comment = store.addComment({
      id: store.makeId('comment'),
      postId,
      authorId: user.id,
      content: content.value,
      createdAt: store.now(),
    });
    return c.json({ comment }, 201);
  });

  app.get('/api/engagement', (c) => c.json({ engagement: engagementOf(c) }));

  app.put('/api/posts/:postId/like', (c) => {
    const user = sessionUser(c);
    if (!user) return fail(c, 'UNAUTHORIZED');

    const postId = c.req.param('postId');
    if (!store.findPost(postId)) return fail(c, 'NOT_FOUND', '帖子不存在');

    // 幂等：已点过赞时 addLike 返回 false，但计数与响应保持一致
    store.addLike({ postId, userId: user.id, createdAt: store.now() });
    return c.json({ like: { postId, likeCount: store.countLikes(postId), liked: true } });
  });

  app.delete('/api/posts/:postId/like', (c) => {
    const user = sessionUser(c);
    if (!user) return fail(c, 'UNAUTHORIZED');

    const postId = c.req.param('postId');
    if (!store.findPost(postId)) return fail(c, 'NOT_FOUND', '帖子不存在');

    store.removeLike(postId, user.id);
    return c.json({ like: { postId, likeCount: store.countLikes(postId), liked: false } });
  });

  app.put('/api/posts/:postId/bookmark', (c) => {
    const user = sessionUser(c);
    if (!user) return fail(c, 'UNAUTHORIZED');

    const postId = c.req.param('postId');
    if (!store.findPost(postId)) return fail(c, 'NOT_FOUND', '帖子不存在');

    store.addBookmark({ postId, userId: user.id, createdAt: store.now() });
    return c.json({ bookmark: { postId, bookmarked: true } });
  });

  app.delete('/api/posts/:postId/bookmark', (c) => {
    const user = sessionUser(c);
    if (!user) return fail(c, 'UNAUTHORIZED');

    const postId = c.req.param('postId');
    if (!store.findPost(postId)) return fail(c, 'NOT_FOUND', '帖子不存在');

    store.removeBookmark(postId, user.id);
    return c.json({ bookmark: { postId, bookmarked: false } });
  });

  app.get('/api/comments', (c) => {
    const authorId = c.req.query('authorId');
    return c.json({ comments: store.listComments(authorId ? { authorId } : {}) });
  });

  app.notFound((c) => fail(c, 'NOT_FOUND'));

  app.onError((error, c) => {
    console.error('[miniblog] 未捕获异常:', error);
    return fail(c, 'INTERNAL');
  });

  return app;
}
