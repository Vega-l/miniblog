<script setup lang="ts">
import ComposerBox from '@/components/ComposerBox.vue';
import PostItem from '@/components/PostItem.vue';
import { useBlogStore } from '@/stores/blog';

const blog = useBlogStore();

function retry(): void {
  void blog.hydrate();
}
</script>

<template>
  <div class="timeline-view">
    <h1 class="visually-hidden">Miniblog 时间线</h1>

    <ComposerBox />

    <section class="timeline" aria-labelledby="timeline-title">
      <div class="timeline-head">
        <h2 id="timeline-title">时间线</h2>
        <span class="timeline-count">{{ blog.posts.length ? `${blog.posts.length} 条` : '' }}</span>
      </div>

      <div v-if="blog.error" class="empty-state" role="alert">
        <p class="empty-state-text">{{ blog.error }}</p>
        <button type="button" class="link-btn" @click="retry">重新加载</button>
      </div>

      <ul v-if="blog.posts.length" class="post-list">
        <PostItem v-for="post in blog.posts" :key="post.id" :post="post" />
      </ul>
      <p v-else-if="blog.loading" class="empty-state">正在加载…</p>
      <p v-else-if="!blog.error" class="empty-state">还没有内容。登录后写下第一条。</p>
    </section>
  </div>
</template>
