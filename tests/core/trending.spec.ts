import { describe, expect, it, vi } from 'vitest';
import {
  createMemoryCache,
  FALLBACK_TRENDING,
  loadTrending,
  normalizeTrending,
  TRENDING_CACHE_TTL,
} from '@/core/trending';

const payload = {
  updatedAt: '2026-11-13 09:40',
  source: '演示数据',
  items: [
    { title: ' 第一条 ', hot: '100万', tag: '科技' },
    { title: '第二条' },
  ],
};

function fakeFetcher(body: unknown = payload) {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      ({ ok: true, status: 200, json: async () => body }) as unknown as Response
  );
}

describe('normalizeTrending', () => {
  it('清洗标题并只取前 10 条', () => {
    const items = Array.from({ length: 14 }, (_, index) => ({ title: ` 标题${index} ` }));
    const result = normalizeTrending({ source: '来源', items });

    expect(result?.items).toHaveLength(10);
    expect(result?.items[0]).toEqual({ title: '标题0', hot: '', tag: '' });
  });

  it('丢弃无标题项，缺失字段补默认值', () => {
    const result = normalizeTrending({
      items: [{ title: '' }, { title: 'ok' }, { hot: '1' }, null],
    });

    expect(result?.items).toEqual([{ title: 'ok', hot: '', tag: '' }]);
    expect(result?.source).toBe('未知来源');
    expect(result?.updatedAt).toBe('');
  });

  it('数据整体不合法时返回 null', () => {
    expect(normalizeTrending(null)).toBeNull();
    expect(normalizeTrending({ items: 'nope' })).toBeNull();
    expect(normalizeTrending({ items: [] })).toBeNull();
  });
});

describe('loadTrending', () => {
  it('成功拉取后写入内存缓存，不碰浏览器存储', async () => {
    const cache = createMemoryCache();
    const fetcher = fakeFetcher();

    const result = await loadTrending({ cache, fetcher, now: () => 1_000 });

    expect(result.items).toHaveLength(2);
    expect(result.fromCache).toBe(false);
    expect(result.fallback).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.read()?.items).toHaveLength(2);
    expect(localStorage.length).toBe(0);
  });

  it('5 分钟内的缓存直接复用，不再请求', async () => {
    const cache = createMemoryCache();
    await loadTrending({ cache, fetcher: fakeFetcher(), now: () => 1_000 });
    const fetcher = fakeFetcher();

    const result = await loadTrending({
      cache,
      fetcher,
      now: () => 1_000 + TRENDING_CACHE_TTL - 1,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it('缓存过期后重新请求；force 时忽略缓存', async () => {
    const cache = createMemoryCache();
    await loadTrending({ cache, fetcher: fakeFetcher(), now: () => 1_000 });

    const expired = fakeFetcher();
    await loadTrending({ cache, fetcher: expired, now: () => 1_000 + TRENDING_CACHE_TTL + 1 });
    expect(expired).toHaveBeenCalledTimes(1);

    const forced = fakeFetcher();
    await loadTrending({ cache, fetcher: forced, now: () => 1_000, force: true });
    expect(forced).toHaveBeenCalledTimes(1);
  });

  it('请求失败时回退旧缓存并标记 stale', async () => {
    const cache = createMemoryCache();
    await loadTrending({ cache, fetcher: fakeFetcher(), now: () => 1_000 });

    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    });
    const result = await loadTrending({ cache, fetcher, now: () => 10_000_000 });

    expect(result.stale).toBe(true);
    expect(result.fromCache).toBe(true);
    expect(result.items[0].title).toBe('第一条');
    expect(result.source).toBe('演示数据');
  });

  it('没有缓存时回退内置演示数据', async () => {
    const fetcher = vi.fn(
      async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response
    );

    const result = await loadTrending({ cache: createMemoryCache(), fetcher, now: () => 1 });

    expect(result.fallback).toBe(true);
    expect(result.items).toEqual(FALLBACK_TRENDING);
    expect(result.source).toBe('内置演示数据');
  });

  it('请求带上超时信号', async () => {
    const fetcher = fakeFetcher();

    await loadTrending({ cache: createMemoryCache(), fetcher, now: () => 1 });

    const init = fetcher.mock.calls[0][1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
