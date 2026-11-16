<script setup lang="ts">
import { computed, ref } from 'vue';
import { LIMITS } from '@/core/constants';
import { initialOf } from '@/core/format';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const blog = useBlogStore();
const ui = useUiStore();

const DEFAULT_NOTICE = `最多 ${LIMITS.post} 字 · Ctrl/⌘ + Enter 发布`;

// 字数刻度：把上限切成固定格数，一眼看出还剩多少
const BLOCKS = 12;
const WARN_RATIO = 0.9;

const content = ref('');
const notice = ref(DEFAULT_NOTICE);
const noticeIsError = ref(false);
const submitting = ref(false);

const initial = computed(() => initialOf(auth.currentUser));
const canPublish = computed(
  () => Boolean(auth.currentUser) && content.value.trim().length > 0 && !submitting.value
);
const usedLength = computed(() => content.value.length);
const litBlocks = computed(() => Math.ceil((usedLength.value / LIMITS.post) * BLOCKS));
const nearLimit = computed(() => usedLength.value >= LIMITS.post * WARN_RATIO);

function resetNotice(): void {
  notice.value = DEFAULT_NOTICE;
  noticeIsError.value = false;
}

async function submit(): Promise<void> {
  if (!auth.currentUser) {
    ui.openAuth('login');
    return;
  }
  if (!canPublish.value) return;

  submitting.value = true;

  try {
    const result = await blog.createPost(content.value);
    if (!result.ok) {
      notice.value = result.error ?? '发布失败';
      noticeIsError.value = true;
      return;
    }

    content.value = '';
    resetNotice();
    ui.showToast('已发布');
  } finally {
    submitting.value = false;
  }
}

function onInput(): void {
  if (noticeIsError.value) resetNotice();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    void submit();
  }
}
</script>

<template>
  <section v-if="!auth.currentUser" class="composer composer-guest">
    <div class="composer-locked">
      <div>
        <p class="locked-title">登录后即可发布</p>
        <p class="locked-note">内容会保存到服务端，所有访客都能看到</p>
      </div>
      <button type="button" class="btn-primary" @click="ui.openAuth('login')">登录 / 注册</button>
    </div>
  </section>

  <section v-else class="composer">
    <form novalidate @submit.prevent="submit">
      <div class="composer-body">
        <div class="avatar" aria-hidden="true">{{ initial }}</div>
        <textarea
          v-model="content"
          name="content"
          rows="3"
          :maxlength="LIMITS.post"
          placeholder="分享此刻的想法…"
          aria-label="动态内容"
          @input="onInput"
          @keydown="onKeydown"
        ></textarea>
      </div>
      <div class="composer-actions">
        <div class="composer-status">
          <p class="composer-hint" :class="{ 'is-error': noticeIsError }">{{ notice }}</p>
          <div class="composer-meter" :class="{ 'is-warn': nearLimit }" aria-hidden="true">
            <span
              v-for="block in BLOCKS"
              :key="block"
              class="meter-block"
              :class="{ 'is-on': block <= litBlocks }"
            ></span>
            <span class="meter-count">{{ usedLength }}/{{ LIMITS.post }}</span>
          </div>
        </div>
        <button type="submit" class="btn-primary" :disabled="!canPublish">
          {{ submitting ? '发布中…' : '发布' }}
        </button>
      </div>
    </form>
  </section>
</template>
