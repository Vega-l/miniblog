import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { apiClient, apiErrorMessage } from '@/core/api';
import type { User } from '@/core/types';
import { useBlogStore } from './blog';
import { useEngagementStore } from './engagement';

export interface RegisterInput {
  username: string;
  displayName?: string;
  password: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

export const useAuthStore = defineStore('auth', () => {
  const api = apiClient();

  const users = ref<User[]>([]);
  const currentUser = ref<User | null>(null);
  const ready = ref(false);
  const busy = ref(false);
  const error = ref('');

  const signedIn = computed(() => currentUser.value !== null);

  /** 用户列表失败不该影响登录态，静默处理。 */
  async function refreshUsers(): Promise<void> {
    try {
      users.value = await api.users();
    } catch {
      /* 保留旧列表，界面继续可用 */
    }
  }

  function rememberUser(user: User): void {
    if (!users.value.some((item) => item.id === user.id)) {
      users.value = [...users.value, user];
    }
  }

  async function hydrate(): Promise<void> {
    const [session, list] = await Promise.allSettled([api.session(), api.users()]);

    if (session.status === 'fulfilled') {
      currentUser.value = session.value;
    } else {
      error.value = apiErrorMessage(session.reason, '加载登录状态失败，请稍后重试');
    }

    if (list.status === 'fulfilled') {
      users.value = list.value;
    } else {
      error.value ||= apiErrorMessage(list.reason, '加载用户列表失败，请稍后重试');
    }

    ready.value = true;
  }

  async function signIn(action: () => Promise<User>, fallback: string): Promise<AuthResult> {
    if (busy.value) return { ok: false, error: '正在处理' };

    busy.value = true;
    error.value = '';

    try {
      const user = await action();
      currentUser.value = user;
      await refreshUsers();
      rememberUser(user);
      // 时间线在后台刷新：不必等它，弹窗可以立刻关闭，Loading 交给 TimelineView 展示
      void useBlogStore().hydrate();
      // 点赞/收藏是按用户区分的，登录后必须重新拉一次
      void useEngagementStore().hydrate();
      return { ok: true, user };
    } catch (caught) {
      const message = apiErrorMessage(caught, fallback);
      error.value = message;
      return { ok: false, error: message };
    } finally {
      busy.value = false;
    }
  }

  function register(input: RegisterInput): Promise<AuthResult> {
    return signIn(
      () =>
        api.register({
          username: input.username,
          displayName: input.displayName,
          password: input.password,
        }),
      '注册失败，请稍后重试'
    );
  }

  function login(input: LoginInput): Promise<AuthResult> {
    return signIn(
      () => api.login({ username: input.username, password: input.password }),
      '登录失败，请稍后重试'
    );
  }

  async function logout(): Promise<void> {
    error.value = '';

    try {
      await api.logout();
    } catch (caught) {
      error.value = apiErrorMessage(caught, '退出登录失败，请稍后重试');
    } finally {
      currentUser.value = null;
      useEngagementStore().reset();
    }
  }

  return {
    users,
    currentUser,
    ready,
    busy,
    error,
    signedIn,
    hydrate,
    register,
    login,
    logout,
  };
});
