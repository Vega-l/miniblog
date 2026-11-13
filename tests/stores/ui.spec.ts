import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/stores/ui';
import { installPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  vi.useRealTimers();
});

describe('useUiStore', () => {
  it('切换时间线与个人主页，默认帖子标签', () => {
    installPinia();
    const ui = useUiStore();

    expect(ui.view).toBe('timeline');
    ui.openProfile();
    expect(ui.view).toBe('profile');
    expect(ui.profileTab).toBe('posts');

    ui.setProfileTab('comments');
    expect(ui.profileTab).toBe('comments');

    ui.openTimeline();
    expect(ui.view).toBe('timeline');
  });

  it('展开/收起评论互不影响', () => {
    installPinia();
    const ui = useUiStore();

    ui.toggleComments('p1');
    ui.toggleComments('p2');
    expect(ui.isCommentsOpen('p1')).toBe(true);
    expect(ui.isCommentsOpen('p2')).toBe(true);

    ui.toggleComments('p1');
    expect(ui.isCommentsOpen('p1')).toBe(false);
    expect(ui.isCommentsOpen('p2')).toBe(true);
  });

  it('定位原帖时切回时间线、展开评论并高亮', () => {
    installPinia();
    const ui = useUiStore();
    ui.openProfile();

    ui.focusPost('p9');

    expect(ui.view).toBe('timeline');
    expect(ui.isCommentsOpen('p9')).toBe(true);
    expect(ui.highlightPostId).toBe('p9');
  });

  it('可以清除原帖高亮', () => {
    installPinia();
    const ui = useUiStore();
    ui.focusPost('p1');

    ui.clearHighlight();

    expect(ui.highlightPostId).toBeNull();
  });

  it('提示条 2.6 秒后自动隐藏', () => {
    installPinia();
    vi.useFakeTimers();
    const ui = useUiStore();

    ui.showToast('已发布');
    expect(ui.toastMessage).toBe('已发布');
    expect(ui.toastVisible).toBe(true);

    vi.advanceTimersByTime(2600);
    expect(ui.toastVisible).toBe(false);
  });

  it('管理登录弹窗的开关与模式', () => {
    installPinia();
    const ui = useUiStore();

    expect(ui.authOpen).toBe(false);
    ui.openAuth('register');
    expect(ui.authOpen).toBe(true);
    expect(ui.authMode).toBe('register');

    ui.closeAuth();
    expect(ui.authOpen).toBe(false);
  });
});
