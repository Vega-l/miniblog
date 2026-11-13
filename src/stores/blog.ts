import { defineStore } from 'pinia';
import { ref } from 'vue';
import { apiClient, apiErrorMessage } from '@/core/api';
import type { Comment, Post } from '@/core/types';

export interface WriteResult {
  ok: boolean;
  error?: string;
  post?: Post;
  comment?: Comment;
}

export const useBlogStore = defineStore('blog', () => {
  const api = apiClient();

  const posts = ref<Post[]>([]);
  const comments = ref<Comment[]>([]);
  const loading = ref(false);
  const error = ref('');

  let hydrateTicket = 0;

  /**
   * 以服务端快照为准，同时保留本地新增、快照里还没有的条目：
   * hydrate 请求在途时刚发布的帖子/评论不会被旧快照抹掉。
   */
  function mergeSnapshots<T extends { id: string; createdAt: number }>(
    remote: T[],
    local: T[],
    order: 'asc' | 'desc'
  ): T[] {
    const remoteIds = new Set(remote.map((item) => item.id));
    const pending = local.filter((item) => !remoteIds.has(item.id));

    return [...remote, ...pending].sort((a, b) =>
      order === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
    );
  }

  async function hydrate(): Promise<void> {
    const ticket = (hydrateTicket += 1);
    loading.value = true;
    error.value = '';

    try {
      const [nextPosts, nextComments] = await Promise.all([api.posts(), api.allComments()]);
      // 期间又发起了新的 hydrate，旧响应直接丢弃
      if (ticket !== hydrateTicket) return;

      posts.value = mergeSnapshots(nextPosts, posts.value, 'desc');
      comments.value = mergeSnapshots(nextComments, comments.value, 'asc');
    } catch (caught) {
      if (ticket === hydrateTicket) {
        error.value = apiErrorMessage(caught, '加载内容失败，请稍后重试');
      }
    } finally {
      if (ticket === hydrateTicket) loading.value = false;
    }
  }

  async function createPost(content: string): Promise<WriteResult> {
    const trimmed = content.trim();
    if (!trimmed) return { ok: false, error: '请输入内容' };

    try {
      const post = await api.createPost(trimmed);
      posts.value = [post, ...posts.value];
      return { ok: true, post };
    } catch (caught) {
      return { ok: false, error: apiErrorMessage(caught, '发布失败，请稍后重试') };
    }
  }

  /** 删除成功后才从本地移除；失败保持原样，避免「界面没了、服务端还在」。 */
  async function removePost(postId: string): Promise<WriteResult> {
    try {
      await api.deletePost(postId);
      posts.value = posts.value.filter((post) => post.id !== postId);
      comments.value = comments.value.filter((comment) => comment.postId !== postId);
      return { ok: true };
    } catch (caught) {
      return { ok: false, error: apiErrorMessage(caught, '删除失败，请稍后重试') };
    }
  }

  async function addComment(postId: string, content: string): Promise<WriteResult> {
    const trimmed = content.trim();
    if (!trimmed) return { ok: false, error: '请输入评论' };

    try {
      const comment = await api.createComment(postId, trimmed);
      comments.value = [...comments.value, comment];
      return { ok: true, comment };
    } catch (caught) {
      return { ok: false, error: apiErrorMessage(caught, '评论失败，请稍后重试') };
    }
  }

  function commentsOf(postId: string): Comment[] {
    return comments.value.filter((comment) => comment.postId === postId);
  }

  function commentCountOf(postId: string): number {
    return commentsOf(postId).length;
  }

  function postsOf(userId: string): Post[] {
    return posts.value.filter((post) => post.authorId === userId);
  }

  function commentsBy(userId: string): Comment[] {
    return comments.value.filter((comment) => comment.authorId === userId);
  }

  function findPost(postId: string): Post | undefined {
    return posts.value.find((post) => post.id === postId);
  }

  return {
    posts,
    comments,
    loading,
    error,
    hydrate,
    createPost,
    removePost,
    addComment,
    commentsOf,
    commentCountOf,
    postsOf,
    commentsBy,
    findPost,
  };
});
