import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from '@/core/api';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import type { PublicUser } from '@shared/contract';
import { installMockApi, resetMockApi } from '../helpers/api';
import { samplePost, sampleUser } from '../helpers/fixtures';
import { flushPromises, installPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

describe('useAuthStore.hydrate', () => {
  it('并发拉取会话与用户列表', async () => {
    const api = installMockApi({ users: [sampleUser()], currentUser: sampleUser() });
    installPinia();
    const auth = useAuthStore();

    await auth.hydrate();

    expect(auth.currentUser?.id).toBe('u1');
    expect(auth.users).toHaveLength(1);
    expect(auth.ready).toBe(true);
    expect(api.session).toHaveBeenCalledTimes(1);
    expect(api.users).toHaveBeenCalledTimes(1);
  });

  it('游客状态 currentUser 为 null', async () => {
    installMockApi();
    installPinia();
    const auth = useAuthStore();

    await auth.hydrate();

    expect(auth.currentUser).toBeNull();
    expect(auth.signedIn).toBe(false);
    expect(auth.ready).toBe(true);
  });

  it('接口失败时写入提示，但 ready 仍为 true', async () => {
    const api = installMockApi();
    api.session.mockRejectedValue(new ApiError('NETWORK', '无法连接到服务器，请确认后端已启动', 0));
    installPinia();
    const auth = useAuthStore();

    await auth.hydrate();

    expect(auth.currentUser).toBeNull();
    expect(auth.error).toBe('无法连接到服务器，请确认后端已启动');
    expect(auth.ready).toBe(true);
  });
});

describe('useAuthStore.register', () => {
  it('注册成功后设置登录态、刷新用户列表并刷新时间线', async () => {
    const api = installMockApi({ posts: [samplePost()] });
    installPinia();
    const auth = useAuthStore();

    const result = await auth.register({
      username: 'bob',
      displayName: '鲍勃',
      password: 'secret1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.user.username).toBe('bob');
    expect(auth.currentUser?.id).toBe(result.user.id);
    expect(auth.users.map((user) => user.username)).toContain('bob');
    expect(auth.busy).toBe(false);
    expect(auth.error).toBe('');

    expect(api.register).toHaveBeenCalledWith({
      username: 'bob',
      displayName: '鲍勃',
      password: 'secret1',
    });

    // 时间线刷新是非阻塞的，等一轮微任务后应已填充
    await flushPromises();
    expect(useBlogStore().posts).toHaveLength(1);
  });

  it('用户名被占用时返回服务端文案且不改变登录态', async () => {
    installMockApi({ users: [sampleUser({ username: 'alice' })] });
    installPinia();
    const auth = useAuthStore();

    const result = await auth.register({
      username: 'Alice',
      password: 'secret1',
    });

    expect(result).toEqual({ ok: false, error: '该用户名已被占用' });
    expect(auth.currentUser).toBeNull();
    expect(auth.error).toBe('该用户名已被占用');
    expect(auth.busy).toBe(false);
  });

  it('网络异常时给出兜底文案，不抛异常', async () => {
    const api = installMockApi();
    api.register.mockRejectedValue(new ApiError('NETWORK', '', 0));
    installPinia();
    const auth = useAuthStore();

    const result = await auth.register({ username: 'bob', password: 'secret1' });

    expect(result).toEqual({ ok: false, error: '注册失败，请稍后重试' });
    expect(auth.busy).toBe(false);
  });
});

describe('useAuthStore.login', () => {
  it('登录成功后设置当前用户', async () => {
    installMockApi({ users: [sampleUser()] });
    installPinia();
    const auth = useAuthStore();

    const result = await auth.login({ username: 'ALICE', password: 'secret1' });

    expect(result.ok).toBe(true);
    expect(auth.currentUser?.id).toBe('u1');
    expect(auth.signedIn).toBe(true);
  });

  it('凭据错误时返回服务端文案', async () => {
    installMockApi({ users: [sampleUser()] });
    installPinia();
    const auth = useAuthStore();

    const result = await auth.login({ username: 'alice', password: 'wrong' });

    expect(result).toEqual({ ok: false, error: '用户名或密码不正确' });
    expect(auth.currentUser).toBeNull();
  });

  it('处理中重复提交返回「正在处理」', async () => {
    const api = installMockApi({ users: [sampleUser()] });
    let release: (user: PublicUser) => void = () => {};
    api.login.mockImplementationOnce(
      () =>
        new Promise<PublicUser>((resolve) => {
          release = resolve;
        })
    );
    installPinia();
    const auth = useAuthStore();

    const first = auth.login({ username: 'alice', password: 'secret1' });
    const second = await auth.login({ username: 'alice', password: 'secret1' });

    expect(second).toEqual({ ok: false, error: '正在处理' });
    expect(auth.busy).toBe(true);

    release(sampleUser());
    await expect(first).resolves.toEqual({ ok: true, user: sampleUser() });
    expect(auth.busy).toBe(false);
  });
});

describe('useAuthStore.logout', () => {
  it('退出后清空当前用户', async () => {
    installMockApi({ users: [sampleUser()], currentUser: sampleUser() });
    installPinia();
    const auth = useAuthStore();
    await auth.hydrate();

    await auth.logout();

    expect(auth.currentUser).toBeNull();
    expect(auth.error).toBe('');
  });

  it('接口失败也清空本地登录态，并提示错误', async () => {
    const api = installMockApi({ users: [sampleUser()], currentUser: sampleUser() });
    api.logout.mockRejectedValue(new ApiError('NETWORK', '无法连接到服务器，请确认后端已启动', 0));
    installPinia();
    const auth = useAuthStore();
    await auth.hydrate();

    await auth.logout();

    expect(auth.currentUser).toBeNull();
    expect(auth.error).toBe('无法连接到服务器，请确认后端已启动');
  });
});
