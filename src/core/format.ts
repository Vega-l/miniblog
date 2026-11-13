import type { User } from './types';

export interface AuthorView {
  name: string;
  handle: string;
  initial: string;
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

export function initialOf(user: Pick<User, 'displayName' | 'username'> | null | undefined): string {
  const source = (user?.displayName || user?.username || '?').trim();
  return source ? source.slice(0, 1).toUpperCase() : '?';
}

export function authorOf(userId: string | null, users: User[]): AuthorView {
  if (!userId) {
    return { name: '之前的访客', handle: '@guest', initial: '客' };
  }

  const user = users.find((item) => item.id === userId);
  if (!user) {
    return { name: '已注销用户', handle: '@unknown', initial: '?' };
  }

  return { name: user.displayName, handle: `@${user.username}`, initial: initialOf(user) };
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date);
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
}
