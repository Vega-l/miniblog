<script setup lang="ts">
import { computed, watch } from 'vue';
import { authorOf, formatDate, formatTime, initialOf } from '@/core/format';
import type { Post } from '@/core/types';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import { useEngagementStore } from '@/stores/engagement';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const blog = useBlogStore();
const engagement = useEngagementStore();
const ui = useUiStore();

const user = computed(() => auth.currentUser);
const initial = computed(() => initialOf(user.value));
const myPosts = computed(() => (user.value ? blog.postsOf(user.value.id) : []));
const myComments = computed(() => (user.value ? blog.commentsBy(user.value.id) : []));
const bookmarkedPosts = computed(() =>
  engagement.bookmarks
    .map((bookmark) => blog.findPost(bookmark.postId))
    .filter((post): post is Post => Boolean(post))
);
const stats = computed(() => `${myPosts.value.length} 条帖子 · ${myComments.value.length} 条评论`);
const emptyText = computed(() => {
  if (ui.profileTab === 'posts') return '还没有发过帖子。';
  if (ui.profileTab === 'comments') return '还没有发表过评论。';
  return '还没有收藏过帖子。';
});

watch(
  user,
  (value) => {
    if (!value) ui.openTimeline();
  },
  { immediate: true }
);

function postMeta(createdAt: number, postId: string): string {
  return `${formatTime(createdAt)} · ${blog.commentCountOf(postId)} 条评论`;
}

function commentMeta(postId: string, createdAt: number): string {
  const post = blog.findPost(postId);
  const target = post ? authorOf(post.authorId, auth.users).name : '已删除的帖子';
  return `评论于 ${target} 的帖子 · ${formatTime(createdAt)}`;
}

function bookmarkMeta(post: Post): string {
  const author = authorOf(post.authorId, auth.users).name;
  return `${author} · ${formatTime(post.createdAt)} · ${engagement.likeCountOf(post.id)} 个赞`;
}
</script>

<template>
  <section v-if="user" class="profile" aria-labelledby="profile-name">
    <button type="button" class="btn-ghost back-btn" @click="ui.openTimeline()">
      <span aria-hidden="true">←</span> 返回时间线
    </button>

    <div class="profile-card">
      <div class="avatar avatar-lg" aria-hidden="true">{{ initial }}</div>
      <div class="profile-info">
        <h2 id="profile-name">{{ user.displayName }}</h2>
        <p class="profile-handle">@{{ user.username }}</p>
        <p class="profile-meta">加入于 {{ formatDate(user.createdAt) }}</p>
        <p class="profile-stats">{{ stats }}</p>
      </div>
    </div>

    <div class="tabs" role="tablist" aria-label="历史记录类型">
      <button
        type="button"
        class="tab"
        :class="{ 'is-active': ui.profileTab === 'posts' }"
        role="tab"
        :aria-selected="ui.profileTab === 'posts'"
        @click="ui.setProfileTab('posts')"
      >
        我的帖子
      </button>
      <button
        type="button"
        class="tab"
        :class="{ 'is-active': ui.profileTab === 'comments' }"
        role="tab"
        :aria-selected="ui.profileTab === 'comments'"
        @click="ui.setProfileTab('comments')"
      >
        我的评论
      </button>
      <button
        type="button"
        class="tab"
        :class="{ 'is-active': ui.profileTab === 'bookmarks' }"
        role="tab"
        :aria-selected="ui.profileTab === 'bookmarks'"
        @click="ui.setProfileTab('bookmarks')"
      >
        我的收藏
      </button>
    </div>

    <ul v-if="ui.profileTab === 'posts' && myPosts.length" class="profile-list profile-posts">
      <li v-for="post in myPosts" :key="post.id" class="profile-item">
        <p class="profile-item-content">{{ post.content }}</p>
        <div class="profile-item-foot">
          <span class="profile-item-meta">{{ postMeta(post.createdAt, post.id) }}</span>
        </div>
      </li>
    </ul>

    <ul v-else-if="ui.profileTab === 'comments' && myComments.length" class="profile-list profile-comments">
      <li v-for="comment in myComments" :key="comment.id" class="profile-item">
        <p class="profile-item-content">{{ comment.content }}</p>
        <div class="profile-item-foot">
          <span class="profile-item-meta">{{ commentMeta(comment.postId, comment.createdAt) }}</span>
          <button
            v-if="blog.findPost(comment.postId)"
            type="button"
            class="link-btn"
            @click="ui.focusPost(comment.postId)"
          >
            查看原帖
          </button>
        </div>
      </li>
    </ul>

    <ul
      v-else-if="ui.profileTab === 'bookmarks' && bookmarkedPosts.length"
      class="profile-list profile-bookmarks"
    >
      <li v-for="post in bookmarkedPosts" :key="post.id" class="profile-item">
        <p class="profile-item-content">{{ post.content }}</p>
        <div class="profile-item-foot">
          <span class="profile-item-meta">{{ bookmarkMeta(post) }}</span>
          <button type="button" class="link-btn" @click="ui.focusPost(post.id)">查看原帖</button>
        </div>
      </li>
    </ul>

    <p v-else class="empty-state profile-empty">{{ emptyText }}</p>
  </section>
</template>
