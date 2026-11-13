import { afterEach, describe, expect, it } from 'vitest';
import type { Post } from '@shared/contract';
import { ApiError } from '@/core/api';
import { useBlogStore } from '@/stores/blog';
import { installMockApi, resetMockApi } from '../helpers/api';
import { sampleComment, samplePost, sampleUser } from '../helpers/fixtures';
import { installPinia, undoPinia } from '../helpers/store';

afterEach(() => {
  undoPinia();
  resetMockApi();
});

describe('useBlogStore.removePost', () => {
  it('删除成功后同时移除帖子与其评论', async () => {
    const api = installMockApi({
      currentUser: sampleUser(),
      posts: [samplePost(), samplePost({ id: 'p2', content: '保留' })],
      comments: [
        sampleComment(),
        sampleComment({ id: 'c2', postId: 'p2', content: '另一条' }),
      ],
    });
    installPinia();
    const blog = useBlogStore();
    blog.posts = [samplePost(), samplePost({ id: 'p2', content: '保留' })];
    blog.comments = [
      sampleComment(),
      sampleComment({ id: 'c2', postId: 'p2', content: '另一条' }),
    ];

    const result = await blog.removePost('p1');

    expect(result).toEqual({ ok: true });
    expect(api.deletePost).toHaveBeenCalledWith('p1');
    expect(blog.posts.map((post) => post.id)).toEqual(['p2']);
    expect(blog.comments.map((comment) => comment.id)).toEqual(['c2']);
  });

  it('删除失败时返回可读错误，帖子与评论保持不变', async () => {
    const api = installMockApi({ currentUser: sampleUser() });
    installPinia();
    const blog = useBlogStore();
    blog.posts = [samplePost()];
    blog.comments = [sampleComment()];
    api.deletePost.mockRejectedValueOnce(new ApiError('UNAUTHORIZED', '只能删除自己的帖子', 403));

    const result = await blog.removePost('p1');

    expect(result).toEqual({ ok: false, error: '只能删除自己的帖子' });
    expect(blog.posts).toHaveLength(1);
    expect(blog.comments).toHaveLength(1);
  });

  it('无接口文案时回退到通用提示', async () => {
    const api = installMockApi({ currentUser: sampleUser() });
    installPinia();
    const blog = useBlogStore();
    blog.posts = [samplePost()];
    api.deletePost.mockRejectedValueOnce(new ApiError('INTERNAL', '', 500));

    await expect(blog.removePost('p1')).resolves.toEqual({
      ok: false,
      error: '删除失败，请稍后重试',
    });
  });
});

describe('useBlogStore.hydrate', () => {
  it('载入帖子与评论，帖子倒序、评论正序', async () => {
    installMockApi({
      posts: [
        samplePost({ id: 'p1', content: '旧', createdAt: 10 }),
        samplePost({ id: 'p2', content: '新', createdAt: 20 }),
      ],
      comments: [
        sampleComment({ id: 'c2', postId: 'p1', content: '后', createdAt: 30 }),
        sampleComment({ id: 'c1', postId: 'p1', content: '前', createdAt: 20 }),
      ],
    });
    installPinia();
    const blog = useBlogStore();

    await blog.hydrate();

    expect(blog.posts.map((post) => post.id)).toEqual(['p2', 'p1']);
    expect(blog.comments.map((comment) => comment.id)).toEqual(['c1', 'c2']);
    expect(blog.loading).toBe(false);
    expect(blog.error).toBe('');
  });

  it('hydrate 在途时发布的新帖不会被旧快照覆盖', async () => {
    const api = installMockApi({ currentUser: sampleUser() });
    let releasePosts: (posts: Post[]) => void = () => {};
    api.posts.mockImplementationOnce(
      () =>
        new Promise<Post[]>((resolve) => {
          releasePosts = resolve;
        })
    );
    installPinia();
    const blog = useBlogStore();

    const hydrating = blog.hydrate();
    const result = await blog.createPost('并发发布');
    expect(result.ok).toBe(true);

    // 旧快照（不含新帖）晚于写入返回
    releasePosts([]);
    await hydrating;

    expect(blog.posts.map((post) => post.content)).toEqual(['并发发布']);
    expect(blog.loading).toBe(false);
  });

  it('接口失败时记录错误且保留已有数据', async () => {
    const api = installMockApi({ posts: [samplePost()] });
    installPinia();
    const blog = useBlogStore();
    await blog.hydrate();
    expect(blog.posts).toHaveLength(1);

    api.posts.mockRejectedValue(new ApiError('NETWORK', '无法连接到服务器，请确认后端已启动', 0));
    await blog.hydrate();

    expect(blog.error).toBe('无法连接到服务器，请确认后端已启动');
    expect(blog.posts).toHaveLength(1);
    expect(blog.loading).toBe(false);
  });
});

describe('useBlogStore.createPost', () => {
  it('发布成功时置顶，内容以服务端返回为准', async () => {
    const api = installMockApi({ currentUser: sampleUser() });
    installPinia();
    const blog = useBlogStore();

    const result = await blog.createPost(`  ${'x'.repeat(400)}  `);

    expect(result.ok).toBe(true);
    expect(blog.posts).toHaveLength(1);
    expect(blog.posts[0].content).toHaveLength(280);
    expect(blog.posts[0].authorId).toBe('u1');
    expect(api.createPost).toHaveBeenCalledTimes(1);
  });

  it('空白内容直接拒绝且不发请求', async () => {
    const api = installMockApi({ currentUser: sampleUser() });
    installPinia();
    const blog = useBlogStore();

    const result = await blog.createPost('   \n  ');

    expect(result).toEqual({ ok: false, error: '请输入内容' });
    expect(api.createPost).not.toHaveBeenCalled();
    expect(blog.posts).toHaveLength(0);
  });

  it('未登录时返回服务端文案且不插入数据', async () => {
    installMockApi();
    installPinia();
    const blog = useBlogStore();

    const result = await blog.createPost('会失败的帖子');

    expect(result).toEqual({ ok: false, error: '请先登录' });
    expect(blog.posts).toHaveLength(0);
  });
});

describe('useBlogStore.addComment', () => {
  it('评论成功追加并同步评论数', async () => {
    installMockApi({ currentUser: sampleUser(), posts: [samplePost({ id: 'p1' })] });
    installPinia();
    const blog = useBlogStore();
    await blog.hydrate();

    const result = await blog.addComment('p1', `  ${'评'.repeat(200)}  `);

    expect(result.ok).toBe(true);
    expect(blog.comments).toHaveLength(1);
    expect(blog.comments[0].content).toHaveLength(140);
    expect(blog.commentCountOf('p1')).toBe(1);
  });

  it('空白评论直接拒绝且不发请求', async () => {
    const api = installMockApi({ currentUser: sampleUser(), posts: [samplePost()] });
    installPinia();
    const blog = useBlogStore();

    const result = await blog.addComment('p1', '   ');

    expect(result).toEqual({ ok: false, error: '请输入评论' });
    expect(api.createComment).not.toHaveBeenCalled();
  });

  it('帖子不存在时返回服务端文案', async () => {
    installMockApi({ currentUser: sampleUser() });
    installPinia();
    const blog = useBlogStore();

    const result = await blog.addComment('ghost', '评论');

    expect(result).toEqual({ ok: false, error: '帖子不存在' });
    expect(blog.comments).toHaveLength(0);
    expect(blog.commentCountOf('ghost')).toBe(0);
  });
});

describe('useBlogStore 选择器', () => {
  it('按作者与帖子过滤', async () => {
    installMockApi({
      posts: [
        samplePost({ id: 'p1', authorId: 'u1', createdAt: 1 }),
        samplePost({ id: 'p2', authorId: 'u2', createdAt: 2 }),
      ],
      comments: [
        sampleComment({ id: 'c1', postId: 'p1', authorId: 'u1', createdAt: 3 }),
        sampleComment({ id: 'c2', postId: 'p2', authorId: 'u2', createdAt: 4 }),
      ],
    });
    installPinia();
    const blog = useBlogStore();
    await blog.hydrate();

    expect(blog.postsOf('u1').map((post) => post.id)).toEqual(['p1']);
    expect(blog.commentsBy('u1').map((comment) => comment.id)).toEqual(['c1']);
    expect(blog.commentsOf('p2').map((comment) => comment.id)).toEqual(['c2']);
    expect(blog.findPost('p2')?.authorId).toBe('u2');
    expect(blog.findPost('ghost')).toBeUndefined();
  });
});
