import { afterEach, describe, expect, it } from 'vitest';
import type { EngagementSummary } from '@shared/contract';
import { ApiError } from '@/core/api';
import { useEngagementStore } from '@/stores/engagement';
import { installMockApi, resetMockApi, type MockApiSeed } from '../helpers/api';
import { samplePost, sampleUser } from '../helpers/fixtures';
import { installPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

function setup(seed: MockApiSeed = {}) {
  const api = installMockApi({
    users: [sampleUser()],
    posts: [samplePost()],
    currentUser: sampleUser(),
    ...seed,
  });
  installPinia();
  return { api, store: useEngagementStore() };
}

describe('useEngagementStore.hydrate', () => {
  it('载入点赞总数、本人点赞与收藏', async () => {
    const { api, store } = setup({
      likes: [
        { postId: 'p1', userId: 'u1', createdAt: 1 },
        { postId: 'p1', userId: 'u2', createdAt: 2 },
      ],
      bookmarks: [{ postId: 'p1', userId: 'u1', createdAt: 3 }],
    });

    await store.hydrate();

    expect(api.engagement).toHaveBeenCalledTimes(1);
    expect(store.likeCountOf('p1')).toBe(2);
    expect(store.likeCountOf('p2')).toBe(0);
    expect(store.isLiked('p1')).toBe(true);
    expect(store.isLiked('p2')).toBe(false);
    expect(store.isBookmarked('p1')).toBe(true);
    expect(store.bookmarks.map((bookmark) => bookmark.postId)).toEqual(['p1']);
    expect(store.loading).toBe(false);
  });

  it('游客只拿到公开的点赞总数', async () => {
    const { store } = setup({
      currentUser: null,
      likes: [{ postId: 'p1', userId: 'u2', createdAt: 1 }],
      bookmarks: [{ postId: 'p1', userId: 'u2', createdAt: 2 }],
    });

    await store.hydrate();

    expect(store.likeCountOf('p1')).toBe(1);
    expect(store.isLiked('p1')).toBe(false);
    expect(store.bookmarks).toEqual([]);
  });

  it('加载失败时保留旧数据并写入提示', async () => {
    const { api, store } = setup({
      likes: [{ postId: 'p1', userId: 'u1', createdAt: 1 }],
    });
    await store.hydrate();

    api.engagement.mockRejectedValueOnce(new ApiError('NETWORK', '', 0));
    await store.hydrate();

    expect(store.likeCountOf('p1')).toBe(1);
    expect(store.error).toBe('加载互动数据失败，请稍后重试');
    expect(store.loading).toBe(false);
  });

  it('hydrate 竞态：先发出的旧响应不会覆盖新数据', async () => {
    const { api, store } = setup();
    let release: (value: EngagementSummary) => void = () => {};

    api.engagement.mockImplementationOnce(
      () =>
        new Promise<EngagementSummary>((resolve) => {
          release = resolve;
        })
    );

    const stale = store.hydrate();
    await store.hydrate();
    release({ likeCounts: { p1: 99 }, likedPostIds: [], bookmarks: [] });
    await stale;

    expect(store.likeCountOf('p1')).toBe(0);
  });
});

describe('useEngagementStore.toggleLike', () => {
  it('点赞后计数与状态更新，再次点击取消', async () => {
    const { api, store } = setup();
    await store.hydrate();

    await expect(store.toggleLike('p1')).resolves.toEqual({ ok: true, active: true, count: 1 });
    expect(api.like).toHaveBeenCalledWith('p1');
    expect(store.isLiked('p1')).toBe(true);
    expect(store.likeCountOf('p1')).toBe(1);

    await expect(store.toggleLike('p1')).resolves.toEqual({ ok: true, active: false, count: 0 });
    expect(api.unlike).toHaveBeenCalledWith('p1');
    expect(store.isLiked('p1')).toBe(false);
    expect(store.likeCountOf('p1')).toBe(0);
  });

  it('失败时返回可读错误，状态保持不变', async () => {
    const { api, store } = setup();
    await store.hydrate();
    api.like.mockRejectedValue(new ApiError('NETWORK', '', 0));

    await expect(store.toggleLike('p1')).resolves.toEqual({
      ok: false,
      error: '点赞失败，请稍后重试',
    });
    expect(store.isLiked('p1')).toBe(false);
    expect(store.likeCountOf('p1')).toBe(0);
  });

  it('取消点赞失败时使用取消文案', async () => {
    const { api, store } = setup({
      likes: [{ postId: 'p1', userId: 'u1', createdAt: 1 }],
    });
    await store.hydrate();
    api.unlike.mockRejectedValue(new ApiError('NETWORK', '', 0));

    await expect(store.toggleLike('p1')).resolves.toEqual({
      ok: false,
      error: '取消点赞失败，请稍后重试',
    });
    expect(store.isLiked('p1')).toBe(true);
  });
});

describe('useEngagementStore.toggleBookmark', () => {
  it('收藏后进入列表，取消后移除', async () => {
    const { api, store } = setup();
    await store.hydrate();

    await expect(store.toggleBookmark('p1')).resolves.toEqual({ ok: true, active: true });
    expect(api.bookmark).toHaveBeenCalledWith('p1');
    expect(store.isBookmarked('p1')).toBe(true);
    expect(store.bookmarks.map((bookmark) => bookmark.postId)).toEqual(['p1']);

    await expect(store.toggleBookmark('p1')).resolves.toEqual({ ok: true, active: false });
    expect(api.unbookmark).toHaveBeenCalledWith('p1');
    expect(store.isBookmarked('p1')).toBe(false);
    expect(store.bookmarks).toEqual([]);
  });

  it('收藏失败时返回错误且不写入列表', async () => {
    const { api, store } = setup();
    await store.hydrate();
    api.bookmark.mockRejectedValue(new ApiError('NETWORK', '', 0));

    await expect(store.toggleBookmark('p1')).resolves.toEqual({
      ok: false,
      error: '收藏失败，请稍后重试',
    });
    expect(store.isBookmarked('p1')).toBe(false);
  });
});

describe('useEngagementStore.reset', () => {
  it('退出登录后清空所有互动状态', async () => {
    const { store } = setup({
      likes: [{ postId: 'p1', userId: 'u1', createdAt: 1 }],
      bookmarks: [{ postId: 'p1', userId: 'u1', createdAt: 2 }],
    });
    await store.hydrate();

    store.reset();

    expect(store.likeCountOf('p1')).toBe(0);
    expect(store.likedPostIds).toEqual([]);
    expect(store.bookmarks).toEqual([]);
    expect(store.error).toBe('');
  });
});
