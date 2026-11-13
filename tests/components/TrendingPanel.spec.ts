import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import TrendingPanel from '@/components/TrendingPanel.vue';
import { resetTrendingCache } from '@/core/trending';
import { installPinia, mountWithPinia, undoPinia } from '../helpers/store';

beforeEach(() => {
  resetTrendingCache();
});

afterEach(() => {
  undoPinia();
  vi.unstubAllGlobals();
});

function stubFetch() {
  const fetcher = vi.fn(
    async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          source: '测试源',
          updatedAt: '12:30',
          items: [
            { title: '热搜一', hot: '10万', tag: '' },
            { title: '热搜二', hot: '9万', tag: '' },
          ],
        }),
      }) as unknown as Response
  );
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

describe('TrendingPanel', () => {
  it('挂载后加载并渲染热搜，来源与时间可见', async () => {
    installPinia();
    stubFetch();

    const wrapper = mountWithPinia(TrendingPanel);
    await flushPromises();
    await flushPromises();

    expect(wrapper.findAll('.trend-item')).toHaveLength(2);
    expect(wrapper.get('.trend-title').text()).toBe('热搜一');
    expect(wrapper.get('.trend-foot').text()).toContain('更新于 12:30');
    expect(wrapper.get('.trend-source').text()).toBe('测试源');
    wrapper.unmount();
  });

  it('点击刷新按钮强制重新请求', async () => {
    installPinia();
    const fetcher = stubFetch();

    const wrapper = mountWithPinia(TrendingPanel);
    await flushPromises();
    await flushPromises();

    await wrapper.get('.trend-refresh').trigger('click');
    await flushPromises();
    await flushPromises();

    expect(fetcher).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('请求失败时展示内置演示数据', async () => {
    installPinia();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      })
    );

    const wrapper = mountWithPinia(TrendingPanel);
    await flushPromises();
    await flushPromises();

    expect(wrapper.findAll('.trend-item')).toHaveLength(10);
    expect(wrapper.get('.trend-source').text()).toBe('内置演示数据');
    wrapper.unmount();
  });
});
