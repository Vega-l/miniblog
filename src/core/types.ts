export type {
  BookmarkEntry,
  BookmarkResult,
  Comment,
  EngagementSummary,
  LikeResult,
  Post,
  PublicUser,
} from '@shared/contract';

import type { PublicUser } from '@shared/contract';

/** 前端统一用 User 表示「可公开展示的用户」。 */
export type User = PublicUser;

export interface TrendingItem {
  title: string;
  hot: string;
  tag: string;
}

export interface TrendingPayload {
  items: TrendingItem[];
  source: string;
  updatedAt: string;
}
