import { defineStore } from 'pinia';
import { ref } from 'vue';
import { loadTrending, type TrendingResult } from '@/core/trending';
import type { TrendingItem } from '@/core/types';

export type TrendingStatus = 'idle' | 'loading' | 'ready' | 'error';

export const useTrendingStore = defineStore('trending', () => {
  const items = ref<TrendingItem[]>([]);
  const source = ref('');
  const updatedAt = ref('');
  const status = ref<TrendingStatus>('idle');
  const loading = ref(false);

  function apply(result: TrendingResult): void {
    items.value = result.items;
    source.value = result.source + (result.stale ? '（缓存）' : '');
    updatedAt.value = result.updatedAt;
  }

  async function load(force = false): Promise<void> {
    if (loading.value) return;

    loading.value = true;
    status.value = 'loading';

    try {
      const result = await loadTrending({ force });
      apply(result);
      status.value = 'ready';
    } catch {
      // loadTrending 内部已做降级，这里只兜底避免未处理的 rejection
      status.value = 'error';
    } finally {
      loading.value = false;
    }
  }

  return { items, source, updatedAt, status, loading, load };
});
