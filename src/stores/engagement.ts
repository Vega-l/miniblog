import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiClient, apiErrorMessage } from '@/core/api';
import type { BookmarkEntry } from '@/core/types';

export interface ToggleResult {
  ok: boolean;
  active?: boolean;
  count?: number;
  error?: string;
}

export const useEngagementStore = defineStore('engagement', () => {
  const api = apiClient();

  const likeCounts = ref<Record<string, number>>({});
  const likedPostIds = ref<string[]>([]);
  const bookmarks = ref<BookmarkEntry[]>([]);
  const loading = ref(false);
  const error = ref('');

  // 只采纳最后一次 hydrate 的响应，避免登录切换时旧请求覆盖新状态
  let requestTicket = 0;

  async function hydrate(): Promise<void> {
    const ticket = (requestTicket += 1);
    loading.value = true;
    error.value = '';

    try {
      const summary = await api.engagement();
      if (ticket !== requestTicket) return;

      likeCounts.value = { ...summary.likeCounts };
      likedPostIds.value = [...summary.likedPostIds];
      bookmarks.value = [...summary.bookmarks];
    } catch (caught) {
      if (ticket === requestTicket) {
        error.value = apiErrorMessage(caught, '加载互动数据失败，请稍后重试');
      }
    } finally {
      if (ticket === requestTicket) loading.value = false;
    }
  }

  function reset(): void {
    requestTicket += 1;
    likeCounts.value = {};
    likedPostIds.value = [];
    bookmarks.value = [];
    loading.value = false;
    error.value = '';
  }

  function likeCountOf(postId: string): number {
    return likeCounts.value[postId] ?? 0;
  }

  function isLiked(postId: string): boolean {
    return likedPostIds.value.includes(postId);
  }

  function isBookmarked(postId: string): boolean {
    return bookmarks.value.some((bookmark) => bookmark.postId === postId);
  }

  /** 帖子被删除后，本地也要立刻忘掉它的计数、点赞与收藏。 */
  function forgetPost(postId: string): void {
    const nextCounts = { ...likeCounts.value };
    delete nextCounts[postId];

    likeCounts.value = nextCounts;
    likedPostIds.value = likedPostIds.value.filter((id) => id !== postId);
    bookmarks.value = bookmarks.value.filter((bookmark) => bookmark.postId !== postId);
  }

  async function toggleLike(postId: string): Promise<ToggleResult> {
    const liked = isLiked(postId);

    try {
      const result = liked ? await api.unlike(postId) : await api.like(postId);

      likeCounts.value = { ...likeCounts.value, [postId]: result.likeCount };
      likedPostIds.value = result.liked
        ? [...new Set([...likedPostIds.value, postId])]
        : likedPostIds.value.filter((id) => id !== postId);

      return { ok: true, active: result.liked, count: result.likeCount };
    } catch (caught) {
      return {
        ok: false,
        error: apiErrorMessage(caught, liked ? '取消点赞失败，请稍后重试' : '点赞失败，请稍后重试'),
      };
    }
  }

  async function toggleBookmark(postId: string): Promise<ToggleResult> {
    const bookmarked = isBookmarked(postId);

    try {
      const result = bookmarked ? await api.unbookmark(postId) : await api.bookmark(postId);

      bookmarks.value = result.bookmarked
        ? [
            { postId, createdAt: Date.now() },
            ...bookmarks.value.filter((bookmark) => bookmark.postId !== postId),
          ]
        : bookmarks.value.filter((bookmark) => bookmark.postId !== postId);

      return { ok: true, active: result.bookmarked };
    } catch (caught) {
      return {
        ok: false,
        error: apiErrorMessage(
          caught,
          bookmarked ? '取消收藏失败，请稍后重试' : '收藏失败，请稍后重试'
        ),
      };
    }
  }

  return {
    likeCounts,
    likedPostIds,
    bookmarks,
    loading,
    error,
    hydrate,
    reset,
    likeCountOf,
    isLiked,
    isBookmarked,
    forgetPost,
    toggleLike,
    toggleBookmark,
  };
});
