import { randomUUID } from 'node:crypto';
import {
  SESSION_TTL_MS,
  type BookmarkRecord,
  type Comment,
  type LikeRecord,
  type Post,
  type PublicUser,
} from '../shared/contract';

/** 服务端内部用户记录：比 PublicUser 多出凭据字段，永远不要直接返回给客户端。 */
export interface UserRecord extends PublicUser {
  usernameLower: string;
  salt: string;
  passwordHash: string;
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export interface StoreOptions {
  clock?: () => number;
  makeId?: (prefix: string) => string;
}

export interface PostFilter {
  authorId?: string;
}

export interface CommentFilter {
  authorId?: string;
  postId?: string;
}

export interface MemoryStore {
  now(): number;
  makeId(prefix: string): string;

  listUsers(): UserRecord[];
  findUserById(userId: string): UserRecord | null;
  findUserByUsername(username: string): UserRecord | null;
  addUser(user: UserRecord): UserRecord;

  listPosts(filter?: PostFilter): Post[];
  findPost(postId: string): Post | null;
  addPost(post: Post): Post;

  listComments(filter?: CommentFilter): Comment[];
  addComment(comment: Comment): Comment;

  findLike(postId: string, userId: string): LikeRecord | null;
  addLike(like: LikeRecord): boolean;
  removeLike(postId: string, userId: string): boolean;
  countLikes(postId: string): number;
  listLikeCounts(): Record<string, number>;
  listLikedPostIds(userId: string): string[];

  findBookmark(postId: string, userId: string): BookmarkRecord | null;
  addBookmark(bookmark: BookmarkRecord): boolean;
  removeBookmark(postId: string, userId: string): boolean;
  listBookmarks(userId: string): BookmarkRecord[];

  createSession(userId: string): SessionRecord;
  findSession(token: string): SessionRecord | null;
  deleteSession(token: string): void;
  pruneExpiredSessions(): number;
}

/** 全内存存储：每个实例独立，可用于用例之间隔离。 */
export function createMemoryStore(options: StoreOptions = {}): MemoryStore {
  const clock = options.clock ?? Date.now;
  const makeId = options.makeId ?? ((prefix: string) => `${prefix}_${randomUUID()}`);

  const users: UserRecord[] = [];
  const posts: Post[] = [];
  const comments: Comment[] = [];
  // postId -> userId -> 点赞记录
  const likes = new Map<string, Map<string, LikeRecord>>();
  // userId -> postId -> 收藏记录
  const bookmarks = new Map<string, Map<string, BookmarkRecord>>();
  const sessions = new Map<string, SessionRecord>();
  // 记录创建顺序：同一毫秒创建时用它做稳定排序
  const order = new Map<string, number>();
  let sequence = 0;

  function remember(id: string): void {
    sequence += 1;
    order.set(id, sequence);
  }

  function orderOf(id: string): number {
    return order.get(id) ?? 0;
  }

  function pruneExpiredSessions(): number {
    const current = clock();
    let removed = 0;

    for (const [token, session] of sessions) {
      if (session.expiresAt <= current) {
        sessions.delete(token);
        removed += 1;
      }
    }

    return removed;
  }

  function listPosts(filter: PostFilter = {}): Post[] {
    const authorId = filter.authorId ?? '';
    const list = authorId ? posts.filter((post) => post.authorId === authorId) : [...posts];
    return list.sort((a, b) => b.createdAt - a.createdAt || orderOf(b.id) - orderOf(a.id));
  }

  function listComments(filter: CommentFilter = {}): Comment[] {
    const authorId = filter.authorId ?? '';
    const postId = filter.postId ?? '';
    const list = comments.filter(
      (comment) =>
        (!authorId || comment.authorId === authorId) && (!postId || comment.postId === postId)
    );
    return list.sort((a, b) => a.createdAt - b.createdAt || orderOf(a.id) - orderOf(b.id));
  }

  function bookmarkOrderKey(userId: string, postId: string): string {
    return `bookmark:${userId}:${postId}`;
  }

  function ownBookmarks(userId: string): Map<string, BookmarkRecord> {
    let inner = bookmarks.get(userId);
    if (!inner) {
      inner = new Map();
      bookmarks.set(userId, inner);
    }
    return inner;
  }

  function listBookmarks(userId: string): BookmarkRecord[] {
    const own = bookmarks.get(userId);
    if (!own) return [];

    return [...own.values()]
      .sort(
        (a, b) =>
          b.createdAt - a.createdAt ||
          orderOf(bookmarkOrderKey(b.userId, b.postId)) -
            orderOf(bookmarkOrderKey(a.userId, a.postId))
      )
      .map((item) => ({ ...item }));
  }

  return {
    now: () => clock(),
    makeId,

    listUsers: () => users.map((user) => ({ ...user })),
    // 返回副本：内部记录带凭据字段，避免调用方持有引用后误改/误泄
    findUserById(userId) {
      const user = users.find((item) => item.id === userId);
      return user ? { ...user } : null;
    },
    findUserByUsername(username) {
      const normalized = username.trim().toLowerCase();
      return users.find((user) => user.usernameLower === normalized) ?? null;
    },
    addUser(user) {
      users.push(user);
      remember(user.id);
      return { ...user };
    },

    listPosts,
    findPost(postId) {
      const post = posts.find((item) => item.id === postId);
      return post ? { ...post } : null;
    },
    addPost(post) {
      posts.push(post);
      remember(post.id);
      return { ...post };
    },

    listComments,
    addComment(comment) {
      comments.push(comment);
      remember(comment.id);
      return { ...comment };
    },

    findLike(postId, userId) {
      const like = likes.get(postId)?.get(userId);
      return like ? { ...like } : null;
    },
    addLike(like) {
      const inner = likes.get(like.postId);
      if (inner?.has(like.userId)) return false;

      if (inner) {
        inner.set(like.userId, { ...like });
      } else {
        likes.set(like.postId, new Map([[like.userId, { ...like }]]));
      }
      return true;
    },
    removeLike(postId, userId) {
      const inner = likes.get(postId);
      if (!inner?.delete(userId)) return false;
      if (inner.size === 0) likes.delete(postId);
      return true;
    },
    countLikes(postId) {
      return likes.get(postId)?.size ?? 0;
    },
    listLikeCounts() {
      const counts: Record<string, number> = {};
      for (const [postId, inner] of likes) {
        if (inner.size > 0) counts[postId] = inner.size;
      }
      return counts;
    },
    listLikedPostIds(userId) {
      const postIds: string[] = [];
      for (const [postId, inner] of likes) {
        if (inner.has(userId)) postIds.push(postId);
      }
      return postIds;
    },

    findBookmark(postId, userId) {
      const bookmark = bookmarks.get(userId)?.get(postId);
      return bookmark ? { ...bookmark } : null;
    },
    addBookmark(bookmark) {
      const own = ownBookmarks(bookmark.userId);
      if (own.has(bookmark.postId)) return false;

      own.set(bookmark.postId, { ...bookmark });
      remember(bookmarkOrderKey(bookmark.userId, bookmark.postId));
      return true;
    },
    removeBookmark(postId, userId) {
      const own = bookmarks.get(userId);
      if (!own?.delete(postId)) return false;

      order.delete(bookmarkOrderKey(userId, postId));
      if (own.size === 0) bookmarks.delete(userId);
      return true;
    },
    listBookmarks,

    createSession(userId) {
      pruneExpiredSessions();
      const createdAt = clock();
      const session: SessionRecord = {
        token: randomUUID(),
        userId,
        createdAt,
        expiresAt: createdAt + SESSION_TTL_MS,
      };
      sessions.set(session.token, session);
      return { ...session };
    },
    findSession(token) {
      pruneExpiredSessions();
      const session = sessions.get(token);
      return session ? { ...session } : null;
    },
    deleteSession(token) {
      sessions.delete(token);
    },
    pruneExpiredSessions,
  };
}
