import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import PostItem from '@/components/PostItem.vue';
import { ApiError } from '@/core/api';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import { useUiStore } from '@/stores/ui';
import { installMockApi, resetMockApi } from '../helpers/api';
import { samplePost, sampleUser } from '../helpers/fixtures';
import { installPinia, mountWithPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

describe('PostItem', () => {
  it('展示作者、正文与时间，未登录时引导登录评论', async () => {
    installMockApi();
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    auth.users = [sampleUser()];
    blog.posts = [samplePost()];

    const wrapper = mountWithPinia(PostItem, { props: { post: blog.posts[0] } });

    expect(wrapper.get('.post-author').text()).toBe('爱丽丝');
    expect(wrapper.get('.post-handle').text()).toBe('@alice');
    expect(wrapper.get('.post-content').text()).toBe('第一条动态');
    expect(wrapper.get('.post-time').text()).not.toBe('');
    expect(wrapper.get('.action-btn--comments').text()).toContain('评论');

    await wrapper.get('.action-btn--comments').trigger('click');

    expect(wrapper.find('.comments').exists()).toBe(true);
    expect(wrapper.find('.comment-form').exists()).toBe(false);
    expect(wrapper.get('.comment-lock').text()).toContain('后参与评论');
    wrapper.unmount();
  });

  it('登录用户可以评论，评论数实时更新', async () => {
    installMockApi({ currentUser: sampleUser(), posts: [samplePost()] });
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    auth.currentUser = sampleUser();
    auth.users = [sampleUser()];
    blog.posts = [samplePost()];

    const wrapper = mountWithPinia(PostItem, { props: { post: blog.posts[0] } });

    await wrapper.get('.action-btn--comments').trigger('click');
    expect(wrapper.text()).toContain('还没有评论');

    await wrapper.get('.comment-input').setValue('  说得好  ');
    await wrapper.get('.comment-form').trigger('submit');
    await flushPromises();

    expect(blog.comments).toHaveLength(1);
    expect(blog.comments[0].content).toBe('说得好');
    expect(wrapper.get('.action-btn--comments').text()).toContain('1');
    expect(wrapper.get('.comment-content').text()).toBe('说得好');
    expect((wrapper.get('.comment-input').element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });

  it('评论内容超过 140 字由服务端截断', async () => {
    installMockApi({ currentUser: sampleUser(), posts: [samplePost()] });
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    auth.currentUser = sampleUser();
    auth.users = [sampleUser()];
    blog.posts = [samplePost()];

    const wrapper = mountWithPinia(PostItem, { props: { post: blog.posts[0] } });
    await wrapper.get('.action-btn--comments').trigger('click');
    await wrapper.get('.comment-input').setValue('评'.repeat(200));
    await wrapper.get('.comment-form').trigger('submit');
    await flushPromises();

    expect(blog.comments[0].content).toHaveLength(140);
    wrapper.unmount();
  });

  it('评论失败时通过提示条显示错误', async () => {
    const api = installMockApi({ currentUser: sampleUser(), posts: [samplePost()] });
    api.createComment.mockRejectedValue(new Error('boom'));
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    const ui = useUiStore();
    auth.currentUser = sampleUser();
    auth.users = [sampleUser()];
    blog.posts = [samplePost()];

    const wrapper = mountWithPinia(PostItem, { props: { post: blog.posts[0] } });
    await wrapper.get('.action-btn--comments').trigger('click');
    await wrapper.get('.comment-input').setValue('写不进去');
    await wrapper.get('.comment-form').trigger('submit');
    await flushPromises();

    expect(ui.toastMessage).toBe('评论失败，请稍后重试');
    expect(blog.comments).toHaveLength(0);
    wrapper.unmount();
  });

  it('再次点击评论按钮会收起评论区', async () => {
    installMockApi();
    installPinia();
    const blog = useBlogStore();
    blog.posts = [samplePost()];
    blog.comments = [];

    const wrapper = mountWithPinia(PostItem, { props: { post: blog.posts[0] } });
    const button = wrapper.get('.action-btn--comments');

    expect(button.attributes('aria-expanded')).toBe('false');
    await button.trigger('click');
    expect(wrapper.get('.action-btn--comments').attributes('aria-expanded')).toBe('true');
    await wrapper.get('.action-btn--comments').trigger('click');
    expect(wrapper.find('.comments').exists()).toBe(false);
    wrapper.unmount();
  });

  it('定位原帖时高亮，1.6 秒后自动取消', async () => {
    installMockApi();
    installPinia();
    vi.useFakeTimers();
    const blog = useBlogStore();
    const ui = useUiStore();
    const post = samplePost();
    blog.posts = [post];
    ui.focusPost(post.id);

    const wrapper = mountWithPinia(PostItem, { props: { post } });
    await nextTick();

    expect(wrapper.classes()).toContain('is-highlight');
    expect(ui.isCommentsOpen(post.id)).toBe(true);

    vi.advanceTimersByTime(1600);
    await nextTick();

    expect(wrapper.classes()).not.toContain('is-highlight');
    vi.useRealTimers();
    wrapper.unmount();
  });

  it('作者查不到时显示「已注销用户」', () => {
    installMockApi();
    installPinia();
    const blog = useBlogStore();
    const post = samplePost({ authorId: 'ghost' });
    blog.posts = [post];

    const wrapper = mountWithPinia(PostItem, { props: { post } });

    expect(wrapper.get('.post-author').text()).toBe('已注销用户');
    expect(wrapper.get('.avatar').text()).toBe('?');
    wrapper.unmount();
  });
});

describe('PostItem · 点赞与收藏', () => {
  function mountAsUser() {
    const api = installMockApi({
      users: [sampleUser()],
      posts: [samplePost()],
      currentUser: sampleUser(),
    });
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    auth.users = [sampleUser()];
    auth.currentUser = sampleUser();
    blog.posts = [samplePost()];

    const wrapper = mountWithPinia(PostItem, { props: { post: blog.posts[0] } });
    return { api, wrapper, blog };
  }

  it('游客点赞或收藏都会引导登录，且不发送请求', async () => {
    const api = installMockApi({ posts: [samplePost()] });
    installPinia();
    const blog = useBlogStore();
    const ui = useUiStore();
    blog.posts = [samplePost()];

    const wrapper = mountWithPinia(PostItem, { props: { post: blog.posts[0] } });

    await wrapper.get('.action-btn--like').trigger('click');
    expect(ui.authOpen).toBe(true);
    expect(api.like).not.toHaveBeenCalled();

    ui.closeAuth();
    await wrapper.get('.action-btn--bookmark').trigger('click');
    expect(ui.authOpen).toBe(true);
    expect(api.bookmark).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('登录用户点赞后计数变化，再次点击取消', async () => {
    const { api, wrapper } = mountAsUser();
    const likeButton = wrapper.get('.action-btn--like');

    expect(likeButton.text()).toContain('点赞');
    expect(likeButton.attributes('aria-pressed')).toBe('false');

    await likeButton.trigger('click');
    await flushPromises();

    expect(api.like).toHaveBeenCalledWith('p1');
    expect(wrapper.get('.action-btn--like').text()).toContain('1');
    expect(wrapper.get('.action-btn--like').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('.action-btn--like').classes()).toContain('is-active');
    expect(useUiStore().toastMessage).toBe('已点赞');

    await wrapper.get('.action-btn--like').trigger('click');
    await flushPromises();

    expect(api.unlike).toHaveBeenCalledWith('p1');
    expect(wrapper.get('.action-btn--like').attributes('aria-pressed')).toBe('false');
    expect(useUiStore().toastMessage).toBe('已取消点赞');
    wrapper.unmount();
  });

  it('收藏后按钮切换为已收藏，再点取消', async () => {
    const { api, wrapper } = mountAsUser();

    await wrapper.get('.action-btn--bookmark').trigger('click');
    await flushPromises();

    expect(api.bookmark).toHaveBeenCalledWith('p1');
    expect(wrapper.get('.action-btn--bookmark').text()).toContain('已收藏');
    expect(wrapper.get('.action-btn--bookmark').classes()).toContain('is-active');
    expect(useUiStore().toastMessage).toBe('已收藏');

    await wrapper.get('.action-btn--bookmark').trigger('click');
    await flushPromises();

    expect(api.unbookmark).toHaveBeenCalledWith('p1');
    expect(wrapper.get('.action-btn--bookmark').text()).toContain('收藏');
    expect(useUiStore().toastMessage).toBe('已取消收藏');
    wrapper.unmount();
  });

  it('点赞失败时通过提示条报错，状态保持原样', async () => {
    const { api, wrapper } = mountAsUser();
    api.like.mockRejectedValueOnce(new ApiError('NETWORK', '', 0));

    await wrapper.get('.action-btn--like').trigger('click');
    await flushPromises();

    expect(useUiStore().toastMessage).toBe('点赞失败，请稍后重试');
    expect(wrapper.get('.action-btn--like').attributes('aria-pressed')).toBe('false');
    wrapper.unmount();
  });
});
