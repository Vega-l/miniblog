import { describe, expect, it } from 'vitest';
import { ApiError, apiClient, configureApiClient, createApiClient, type ApiClient } from '@/core/api';
import { sampleComment, samplePost, sampleUser } from '../helpers/fixtures';

interface FetchCall {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function rawResponse(raw: string, status: number): Response {
  return {
    ok: false,
    status,
    text: async () => raw,
  } as unknown as Response;
}

function setup(response: Response): { api: ApiClient; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return response;
  }) as unknown as typeof fetch;

  return { api: createApiClient({ fetchImpl }), calls };
}

describe('createApiClient · 请求构造', () => {
  it('默认请求 /api 前缀，带 credentials 与 JSON 头', async () => {
    const { api, calls } = setup(jsonResponse({ posts: [] }));
    await api.posts();

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/posts');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.credentials).toBe('include');
    expect((calls[0].init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  it('自定义 baseUrl 会去掉尾部斜杠', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return jsonResponse({ users: [] });
    }) as unknown as typeof fetch;

    const api = createApiClient({ baseUrl: 'http://localhost:8787/api/', fetchImpl });
    await api.users();

    expect(calls[0].url).toBe('http://localhost:8787/api/users');
  });

  const getCases: Array<[string, (api: ApiClient) => Promise<unknown>, string, unknown]> = [
    ['session', (api) => api.session(), '/api/session', { user: sampleUser() }],
    ['users', (api) => api.users(), '/api/users', { users: [sampleUser()] }],
    ['posts', (api) => api.posts(), '/api/posts', { posts: [samplePost()] }],
    [
      'posts?authorId',
      (api) => api.posts('u 1'),
      '/api/posts?authorId=u%201',
      { posts: [samplePost()] },
    ],
    ['post', (api) => api.post('p 1'), '/api/posts/p%201', { post: samplePost() }],
    [
      'comments',
      (api) => api.comments('p 1'),
      '/api/posts/p%201/comments',
      { comments: [sampleComment()] },
    ],
    ['allComments', (api) => api.allComments(), '/api/comments', { comments: [sampleComment()] }],
    [
      'commentsBy',
      (api) => api.commentsBy('u 1'),
      '/api/comments?authorId=u%201',
      { comments: [sampleComment()] },
    ],
  ];

  it.each(getCases)('%s 走 GET %s', async (_name, action, path, body) => {
    const { api, calls } = setup(jsonResponse(body));
    await action(api);

    expect(calls[0].url).toBe(path);
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.body).toBeUndefined();
  });

  const postCases: Array<[string, (api: ApiClient) => Promise<unknown>, string, unknown, unknown]> =
    [
      [
        'register',
        (api) => api.register({ username: 'alice', password: 'secret1' }),
        '/api/users',
        { username: 'alice', password: 'secret1' },
        { user: sampleUser() },
      ],
      [
        'login',
        (api) => api.login({ username: 'alice', password: 'secret1' }),
        '/api/session',
        { username: 'alice', password: 'secret1' },
        { user: sampleUser() },
      ],
      [
        'createPost',
        (api) => api.createPost('你好'),
        '/api/posts',
        { content: '你好' },
        { post: samplePost() },
      ],
      [
        'createComment',
        (api) => api.createComment('p 1', '不错'),
        '/api/posts/p%201/comments',
        { content: '不错' },
        { comment: sampleComment() },
      ],
    ];

  it.each(postCases)('%s 走 POST %s 并携带 JSON body', async (_name, action, path, body, response) => {
    const { api, calls } = setup(jsonResponse(response, 201));
    await action(api);

    expect(calls[0].url).toBe(path);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json'
    );
    expect(JSON.parse(calls[0].init.body as string)).toEqual(body);
  });
});

describe('createApiClient · 响应解析', () => {
  it('session 解包 user，无会话时为 null', async () => {
    await expect(setup(jsonResponse({ user: sampleUser() })).api.session()).resolves.toEqual(
      sampleUser()
    );
    await expect(setup(jsonResponse({ user: null })).api.session()).resolves.toBeNull();
  });

  it('列表接口解包成数组', async () => {
    expect(await setup(jsonResponse({ posts: [samplePost()] })).api.posts()).toEqual([samplePost()]);
    expect(await setup(jsonResponse({ comments: [sampleComment()] })).api.allComments()).toEqual([
      sampleComment(),
    ]);
  });

  it('204 直接返回 undefined，不读取 body', async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return {
        ok: true,
        status: 204,
        text: async () => {
          throw new Error('204 不应该读取 body');
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const api = createApiClient({ fetchImpl });
    await expect(api.logout()).resolves.toBeUndefined();
    expect(calls[0].url).toBe('/api/session');
    expect(calls[0].init.method).toBe('DELETE');
  });
});

describe('createApiClient · 错误映射', () => {
  it.each([
    [
      409,
      { error: { code: 'USERNAME_TAKEN', message: '该用户名已被占用' } },
      'USERNAME_TAKEN',
      '该用户名已被占用',
    ],
    [
      401,
      { error: { code: 'INVALID_CREDENTIALS', message: '用户名或密码不正确' } },
      'INVALID_CREDENTIALS',
      '用户名或密码不正确',
    ],
    [
      404,
      { error: { code: 'NOT_FOUND', message: '帖子不存在' } },
      'NOT_FOUND',
      '帖子不存在',
    ],
  ])('HTTP %s → ApiError(%s)', async (status, body, code, message) => {
    const { api } = setup(jsonResponse(body, status as number));

    const error = await api.posts().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
    expect((error as ApiError).status).toBe(status);
    expect((error as ApiError).message).toBe(message);
  });

  it('服务端没给 message 时回落为默认文案', async () => {
    const { api } = setup(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
    const error = (await api.post('p1').catch((caught: unknown) => caught)) as ApiError;

    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('资源不存在');
  });

  it('非 JSON 错误体 → INTERNAL + 兜底文案', async () => {
    const { api } = setup(rawResponse('<html>500</html>', 500));
    const error = (await api.posts().catch((caught: unknown) => caught)) as ApiError;

    expect(error.code).toBe('INTERNAL');
    expect(error.status).toBe(500);
    expect(error.message).toBe('服务器开小差了，请稍后重试');
  });

  it('JSON 但缺少 error 字段 → 兜底文案', async () => {
    const { api } = setup(jsonResponse({ foo: 'bar' }, 400));
    const error = (await api.posts().catch((caught: unknown) => caught)) as ApiError;

    expect(error.code).toBe('INTERNAL');
    expect(error.message).toBe('服务器开小差了，请稍后重试');
  });

  it('fetch 抛异常 → NETWORK', async () => {
    const fetchImpl = (async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;

    const error = (await createApiClient({ fetchImpl })
      .posts()
      .catch((caught: unknown) => caught)) as ApiError;

    expect(error.code).toBe('NETWORK');
    expect(error.status).toBe(0);
    expect(error.message).toBe('无法连接到服务器，请确认后端已启动');
  });

  it('成功响应但 body 不是合法 JSON → INTERNAL', async () => {
    const { api } = setup({
      ok: true,
      status: 200,
      text: async () => 'not-json',
    } as unknown as Response);

    const error = (await api.posts().catch((caught: unknown) => caught)) as ApiError;
    expect(error.code).toBe('INTERNAL');
    expect(error.message).toBe('服务器开小差了，请稍后重试');
  });
});

describe('createApiClient · 点赞与收藏', () => {
  const engagement = {
    likeCounts: { p1: 2 },
    likedPostIds: ['p1'],
    bookmarks: [{ postId: 'p1', createdAt: 1_700_000_000_000 }],
  };

  it('engagement 走 GET /api/engagement 并解包', async () => {
    const { api, calls } = setup(jsonResponse({ engagement }));

    await expect(api.engagement()).resolves.toEqual(engagement);
    expect(calls[0].url).toBe('/api/engagement');
    expect(calls[0].init.method).toBe('GET');
  });

  it('like / unlike 分别用 PUT / DELETE，且没有请求体', async () => {
    const likeBody = { like: { postId: 'p1', likeCount: 1, liked: true } };
    const liked = setup(jsonResponse(likeBody));

    await expect(liked.api.like('p 1')).resolves.toEqual(likeBody.like);
    expect(liked.calls[0].url).toBe('/api/posts/p%201/like');
    expect(liked.calls[0].init.method).toBe('PUT');
    expect(liked.calls[0].init.body).toBeUndefined();

    const unlikeBody = { like: { postId: 'p1', likeCount: 0, liked: false } };
    const unliked = setup(jsonResponse(unlikeBody));

    await expect(unliked.api.unlike('p 1')).resolves.toEqual(unlikeBody.like);
    expect(unliked.calls[0].url).toBe('/api/posts/p%201/like');
    expect(unliked.calls[0].init.method).toBe('DELETE');
  });

  it('bookmark / unbookmark 分别用 PUT / DELETE', async () => {
    const bookmarkBody = { bookmark: { postId: 'p1', bookmarked: true } };
    const bookmarked = setup(jsonResponse(bookmarkBody));

    await expect(bookmarked.api.bookmark('p 1')).resolves.toEqual(bookmarkBody.bookmark);
    expect(bookmarked.calls[0].url).toBe('/api/posts/p%201/bookmark');
    expect(bookmarked.calls[0].init.method).toBe('PUT');

    const removedBody = { bookmark: { postId: 'p1', bookmarked: false } };
    const removed = setup(jsonResponse(removedBody));

    await expect(removed.api.unbookmark('p 1')).resolves.toEqual(removedBody.bookmark);
    expect(removed.calls[0].url).toBe('/api/posts/p%201/bookmark');
    expect(removed.calls[0].init.method).toBe('DELETE');
  });
});

describe('apiClient 单例', () => {
  it('默认复用同一个实例，可被替换', () => {
    configureApiClient(null);
    const first = apiClient();
    expect(apiClient()).toBe(first);

    const replacement = createApiClient({ fetchImpl: (async () => jsonResponse({})) as never });
    configureApiClient(replacement);
    expect(apiClient()).toBe(replacement);

    configureApiClient(null);
  });
});
