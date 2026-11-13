<script setup lang="ts">
import { computed } from 'vue';
import { initialOf } from '@/core/format';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const initial = computed(() => initialOf(auth.currentUser));

function openAuth(): void {
  ui.openAuth('login');
}

async function logout(): Promise<void> {
  await auth.logout();
  ui.clearOpenComments();
  ui.openTimeline();
  // 服务端会话没清掉时不能谎称「已退出」，否则刷新后又回到登录态
  ui.showToast(auth.error || '已退出登录');
}
</script>

<template>
  <header class="site-header">
    <div class="header-inner">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">M</span>
        <span class="brand-name">MINIBLOG</span>
      </div>

      <div class="header-actions">
        <button v-if="!auth.currentUser" type="button" class="btn-ghost" @click="openAuth">
          登录 / 注册
        </button>

        <div v-else class="user-menu">
          <button type="button" class="user-chip" title="查看我的主页" @click="ui.openProfile()">
            <span class="avatar avatar-xs" aria-hidden="true">{{ initial }}</span>
            <span class="user-chip-name">{{ auth.currentUser.displayName }}</span>
          </button>
          <button type="button" class="btn-ghost" @click="logout">退出</button>
        </div>
      </div>
    </div>
  </header>
</template>
