<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useTrendingStore } from '@/stores/trending';

const trending = useTrendingStore();

const clockFormatter = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });
const clock = ref(clockFormatter.format(new Date()));

const updatedLabel = computed(() =>
  trending.updatedAt ? `更新于 ${trending.updatedAt}` : `更新于 ${clock.value}`
);

onMounted(() => {
  void trending.load();
});

function refresh(): void {
  clock.value = clockFormatter.format(new Date());
  void trending.load(true);
}
</script>

<template>
  <aside class="sidebar" aria-labelledby="trending-title">
    <section class="trend-card">
      <div class="trend-head">
        <div class="trend-heading">
          <span class="trend-kicker">全网热搜</span>
          <h2 id="trending-title">TOP 10</h2>
        </div>
        <button
          type="button"
          class="trend-refresh"
          :class="{ 'is-spinning': trending.loading }"
          :disabled="trending.loading"
          aria-label="刷新热搜"
          title="刷新"
          @click="refresh"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>

      <ol v-if="trending.items.length" class="trend-list">
        <li v-for="(item, index) in trending.items" :key="`${index}-${item.title}`" class="trend-item">
          <span class="trend-rank" :class="{ 'is-top': index < 3 }">{{ index + 1 }}</span>
          <span class="trend-title">{{ item.title }}</span>
          <span class="trend-hot">{{ item.hot }}</span>
        </li>
      </ol>
      <p v-else class="trend-empty">暂时没有数据</p>

      <div class="trend-foot">
        <span>{{ updatedLabel }}</span>
        <span class="trend-source">{{ trending.source }}</span>
      </div>
    </section>
  </aside>
</template>
