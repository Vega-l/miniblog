import {
  API_BASE,
  API_ERRORS,
  type ApiErrorCode,
  type BookmarkPayload,
  type BookmarkResult,
  type Comment,
  type CommentPayload,
  type CommentsPayload,
  type CreateCommentRequest,
  type CreatePostRequest,
  type EngagementPayload,
  type EngagementSummary,
  type LikePayload,
  type LikeResult,
  type LoginRequest,
  type Post,
  type PostPayload,
  type PostsPayload,
  type PublicUser,
  type RegisterRequest,
  type SessionPayload,
  type UserPayload,
  type UsersPayload,
} from '@shared/contract';

const FALLBACK_MESSAGE = '服务器开小差了，请稍后重试';
const NETWORK_MESSAGE = '无法连接到服务器，请确认后端已启动';

const KNOWN_CODES = new Set<string>(Object.keys(API_ERRORS));

/** 统一的接口异常：`code` 来自服务端错误码，或 `NETWORK` 表示请求没能发出去。 */
export class ApiError extends Error {
  readonly code: ApiErrorCode | 'NETWORK';
  readonly status: number;

  constructor(code: ApiErrorCode | 'NETWORK', message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/** 供 store 复用：优先使用接口文案，否则落到调用方给的兜底文案。 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError && error.message ? error.message : fallback;
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** 从 `{error:{code,message}}` 中提取错误码与文案，拿不到就退化为 INTERNAL。 */
function toApiError(payload: unknown, status: number): ApiError {
  if (payload && typeof payload === 'object') {
    const error = (payload as { error?: unknown }).error;
    if (error && typeof error === 'object') {
      const source = error as { code?: unknown; message?: unknown };
      if (isApiErrorCode(source.code)) {
        const message =
          typeof source.message === 'string' && source.message
            ? source.message
            : API_ERRORS[source.code].message;
        return new ApiError(source.code, message, status);
      }
    }
  }

  return new ApiError('INTERNAL', FALLBACK_MESSAGE, status);
}

export interface ApiClient {
  session(): Promise<PublicUser | null>;
  register(input: RegisterRequest): Promise<PublicUser>;
  login(input: LoginRequest): Promise<PublicUser>;
  logout(): Promise<void>;
  users(): Promise<PublicUser[]>;
  posts(authorId?: string): Promise<Post[]>;
  post(postId: string): Promise<Post>;
  createPost(content: string): Promise<Post>;
  deletePost(postId: string): Promise<void>;
  comments(postId: string): Promise<Comment[]>;
  allComments(): Promise<Comment[]>;
  commentsBy(authorId: string): Promise<Comment[]>;
  createComment(postId: string, content: string): Promise<Comment>;

  engagement(): Promise<EngagementSummary>;
  like(postId: string): Promise<LikeResult>;
  unlike(postId: string): Promise<LikeResult>;
  bookmark(postId: string): Promise<BookmarkResult>;
  unbookmark(postId: string): Promise<BookmarkResult>;
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? API_BASE).replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch?.bind(globalThis) as typeof fetch | undefined);

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    if (!fetchImpl) throw new ApiError('NETWORK', NETWORK_MESSAGE, 0);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
        credentials: 'include',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError('NETWORK', NETWORK_MESSAGE, 0);
    }

    // 204 没有响应体，不能读 text()
    if (response.status === 204) return undefined as T;

    const raw = await response.text();
    const payload = raw ? parseJson(raw) : undefined;

    if (!response.ok) throw toApiError(payload, response.status);
    if (payload === undefined) throw new ApiError('INTERNAL', FALLBACK_MESSAGE, response.status);

    return payload as T;
  }

  return {
    async session() {
      const payload = await request<SessionPayload>('/session');
      return payload.user ?? null;
    },

    async register(input) {
      const payload = await request<UserPayload>('/users', { body: input });
      return payload.user;
    },

    async login(input) {
      const payload = await request<UserPayload>('/session', { body: input });
      return payload.user;
    },

    async logout() {
      await request<void>('/session', { method: 'DELETE' });
    },

    async users() {
      const payload = await request<UsersPayload>('/users');
      return payload.users;
    },

    async posts(authorId) {
      const query = authorId ? `?authorId=${encodeURIComponent(authorId)}` : '';
      const payload = await request<PostsPayload>(`/posts${query}`);
      return payload.posts;
    },

    async post(postId) {
      const payload = await request<PostPayload>(`/posts/${encodeURIComponent(postId)}`);
      return payload.post;
    },

    async createPost(content) {
      const body: CreatePostRequest = { content };
      const payload = await request<PostPayload>('/posts', { body });
      return payload.post;
    },

    async deletePost(postId) {
      await request<void>(`/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
    },

    async comments(postId) {
      const payload = await request<CommentsPayload>(
        `/posts/${encodeURIComponent(postId)}/comments`
      );
      return payload.comments;
    },

    async allComments() {
      const payload = await request<CommentsPayload>('/comments');
      return payload.comments;
    },

    async commentsBy(authorId) {
      const payload = await request<CommentsPayload>(
        `/comments?authorId=${encodeURIComponent(authorId)}`
      );
      return payload.comments;
    },

    async createComment(postId, content) {
      const body: CreateCommentRequest = { content };
      const payload = await request<CommentPayload>(
        `/posts/${encodeURIComponent(postId)}/comments`,
        { body }
      );
      return payload.comment;
    },

    async engagement() {
      const payload = await request<EngagementPayload>('/engagement');
      return payload.engagement;
    },

    async like(postId) {
      const payload = await request<LikePayload>(
        `/posts/${encodeURIComponent(postId)}/like`,
        { method: 'PUT' }
      );
      return payload.like;
    },

    async unlike(postId) {
      const payload = await request<LikePayload>(
        `/posts/${encodeURIComponent(postId)}/like`,
        { method: 'DELETE' }
      );
      return payload.like;
    },

    async bookmark(postId) {
      const payload = await request<BookmarkPayload>(
        `/posts/${encodeURIComponent(postId)}/bookmark`,
        { method: 'PUT' }
      );
      return payload.bookmark;
    },

    async unbookmark(postId) {
      const payload = await request<BookmarkPayload>(
        `/posts/${encodeURIComponent(postId)}/bookmark`,
        { method: 'DELETE' }
      );
      return payload.bookmark;
    },
  };
}

let current: ApiClient | null = null;

/** store 通过这里拿到共享客户端。 */
export function apiClient(): ApiClient {
  current ??= createApiClient();
  return current;
}

/** 依赖替换入口（测试里换成假实现，避免真实网络请求）。 */
export function configureApiClient(client: ApiClient | null): void {
  current = client;
}
