import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTrendingCache } from '@/core/trending';
import { useTrendingStore } from '@/stores/trending';
import { installPinia, undoPinia } from '../helpers/store';

beforeEach(() => {
  resetTrendingCache();
});

afterEach(() => {
  undoPinia();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function stubFetch(items = [{ title: '热搜一', hot: '1万', tag: '' }]) {
  const fetcher = vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ source: '测试源', updatedAt: '刚刚', items }),
      }) as unknown as Response
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('useTrendingStore', () => {
  it('加载成功后填充列表与来源', async () => {
    installPinia();
    stubFetch();
    const trending = useTrendingStore();

    await trending.load();

    expect(trending.items).toHaveLength(1);
    expect(trending.source).toBe('测试源');
    expect(trending.updatedAt).toBe('刚刚');
    expect(trending.status).toBe('ready');
    expect(trending.loading).toBe(false);
  });

  it('请求失败但已有内存缓存时标注「缓存」', async () => {
    installPinia();
    stubFetch();
    const trending = useTrendingStore();
    await trending.load();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    await trending.load(true);

    expect(trending.items).toHaveLength(1);
    expect(trending.items[0].title).toBe('热搜一');
    expect(trending.source).toBe('测试源（缓存）');
  });

  it('加载失败且没有缓存时使用内置演示数据', async () => {
    installPinia();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );
    const trending = useTrendingStore();

    await trending.load();

    expect(trending.items).toHaveLength(10);
    expect(trending.source).toBe('内置演示数据');
  });

  it('并发刷新只触发一次请求', async () => {
    installPinia();
    const fetcher = stubFetch();
    const trending = useTrendingStore();

    await Promise.all([trending.load(), trending.load()]);

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('强制刷新会忽略缓存', async () => {
    installPinia();
    const fetcher = stubFetch();
    const trending = useTrendingStore();

    await trending.load();
    await trending.load(true);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
