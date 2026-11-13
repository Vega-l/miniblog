import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import App from '@/App.vue';
import { ApiError } from '@/core/api';
import { resetTrendingCache } from '@/core/trending';
import { useUiStore } from '@/stores/ui';
import { installMockApi, resetMockApi } from '../helpers/api';
import { sampleComment, samplePost, sampleUser } from '../helpers/fixtures';
import { installPinia, mountWithPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
  resetTrendingCache();
  vi.unstubAllGlobals();
});

const user = sampleUser();

function seedBackend(patch: Parameters<typeof installMockApi>[0] = {}) {
  return installMockApi({
    users: [user],
    posts: [samplePost()],
    comments: [sampleComment()],
    ...patch,
  });
}

function stubTrending() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            source: '测试源',
            updatedAt: '09:00',
            items: [{ title: '热搜一', hot: '10万', tag: '' }],
          }),
        }) as unknown as Response
    )
  );
}

describe('App', () => {
  it('游客可以浏览时间线、评论与热搜', async () => {
    seedBackend();
    installPinia();
    stubTrending();

    const wrapper = mountWithPinia(App);
    await flushPromises();
    await flushPromises();

    expect(wrapper.find('.site-header').exists()).toBe(true);
    expect(wrapper.get('.post-content').text()).toBe('第一条动态');
    expect(wrapper.get('.post-author').text()).toBe('爱丽丝');
    expect(wrapper.get('.action-btn--comments').text()).toContain('1');
    expect(wrapper.text()).toContain('登录后即可发布');
    expect(wrapper.findAll('.trend-item')).toHaveLength(1);

    wrapper.unmount();
  });

  it('登录用户可以进入个人主页', async () => {
    seedBackend({ currentUser: user });
    installPinia();
    stubTrending();

    const wrapper = mountWithPinia(App);
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('.user-chip-name').text()).toBe('爱丽丝');
    await wrapper.get('.user-chip').trigger('click');

    expect(wrapper.find('.profile').exists()).toBe(true);
    expect(wrapper.get('.profile-stats').text()).toBe('1 条帖子 · 1 条评论');

    wrapper.unmount();
  });

  it('游客点击发布引导会打开登录弹窗，并可切换到注册', async () => {
    seedBackend();
    installPinia();
    stubTrending();

    const ui = useUiStore();
    const wrapper = mountWithPinia(App, { attachTo: document.body });

    await wrapper.get('.composer-guest .btn-primary').trigger('click');
    expect(ui.authOpen).toBe(true);
    expect(wrapper.get('#auth-title').text()).toBe('登录');

    await wrapper.get('.auth-switch .link-btn').trigger('click');
    expect(wrapper.get('#auth-title').text()).toBe('创建账号');

    wrapper.unmount();
  });

  it('时间线加载失败时展示错误并可重试', async () => {
    const api = seedBackend();
    api.posts.mockRejectedValueOnce(
      new ApiError('NETWORK', '无法连接到服务器，请确认后端已启动', 0)
    );
    installPinia();
    stubTrending();

    const wrapper = mountWithPinia(App);
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('.empty-state[role="alert"]').text()).toContain('无法连接到服务器');

    await wrapper.get('.empty-state .link-btn').trigger('click');
    await flushPromises();
    await flushPromises();

    expect(wrapper.get('.post-content').text()).toBe('第一条动态');
    wrapper.unmount();
  });

  it('未登录点击个人主页入口不会进入主页', async () => {
    seedBackend();
    installPinia();
    stubTrending();

    const wrapper = mountWithPinia(App);
    expect(wrapper.find('.user-chip').exists()).toBe(false);
    expect(wrapper.find('.profile').exists()).toBe(false);

    wrapper.unmount();
  });
});
