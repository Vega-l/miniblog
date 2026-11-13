import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import SiteHeader from '@/components/SiteHeader.vue';
import { ApiError } from '@/core/api';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { installMockApi, resetMockApi } from '../helpers/api';
import { sampleUser } from '../helpers/fixtures';
import { installPinia, mountWithPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

const user = sampleUser();

describe('SiteHeader', () => {
  it('未登录时显示登录入口', () => {
    installMockApi();
    installPinia();
    const ui = useUiStore();

    const wrapper = mountWithPinia(SiteHeader);
    expect(wrapper.find('.user-chip').exists()).toBe(false);

    wrapper.get('button').trigger('click');
    expect(ui.authOpen).toBe(true);
    wrapper.unmount();
  });

  it('登录后显示昵称，点击进入个人主页', async () => {
    installMockApi({ users: [user], currentUser: user });
    installPinia();
    const auth = useAuthStore();
    const ui = useUiStore();
    await auth.hydrate();

    const wrapper = mountWithPinia(SiteHeader);
    expect(wrapper.get('.user-chip-name').text()).toBe('爱丽丝');

    await wrapper.get('.user-chip').trigger('click');
    expect(ui.view).toBe('profile');
    wrapper.unmount();
  });

  it('退出成功后提示已退出登录', async () => {
    installMockApi({ users: [user], currentUser: user });
    installPinia();
    const auth = useAuthStore();
    const ui = useUiStore();
    await auth.hydrate();

    const wrapper = mountWithPinia(SiteHeader);
    await wrapper.get('.btn-ghost').trigger('click');
    await flushPromises();

    expect(auth.currentUser).toBeNull();
    expect(ui.toastMessage).toBe('已退出登录');
    wrapper.unmount();
  });

  it('退出失败时提示服务端错误，不谎称已退出', async () => {
    const api = installMockApi({ users: [user], currentUser: user });
    api.logout.mockRejectedValue(new ApiError('NETWORK', '无法连接到服务器，请确认后端已启动', 0));
    installPinia();
    const auth = useAuthStore();
    const ui = useUiStore();
    await auth.hydrate();

    const wrapper = mountWithPinia(SiteHeader);
    await wrapper.get('.btn-ghost').trigger('click');
    await flushPromises();

    expect(ui.toastMessage).toBe('无法连接到服务器，请确认后端已启动');
    wrapper.unmount();
  });
});
