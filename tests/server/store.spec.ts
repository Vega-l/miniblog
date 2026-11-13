// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { SESSION_TTL_MS } from '../../shared/contract';
import { createMemoryStore } from '../../server/store';

const BASE_TIME = 1_700_000_000_000;

function createStore() {
  const clock = { now: BASE_TIME };
  let sequence = 0;
  const store = createMemoryStore({
    clock: () => clock.now,
    makeId: (prefix) => `${prefix}_${(sequence += 1)}`,
  });
  return { store, clock };
}

describe('createMemoryStore', () => {
  it('帖子按 createdAt 倒序，同毫秒按创建顺序倒序', () => {
    const { store, clock } = createStore();
    const first = store.addPost({
      id: store.makeId('post'),
      authorId: 'u1',
      content: '第一',
      createdAt: clock.now,
    });
    const second = store.addPost({
      id: store.makeId('post'),
      authorId: 'u1',
      content: '第二',
      createdAt: clock.now,
    });
    clock.now += 10;
    const third = store.addPost({
      id: store.makeId('post'),
      authorId: 'u1',
      content: '第三',
      createdAt: clock.now,
    });

    expect(store.listPosts().map((post) => post.id)).toEqual([third.id, second.id, first.id]);
  });

  it('评论按 createdAt 正序', () => {
    const { store, clock } = createStore();
    const base = { postId: 'p1', authorId: 'u1' };
    const first = store.addComment({
      id: store.makeId('comment'),
      ...base,
      content: '第一',
      createdAt: clock.now,
    });
    clock.now += 10;
    const second = store.addComment({
      id: store.makeId('comment'),
      ...base,
      content: '第二',
      createdAt: clock.now,
    });

    expect(store.listComments({ postId: 'p1' }).map((comment) => comment.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(store.listComments({ authorId: 'u2' })).toEqual([]);
  });

  it('会话过期后查不到，并且可以被清理', () => {
    const { store, clock } = createStore();
    const session = store.createSession('u1');

    clock.now += SESSION_TTL_MS - 1;
    expect(store.findSession(session.token)).not.toBeNull();

    clock.now += 1;
    expect(store.findSession(session.token)).toBeNull();
    expect(store.pruneExpiredSessions()).toBe(0);
  });

  it('pruneExpiredSessions 直接清理过期会话并计数', () => {
    const { store, clock } = createStore();
    const first = store.createSession('u1');
    const second = store.createSession('u2');

    // 不经过 findSession（它自己也会顺带清理），直接验证 prune 的删除与计数
    clock.now += SESSION_TTL_MS;
    expect(store.pruneExpiredSessions()).toBe(2);
    expect(store.findSession(first.token)).toBeNull();
    expect(store.findSession(second.token)).toBeNull();
    expect(store.pruneExpiredSessions()).toBe(0);
  });

  it('删除会话后查不到', () => {
    const { store } = createStore();
    const session = store.createSession('u1');

    store.deleteSession(session.token);
    expect(store.findSession(session.token)).toBeNull();
  });

  it('用户名查找大小写不敏感', () => {
    const { store, clock } = createStore();
    store.addUser({
      id: 'u1',
      username: 'Alice',
      usernameLower: 'alice',
      displayName: 'Alice',
      salt: 'salt',
      passwordHash: 'hash',
      createdAt: clock.now,
    });

    expect(store.findUserByUsername('ALICE')?.id).toBe('u1');
    expect(store.findUserByUsername('bob')).toBeNull();
  });
});

describe('点赞', () => {
  it('同一用户重复点赞幂等，不同用户分别计数', () => {
    const { store, clock } = createStore();

    expect(store.addLike({ postId: 'p1', userId: 'u1', createdAt: clock.now })).toBe(true);
    expect(store.addLike({ postId: 'p1', userId: 'u1', createdAt: clock.now })).toBe(false);
    expect(store.countLikes('p1')).toBe(1);

    expect(store.addLike({ postId: 'p1', userId: 'u2', createdAt: clock.now })).toBe(true);
    expect(store.countLikes('p1')).toBe(2);
  });

  it('取消点赞后计数下降，重复取消没有副作用', () => {
    const { store, clock } = createStore();
    store.addLike({ postId: 'p1', userId: 'u1', createdAt: clock.now });
    store.addLike({ postId: 'p1', userId: 'u2', createdAt: clock.now });

    expect(store.removeLike('p1', 'u1')).toBe(true);
    expect(store.countLikes('p1')).toBe(1);
    expect(store.findLike('p1', 'u1')).toBeNull();

    expect(store.removeLike('p1', 'u1')).toBe(false);
    expect(store.countLikes('p1')).toBe(1);
  });

  it('listLikeCounts 只返回有点赞的帖子，likedPostIds 按用户隔离', () => {
    const { store, clock } = createStore();
    store.addLike({ postId: 'p1', userId: 'u1', createdAt: clock.now });
    store.addLike({ postId: 'p1', userId: 'u2', createdAt: clock.now });
    store.addLike({ postId: 'p2', userId: 'u2', createdAt: clock.now });

    expect(store.listLikeCounts()).toEqual({ p1: 2, p2: 1 });
    expect(store.listLikedPostIds('u1')).toEqual(['p1']);
    expect([...store.listLikedPostIds('u2')].sort()).toEqual(['p1', 'p2']);
    expect(store.listLikedPostIds('u3')).toEqual([]);
    expect(store.countLikes('p9')).toBe(0);
  });
});

describe('收藏', () => {
  it('重复收藏幂等，取消后查不到', () => {
    const { store, clock } = createStore();

    expect(store.addBookmark({ postId: 'p1', userId: 'u1', createdAt: clock.now })).toBe(true);
    expect(store.addBookmark({ postId: 'p1', userId: 'u1', createdAt: clock.now })).toBe(false);
    expect(store.listBookmarks('u1')).toHaveLength(1);

    expect(store.removeBookmark('p1', 'u1')).toBe(true);
    expect(store.listBookmarks('u1')).toEqual([]);
    expect(store.findBookmark('p1', 'u1')).toBeNull();
    expect(store.removeBookmark('p1', 'u1')).toBe(false);
  });

  it('收藏列表只含本人记录，最新收藏在前', () => {
    const { store, clock } = createStore();
    store.addBookmark({ postId: 'p1', userId: 'u1', createdAt: clock.now });
    clock.now += 1000;
    store.addBookmark({ postId: 'p2', userId: 'u1', createdAt: clock.now });
    store.addBookmark({ postId: 'p3', userId: 'u2', createdAt: clock.now });

    expect(store.listBookmarks('u1').map((item) => item.postId)).toEqual(['p2', 'p1']);
    expect(store.listBookmarks('u2').map((item) => item.postId)).toEqual(['p3']);
    expect(store.listBookmarks('u3')).toEqual([]);
  });
});
