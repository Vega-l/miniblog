import { vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  API_ERRORS,
  LIMITS,
  MIN_PASSWORD_LENGTH,
  USERNAME_PATTERN,
  type ApiErrorCode,
  type BookmarkRecord,
  type Comment,
  type EngagementSummary,
  type LikeRecord,
  type Post,
  type PublicUser,
} from '@shared/contract';
import { ApiError, configureApiClient } from '@/core/api';

export interface MockApiSeed {
  users?: PublicUser[];
  posts?: Post[];
  comments?: Comment[];
  likes?: LikeRecord[];
  bookmarks?: BookmarkRecord[];
  currentUser?: PublicUser | null;
}

/** 每个接口方法都是 vi.fn，方便断言调用次数与注入失败。 */
type AnyMock = Mock;

export interface MockApi {
  state: {
    users: PublicUser[];
    posts: Post[];
    comments: Comment[];
    likes: LikeRecord[];
    bookmarks: BookmarkRecord[];
    currentUserId: string | null;
  };
  setSession(user: PublicUser | null): void;
  session: AnyMock;
  register: AnyMock;
  login: AnyMock;
  logout: AnyMock;
  users: AnyMock;
  posts: AnyMock;
  post: AnyMock;
  createPost: AnyMock;
  comments: AnyMock;
  allComments: AnyMock;
  commentsBy: AnyMock;
  createComment: AnyMock;
  deletePost: AnyMock;
  engagement: AnyMock;
  like: AnyMock;
  unlike: AnyMock;
  bookmark: AnyMock;
  unbookmark: AnyMock;
}

/**
 * 有状态的内存假后端：行为与 server/ 保持一致的语义，
 * 这样 store 用例既能断言调用，也能断言真实的数据变化。
 */
export function createMockApi(seed: MockApiSeed = {}): MockApi {
  const users = [...(seed.users ?? [])];
  const state = {
    users,
    posts: [...(seed.posts ?? [])],
    comments: [...(seed.comments ?? [])],
    likes: [...(seed.likes ?? [])],
    bookmarks: [...(seed.bookmarks ?? [])],
    currentUserId: seed.currentUser?.id ?? null,
  };

  // 会话用户必须同时存在于用户列表里，否则作者信息查不到
  if (seed.currentUser && !state.users.some((user) => user.id === seed.currentUser?.id)) {
    state.users.push(seed.currentUser);
  }

  // 假后端也校验密码：种子用户默认密码 secret1
  const passwords = new Map<string, string>();
  for (const user of state.users) passwords.set(user.id, 'secret1');

  let sequence = 0;
  let clock = 1_700_000_000_000;

  function tick(): number {
    clock += 1000;
    return clock;
  }

  function nextId(prefix: string): string {
    sequence += 1;
    return `${prefix}_${sequence}`;
  }

  function fail(code: ApiErrorCode): never {
    throw new ApiError(code, API_ERRORS[code].message, API_ERRORS[code].status);
  }

  function failWith(code: ApiErrorCode, message: string): never {
    throw new ApiError(code, message, API_ERRORS[code].status);
  }

  /** 与 server/app.ts 的「帖子不存在」文案保持一致。 */
  function failPostMissing(): never {
    throw new ApiError('NOT_FOUND', '帖子不存在', 404);
  }

  function requireUser(): PublicUser {
    const user = state.users.find((item) => item.id === state.currentUserId);
    return user ?? fail('UNAUTHORIZED');
  }

  return {
    state,

    setSession(user: PublicUser | null) {
      state.currentUserId = user?.id ?? null;
    },

    session: vi.fn(async () => state.users.find((item) => item.id === state.currentUserId) ?? null),

    register: vi.fn(async (input) => {
      const username = (input.username ?? '').trim();
      const displayName = (input.displayName ?? '').trim();
      if (!USERNAME_PATTERN.test(username)) fail('INVALID_INPUT');
      if (displayName.length > LIMITS.displayName) fail('INVALID_INPUT');
      if ((input.password ?? '').length < MIN_PASSWORD_LENGTH) fail('INVALID_INPUT');
      if ((input.password ?? '').length > LIMITS.password) fail('INVALID_INPUT');
      if (state.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
        fail('USERNAME_TAKEN');
      }

      const user: PublicUser = {
        id: nextId('user'),
        username,
        displayName: displayName || username,
        createdAt: tick(),
      };
      state.users.push(user);
      passwords.set(user.id, input.password ?? '');
      state.currentUserId = user.id;
      return user;
    }),

    login: vi.fn(async (input) => {
      const username = (input.username ?? '').trim();
      if (!username || !(input.password ?? '')) failWith('INVALID_INPUT', '请输入用户名和密码');

      const user = state.users.find(
        (item) => item.username.toLowerCase() === username.toLowerCase()
      );
      if (!user) fail('INVALID_CREDENTIALS');
      if (passwords.get(user.id) !== (input.password ?? '')) fail('INVALID_CREDENTIALS');

      state.currentUserId = user.id;
      return user;
    }),

    logout: vi.fn(async () => {
      state.currentUserId = null;
    }),

    users: vi.fn(async () => state.users.map((user) => ({ ...user }))),

    posts: vi.fn(async (authorId?: string) =>
      state.posts
        .filter((post) => !authorId || post.authorId === authorId)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
    ),

    post: vi.fn(async (postId: string) => {
      const post = state.posts.find((item) => item.id === postId);
      return post ?? failPostMissing();
    }),

    createPost: vi.fn(async (content: string) => {
      const user = requireUser();
      const trimmed = content.trim().slice(0, LIMITS.post);
      if (!trimmed) fail('INVALID_INPUT');

      const post: Post = {
        id: nextId('post'),
        authorId: user.id,
        content: trimmed,
        createdAt: tick(),
      };
      state.posts.push(post);
      return post;
    }),

    comments: vi.fn(async (postId: string) =>
      state.comments
        .filter((comment) => comment.postId === postId)
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
    ),

    allComments: vi.fn(async () =>
      state.comments.slice().sort((a, b) => a.createdAt - b.createdAt)
    ),

    commentsBy: vi.fn(async (authorId: string) =>
      state.comments
        .filter((comment) => comment.authorId === authorId)
        .slice()
        .sort((a, b) => a.createdAt - b.createdAt)
    ),

    createComment: vi.fn(async (postId: string, content: string) => {
      const user = requireUser();
      if (!state.posts.some((post) => post.id === postId)) failPostMissing();

      const trimmed = content.trim().slice(0, LIMITS.comment);
      if (!trimmed) fail('INVALID_INPUT');

      const comment: Comment = {
        id: nextId('comment'),
        postId,
        authorId: user.id,
        content: trimmed,
        createdAt: tick(),
      };
      state.comments.push(comment);
      return comment;
    }),

    deletePost: vi.fn(async (postId: string) => {
      const user = requireUser();
      const post = state.posts.find((item) => item.id === postId);
      if (!post) failPostMissing();
      if (post.authorId !== user.id) fail('UNAUTHORIZED');

      state.posts = state.posts.filter((item) => item.id !== postId);
      state.comments = state.comments.filter((comment) => comment.postId !== postId);
      state.likes = state.likes.filter((like) => like.postId !== postId);
      state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.postId !== postId);
    }),

    engagement: vi.fn(async (): Promise<EngagementSummary> => {
      const likeCounts: Record<string, number> = {};
      for (const like of state.likes) {
        likeCounts[like.postId] = (likeCounts[like.postId] ?? 0) + 1;
      }

      const userId = state.currentUserId;
      return {
        likeCounts,
        likedPostIds: userId
          ? state.likes.filter((like) => like.userId === userId).map((like) => like.postId)
          : [],
        bookmarks: userId
          ? state.bookmarks
              .filter((bookmark) => bookmark.userId === userId)
              .slice()
              .sort((a, b) => b.createdAt - a.createdAt)
              .map(({ postId, createdAt }) => ({ postId, createdAt }))
          : [],
      };
    }),

    like: vi.fn(async (postId: string) => {
      const user = requireUser();
      if (!state.posts.some((post) => post.id === postId)) failPostMissing();

      if (!state.likes.some((like) => like.postId === postId && like.userId === user.id)) {
        state.likes.push({ postId, userId: user.id, createdAt: tick() });
      }

      return {
        postId,
        likeCount: state.likes.filter((like) => like.postId === postId).length,
        liked: true,
      };
    }),

    unlike: vi.fn(async (postId: string) => {
      const user = requireUser();
      if (!state.posts.some((post) => post.id === postId)) failPostMissing();

      state.likes = state.likes.filter(
        (like) => !(like.postId === postId && like.userId === user.id)
      );

      return {
        postId,
        likeCount: state.likes.filter((like) => like.postId === postId).length,
        liked: false,
      };
    }),

    bookmark: vi.fn(async (postId: string) => {
      const user = requireUser();
      if (!state.posts.some((post) => post.id === postId)) failPostMissing();

      if (
        !state.bookmarks.some(
          (bookmark) => bookmark.postId === postId && bookmark.userId === user.id
        )
      ) {
        state.bookmarks.push({ postId, userId: user.id, createdAt: tick() });
      }

      return { postId, bookmarked: true };
    }),

    unbookmark: vi.fn(async (postId: string) => {
      const user = requireUser();
      if (!state.posts.some((post) => post.id === postId)) failPostMissing();

      state.bookmarks = state.bookmarks.filter(
        (bookmark) => !(bookmark.postId === postId && bookmark.userId === user.id)
      );

      return { postId, bookmarked: false };
    }),
  } as unknown as MockApi;
}

/** 安装假客户端，必须在创建 store 之前调用。 */
export function installMockApi(seed: MockApiSeed = {}): MockApi {
  const api = createMockApi(seed);
  configureApiClient(api);
  return api;
}

export function resetMockApi(): void {
  configureApiClient(null);
}
