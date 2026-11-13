import { afterEach, describe, expect, it } from 'vitest';
import ProfileView from '@/components/ProfileView.vue';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import { useEngagementStore } from '@/stores/engagement';
import { useUiStore } from '@/stores/ui';
import { installMockApi, resetMockApi } from '../helpers/api';
import { sampleComment, samplePost, sampleUser } from '../helpers/fixtures';
import { installPinia, mountWithPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

function setupProfile() {
  installMockApi();
  installPinia();
  const auth = useAuthStore();
  const blog = useBlogStore();
  const ui = useUiStore();

  auth.users = [sampleUser()];
  auth.currentUser = sampleUser();
  blog.posts = [samplePost()];
  blog.comments = [sampleComment()];

  return { auth, blog, ui };
}

describe('ProfileView', () => {
  it('展示昵称、加入时间与统计', () => {
    setupProfile();
    const wrapper = mountWithPinia(ProfileView);

    expect(wrapper.get('#profile-name').text()).toBe('爱丽丝');
    expect(wrapper.get('.profile-handle').text()).toBe('@alice');
    expect(wrapper.get('.profile-meta').text()).toContain('加入于');
    expect(wrapper.get('.profile-stats').text()).toBe('1 条帖子 · 1 条评论');
    expect(wrapper.get('.profile-posts .profile-item-content').text()).toBe('第一条动态');
    wrapper.unmount();
  });

  it('切换标签查看评论，并可定位回原帖', async () => {
    const { ui } = setupProfile();
    const wrapper = mountWithPinia(ProfileView);

    await wrapper.findAll('.tab')[1].trigger('click');

    expect(ui.profileTab).toBe('comments');
    expect(wrapper.get('.profile-comments .profile-item-content').text()).toBe('第一条评论');

    await wrapper.get('.profile-comments .link-btn').trigger('click');

    expect(ui.view).toBe('timeline');
    expect(ui.highlightPostId).toBe('p1');
    expect(ui.isCommentsOpen('p1')).toBe(true);
    wrapper.unmount();
  });

  it('没有内容时展示对应的空状态', async () => {
    installMockApi();
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    auth.users = [sampleUser()];
    auth.currentUser = sampleUser();
    blog.posts = [];
    blog.comments = [];

    const wrapper = mountWithPinia(ProfileView);

    expect(wrapper.get('.profile-empty').text()).toBe('还没有发过帖子。');
    await wrapper.findAll('.tab')[1].trigger('click');
    expect(wrapper.get('.profile-empty').text()).toBe('还没有发表过评论。');
    await wrapper.findAll('.tab')[2].trigger('click');
    expect(wrapper.get('.profile-empty').text()).toBe('还没有收藏过帖子。');
    wrapper.unmount();
  });

  it('收藏标签列出收藏的帖子，并可定位回原帖', async () => {
    installMockApi({
      users: [sampleUser()],
      posts: [samplePost()],
      currentUser: sampleUser(),
      bookmarks: [{ postId: 'p1', userId: 'u1', createdAt: 1 }],
    });
    installPinia();
    const auth = useAuthStore();
    const blog = useBlogStore();
    const engagement = useEngagementStore();
    const ui = useUiStore();
    auth.users = [sampleUser()];
    auth.currentUser = sampleUser();
    blog.posts = [samplePost()];
    ui.openProfile();
    await engagement.hydrate();

    const wrapper = mountWithPinia(ProfileView);
    await wrapper.findAll('.tab')[2].trigger('click');

    expect(ui.profileTab).toBe('bookmarks');
    expect(wrapper.get('.profile-bookmarks .profile-item-content').text()).toBe('第一条动态');
    expect(wrapper.get('.profile-bookmarks .profile-item-meta').text()).toContain('爱丽丝');

    await wrapper.get('.profile-bookmarks .link-btn').trigger('click');

    expect(ui.view).toBe('timeline');
    expect(ui.highlightPostId).toBe('p1');
    expect(ui.isCommentsOpen('p1')).toBe(true);
    wrapper.unmount();
  });

  it('未登录时回到时间线', () => {
    installMockApi();
    installPinia();
    const ui = useUiStore();
    ui.openProfile();

    const wrapper = mountWithPinia(ProfileView);

    expect(ui.view).toBe('timeline');
    expect(wrapper.find('.profile').exists()).toBe(false);
    wrapper.unmount();
  });

  it('点击返回按钮回到时间线', async () => {
    const { ui } = setupProfile();
    ui.openProfile();
    const wrapper = mountWithPinia(ProfileView);

    await wrapper.get('.back-btn').trigger('click');

    expect(ui.view).toBe('timeline');
    wrapper.unmount();
  });
});
