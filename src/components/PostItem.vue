<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { LIMITS } from '@/core/constants';
import { authorOf, formatTime } from '@/core/format';
import type { Post } from '@/core/types';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import { useEngagementStore } from '@/stores/engagement';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{ post: Post }>();

const auth = useAuthStore();
const blog = useBlogStore();
const engagement = useEngagementStore();
const ui = useUiStore();

const root = ref<HTMLLIElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const draft = ref('');
const submitting = ref(false);
const likeBusy = ref(false);
const bookmarkBusy = ref(false);

const author = computed(() => authorOf(props.post.authorId, auth.users));
const open = computed(() => ui.isCommentsOpen(props.post.id));
const count = computed(() => blog.commentCountOf(props.post.id));
const comments = computed(() => blog.commentsOf(props.post.id));
const highlighted = computed(() => ui.highlightPostId === props.post.id);
const liked = computed(() => engagement.isLiked(props.post.id));
const likeCount = computed(() => engagement.likeCountOf(props.post.id));
const bookmarked = computed(() => engagement.isBookmarked(props.post.id));

const isoTime = computed(() => {
  const date = new Date(props.post.createdAt);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
});

watch(open, async (value) => {
  if (!value) return;
  await nextTick();
  input.value?.focus();
});

watch(
  highlighted,
  async (value) => {
    if (!value) return;
    await nextTick();
    root.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    window.setTimeout(() => {
      if (ui.highlightPostId === props.post.id) ui.clearHighlight();
    }, 1600);
  },
  { immediate: true }
);

function toggleComments(): void {
  ui.toggleComments(props.post.id);
}

async function toggleLike(): Promise<void> {
  if (!auth.currentUser) {
    ui.openAuth('login');
    return;
  }
  if (likeBusy.value) return;

  likeBusy.value = true;
  try {
    const result = await engagement.toggleLike(props.post.id);
    ui.showToast(result.ok ? (result.active ? '已点赞' : '已取消点赞') : (result.error ?? '点赞失败'));
  } finally {
    likeBusy.value = false;
  }
}

async function toggleBookmark(): Promise<void> {
  if (!auth.currentUser) {
    ui.openAuth('login');
    return;
  }
  if (bookmarkBusy.value) return;

  bookmarkBusy.value = true;
  try {
    const result = await engagement.toggleBookmark(props.post.id);
    ui.showToast(
      result.ok ? (result.active ? '已收藏' : '已取消收藏') : (result.error ?? '收藏失败')
    );
  } finally {
    bookmarkBusy.value = false;
  }
}

async function submitComment(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    ui.openAuth('login');
    return;
  }
  if (submitting.value) return;

  submitting.value = true;

  try {
    const result = await blog.addComment(props.post.id, draft.value);
    if (!result.ok) {
      ui.showToast(result.error ?? '评论失败');
      return;
    }

    draft.value = '';
    ui.openCommentsFor(props.post.id);
    void nextTick(() => input.value?.focus());
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <li ref="root" class="post" :class="{ 'is-highlight': highlighted }" :data-post-id="post.id">
    <div class="avatar" aria-hidden="true">{{ author.initial }}</div>

    <div class="post-main">
      <div class="post-head">
        <span class="post-author">{{ author.name }}</span>
        <span class="post-handle">{{ author.handle }}</span>
        <time class="post-time" :datetime="isoTime">{{ formatTime(post.createdAt) }}</time>
      </div>

      <p class="post-content">{{ post.content }}</p>

      <div class="post-actions">
        <button
          type="button"
          class="action-btn action-btn--like"
          :class="{ 'is-active': liked }"
          :aria-pressed="liked"
          :aria-label="liked ? '取消点赞' : '点赞'"
          :disabled="likeBusy"
          @click="toggleLike"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.65A4 4 0 0 1 19 11c0 4.65-7 9-7 9z"
              :fill="liked ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{ likeCount > 0 ? likeCount : '点赞' }}</span>
        </button>

        <button
          type="button"
          class="action-btn action-btn--bookmark"
          :class="{ 'is-active': bookmarked }"
          :aria-pressed="bookmarked"
          :aria-label="bookmarked ? '取消收藏' : '收藏'"
          :disabled="bookmarkBusy"
          @click="toggleBookmark"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M7 4h10v16l-5-3.5L7 20z"
              :fill="bookmarked ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{ bookmarked ? '已收藏' : '收藏' }}</span>
        </button>

        <button
          type="button"
          class="action-btn action-btn--comments"
          :aria-expanded="open"
          :aria-label="count > 0 ? `查看 ${count} 条评论` : '查看评论'"
          @click="toggleComments"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 4H4v12h4v4l5-4h7z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{ count > 0 ? count : '评论' }}</span>
        </button>
      </div>

      <div v-if="open" class="comments">
        <ul class="comment-list">
          <li v-for="comment in comments" :key="comment.id" class="comment">
            <div class="avatar avatar-xs" aria-hidden="true">
              {{ authorOf(comment.authorId, auth.users).initial }}
            </div>
            <div class="comment-main">
              <div class="comment-head">
                <span class="comment-author">{{ authorOf(comment.authorId, auth.users).name }}</span>
                <time class="comment-time">{{ formatTime(comment.createdAt) }}</time>
              </div>
              <p class="comment-content">{{ comment.content }}</p>
            </div>
          </li>
          <li v-if="!comments.length" class="comment-empty">还没有评论</li>
        </ul>

        <form v-if="auth.currentUser" class="comment-form" novalidate @submit.prevent="submitComment">
          <input
            ref="input"
            v-model="draft"
            class="comment-input"
            type="text"
            :maxlength="LIMITS.comment"
            placeholder="写下评论…"
            aria-label="评论内容"
          />
          <button type="submit" class="btn-small" :disabled="submitting">
            {{ submitting ? '发送中…' : '发送' }}
          </button>
        </form>
        <p v-else class="comment-lock">
          <button type="button" class="link-btn" @click="ui.openAuth('login')">登录</button> 后参与评论
        </p>
      </div>
    </div>
  </li>
</template>
