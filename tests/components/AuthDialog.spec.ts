import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import AuthDialog from '@/components/AuthDialog.vue';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { installMockApi, resetMockApi } from '../helpers/api';
import { sampleUser } from '../helpers/fixtures';
import { installPinia, mountWithPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

describe('AuthDialog', () => {
  it('默认展示登录表单，空提交给出提示', async () => {
    installMockApi();
    installPinia();
    const ui = useUiStore();
    ui.openAuth('login');

    const wrapper = mountWithPinia(AuthDialog, { attachTo: document.body });
    const dialog = wrapper.get('dialog');

    expect(dialog.attributes('open')).toBeDefined();
    expect(wrapper.get('#auth-title').text()).toBe('登录');
    expect(wrapper.find('.field input[type="password"]').exists()).toBe(true);

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('.auth-error').text()).toBe('请输入用户名和密码');
    wrapper.unmount();
  });

  it('注册成功后关闭弹窗并提示欢迎', async () => {
    installMockApi();
    installPinia();
    const auth = useAuthStore();
    const ui = useUiStore();
    ui.openAuth('register');

    const wrapper = mountWithPinia(AuthDialog, { attachTo: document.body });
    expect(wrapper.get('#auth-title').text()).toBe('创建账号');

    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('Alice');
    await inputs[2].setValue('secret123');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(auth.currentUser?.username).toBe('Alice');
    expect(ui.authOpen).toBe(false);
    expect(ui.toastMessage).toBe('账号已创建，欢迎');
    expect(wrapper.get('dialog').attributes('open')).toBeUndefined();
    wrapper.unmount();
  });

  it('密码错误时在弹窗内显示统一错误', async () => {
    installMockApi({ users: [sampleUser({ username: 'alice', displayName: 'Alice' })] });
    installPinia();
    const ui = useUiStore();
    ui.openAuth('login');

    const wrapper = mountWithPinia(AuthDialog, { attachTo: document.body });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('alice');
    await inputs[1].setValue('wrong-pass');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('.auth-error').text()).toBe('用户名或密码不正确');
    expect(ui.authOpen).toBe(true);
    wrapper.unmount();
  });

  it('打开时调用 showModal()，获得真正的模态行为', async () => {
    installMockApi();
    installPinia();

    const proto = HTMLDialogElement.prototype;
    if (typeof proto.showModal !== 'function') {
      proto.showModal = function fallback(this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
    const spy = vi.spyOn(proto, 'showModal').mockImplementation(function modal(
      this: HTMLDialogElement
    ) {
      this.setAttribute('open', '');
    });

    const ui = useUiStore();
    ui.openAuth('login');

    const wrapper = mountWithPinia(AuthDialog, { attachTo: document.body });
    await nextTick();

    expect(spy).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('可以切换登录与注册模式', async () => {
    installMockApi();
    installPinia();
    const ui = useUiStore();
    ui.openAuth('login');

    const wrapper = mountWithPinia(AuthDialog, { attachTo: document.body });
    expect(wrapper.text()).toContain('还没有账号？');

    await wrapper.get('.auth-switch .link-btn').trigger('click');

    expect(ui.authMode).toBe('register');
    expect(wrapper.get('#auth-title').text()).toBe('创建账号');
    expect(wrapper.text()).toContain('已有账号？');
    wrapper.unmount();
  });

  it('关闭按钮收起弹窗', async () => {
    installMockApi();
    installPinia();
    const ui = useUiStore();
    ui.openAuth('login');

    const wrapper = mountWithPinia(AuthDialog, { attachTo: document.body });
    await wrapper.get('.icon-btn').trigger('click');

    expect(ui.authOpen).toBe(false);
    wrapper.unmount();
  });
});
