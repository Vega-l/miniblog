<script setup lang="ts">
import AuthDialog from '@/components/AuthDialog.vue';
import ProfileView from '@/components/ProfileView.vue';
import SiteHeader from '@/components/SiteHeader.vue';
import TimelineView from '@/components/TimelineView.vue';
import ToastBar from '@/components/ToastBar.vue';
import TrendingPanel from '@/components/TrendingPanel.vue';
import { useAuthStore } from '@/stores/auth';
import { useBlogStore } from '@/stores/blog';
import { useEngagementStore } from '@/stores/engagement';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const blog = useBlogStore();
const engagement = useEngagementStore();
const ui = useUiStore();

// 会话、内容与互动数据都来自后端，互不依赖，可以并行拉取
void Promise.all([auth.hydrate(), blog.hydrate(), engagement.hydrate()]);
</script>

<template>
  <SiteHeader />

  <main class="layout">
    <div class="content-col">
      <TimelineView v-if="ui.view === 'timeline'" />
      <ProfileView v-else />
    </div>

    <TrendingPanel />
  </main>

  <footer class="site-footer">
    <p>Miniblog · Vue 3 + Pinia + Hono · 数据存在服务端内存里，重启服务后清空</p>
  </footer>

  <AuthDialog />
  <ToastBar />
</template>
