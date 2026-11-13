import { afterEach, describe, expect, it } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import ComposerBox from '@/components/ComposerBox.vue';
import { ApiError } from '@/core/api';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import { useUiStore } from '@/stores/ui';
import { installMockApi, resetMockApi } from '../helpers/api';
import { sampleUser } from '../helpers/fixtures';
import { installPinia, mountWithPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

describe('ComposerBox', () => {
  it('游客看到登录引导，点击后打开登录弹窗', async () => {
    installMockApi();
    installPinia();
    const ui = useUiStore();
    const wrapper = mountWithPinia(ComposerBox);

    expect(wrapper.text()).toContain('登录后即可发布');

    await wrapper.get('button').trigger('click');
    expect(ui.authOpen).toBe(true);
    wrapper.unmount();
  });

  it('登录用户输入内容后才能发布，发布后清空并提示', async () => {
    installMockApi({ currentUser: sampleUser() });
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    const ui = useUiStore();
    auth.currentUser = sampleUser();

    const wrapper = mountWithPinia(ComposerBox);
    const textarea = wrapper.get('textarea');
    const button = wrapper.get('button[type="submit"]');

    expect(textarea.attributes('maxlength')).toBe('280');
    expect(button.attributes('disabled')).toBeDefined();

    await textarea.setValue('  今天也要写代码  ');
    expect(button.attributes('disabled')).toBeUndefined();

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(blog.posts).toHaveLength(1);
    expect(blog.posts[0].content).toBe('今天也要写代码');
    expect((textarea.element as HTMLTextAreaElement).value).toBe('');
    expect(ui.toastMessage).toBe('已发布');
    wrapper.unmount();
  });

  it('Ctrl + Enter 也能发布，空白内容不会提交', async () => {
    installMockApi({ currentUser: sampleUser() });
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    auth.currentUser = sampleUser();

    const wrapper = mountWithPinia(ComposerBox);
    const textarea = wrapper.get('textarea');

    await textarea.setValue('   ');
    await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true });
    await flushPromises();
    expect(blog.posts).toHaveLength(0);

    await textarea.setValue('快捷键发布');
    await textarea.trigger('keydown', { key: 'Enter', ctrlKey: true });
    await flushPromises();
    expect(blog.posts).toHaveLength(1);
    wrapper.unmount();
  });

  it('接口失败时在提示区显示服务端错误', async () => {
    const api = installMockApi({ currentUser: sampleUser() });
    api.createPost.mockRejectedValue(new ApiError('UNAUTHORIZED', '请先登录', 401));
    installPinia();
    const auth = useAuthStore();
    auth.currentUser = sampleUser();

    const wrapper = mountWithPinia(ComposerBox);

    await wrapper.get('textarea').setValue('写不进去');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('.composer-hint').text()).toBe('请先登录');
    expect(wrapper.get('.composer-hint').classes()).toContain('is-error');
    wrapper.unmount();
  });
});
