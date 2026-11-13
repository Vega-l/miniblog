/**
 * 前后端共享契约：长度上限、校验规则、DTO 与错误码。
 * 前端（src/）与后端（server/）都从这里取值，避免两边各写一份。
 */

export const API_BASE = '/api';
export const SESSION_COOKIE = 'miniblog_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const LIMITS = {
  post: 280,
  comment: 140,
  username: 16,
  displayName: 16,
  password: 64,
  trendTitle: 80,
  trendingItems: 10,
} as const;

export const USERNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,16}$/;
export const MIN_PASSWORD_LENGTH = 6;

/** 对外可见的用户字段，永远不包含 salt / passwordHash。 */
export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  createdAt: number;
}

export interface Post {
  id: string;
  authorId: string;
  content: string;
  createdAt: number;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  content: string;
  createdAt: number;
}

/** 点赞记录：「帖子 + 用户」唯一。 */
export interface LikeRecord {
  postId: string;
  userId: string;
  createdAt: number;
}

/** 收藏记录：「帖子 + 用户」唯一；列表按 createdAt 倒序。 */
export interface BookmarkRecord {
  postId: string;
  userId: string;
  createdAt: number;
}

/** 返回给前端的收藏条目：不带 userId，避免泄露他人的收藏归属。 */
export interface BookmarkEntry {
  postId: string;
  createdAt: number;
}

/** 互动汇总：点赞总数对所有人生效，点赞状态与收藏只属于当前会话用户。 */
export interface EngagementSummary {
  /** 只包含至少有一条点赞的帖子。 */
  likeCounts: Record<string, number>;
  /** 当前用户点过赞的帖子；游客为空数组。 */
  likedPostIds: string[];
  /** 当前用户的收藏，最新在前；游客为空数组。 */
  bookmarks: BookmarkEntry[];
}

export interface LikeResult {
  postId: string;
  likeCount: number;
  liked: boolean;
}

export interface BookmarkResult {
  postId: string;
  bookmarked: boolean;
}

export type ApiErrorCode =
  | 'INVALID_INPUT'
  | 'USERNAME_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INTERNAL';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export interface RegisterRequest {
  username: string;
  displayName?: string;
  password: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface CreatePostRequest {
  content: string;
}

export interface CreateCommentRequest {
  content: string;
}

export interface SessionPayload {
  user: PublicUser | null;
}

export interface UserPayload {
  user: PublicUser;
}

export interface UsersPayload {
  users: PublicUser[];
}

export interface PostsPayload {
  posts: Post[];
}

export interface PostPayload {
  post: Post;
}

export interface CommentsPayload {
  comments: Comment[];
}

export interface CommentPayload {
  comment: Comment;
}

export interface EngagementPayload {
  engagement: EngagementSummary;
}

export interface LikePayload {
  like: LikeResult;
}

export interface BookmarkPayload {
  bookmark: BookmarkResult;
}

export interface HealthPayload {
  status: 'ok';
}

/** 服务器可直接复用的错误文案与状态码。 */
export const API_ERRORS: Record<ApiErrorCode, { status: number; message: string }> = {
  INVALID_INPUT: { status: 400, message: '提交的内容不符合要求' },
  USERNAME_TAKEN: { status: 409, message: '该用户名已被占用' },
  INVALID_CREDENTIALS: { status: 401, message: '用户名或密码不正确' },
  UNAUTHORIZED: { status: 401, message: '请先登录' },
  FORBIDDEN: { status: 403, message: '没有权限执行该操作' },
  NOT_FOUND: { status: 404, message: '资源不存在' },
  INTERNAL: { status: 500, message: '服务器内部错误' },
};
