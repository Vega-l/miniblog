<script setup lang="ts">
import { useUiStore } from '@/stores/ui';

const ui = useUiStore();
</script>

<template>
  <div class="toast" :class="{ 'is-visible': ui.toastVisible }" role="status" aria-live="polite">
    {{ ui.toastMessage }}
  </div>
</template>
