<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { LIMITS } from '@/core/constants';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';

const auth = useAuthStore();
const ui = useUiStore();

const dialogEl = ref<HTMLDialogElement | null>(null);
const username = ref('');
const displayName = ref('');
const password = ref('');
const localError = ref('');

const isRegister = computed(() => ui.authMode === 'register');
const errorText = computed(() => localError.value || auth.error);
const submitLabel = computed(() => (isRegister.value ? '创建账号' : '登录'));

function syncDialog(): void {
  const el = dialogEl.value;
  if (!el) return;

  if (ui.authOpen) {
    // 必须先调用 showModal()：如果先设置 open 属性，el.open 会变成 true，模态分支永远进不去
    if (el.open) {
      /* 已经打开，无需重复调用 */
    } else if (typeof el.showModal === 'function') {
      try {
        el.showModal();
      } catch {
        el.setAttribute('open', '');
      }
    } else {
      /* jsdom 等环境没有模态能力，退化为 open 属性 */
      el.setAttribute('open', '');
    }
    void nextTick(() => {
      document.getElementById('auth-username')?.focus();
    });
  } else {
    if (typeof el.close === 'function' && el.open) el.close();
    el.removeAttribute('open');
  }
}

function resetFields(): void {
  username.value = '';
  displayName.value = '';
  password.value = '';
  localError.value = '';
  auth.error = '';
}

watch(
  () => ui.authOpen,
  (open) => {
    if (open) resetFields();
    syncDialog();
  },
  { flush: 'post' }
);

watch(
  () => ui.authMode,
  () => {
    localError.value = '';
    auth.error = '';
  }
);

onMounted(syncDialog);

function closeDialog(): void {
  ui.closeAuth();
}

function switchMode(): void {
  ui.openAuth(isRegister.value ? 'login' : 'register');
}

async function submit(): Promise<void> {
  if (auth.busy) return;

  localError.value = '';
  auth.error = '';

  const mode = ui.authMode;
  const result =
    mode === 'register'
      ? await auth.register({
          username: username.value,
          displayName: displayName.value,
          password: password.value,
        })
      : await auth.login({ username: username.value, password: password.value });

  if (!result.ok) {
    localError.value = result.error;
    return;
  }

  ui.closeAuth();
  ui.showToast(mode === 'register' ? '账号已创建，欢迎' : `欢迎回来，${result.user.displayName}`);
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="auth-dialog"
    aria-labelledby="auth-title"
    @cancel.prevent="closeDialog"
    @click.self="closeDialog"
  >
    <div class="auth-box">
      <div class="auth-head">
        <h2 id="auth-title">{{ isRegister ? '创建账号' : '登录' }}</h2>
        <button type="button" class="icon-btn" aria-label="关闭" @click="closeDialog">&times;</button>
      </div>

      <form novalidate @submit.prevent="submit">
        <label class="field">
          <span class="field-label">用户名</span>
          <input
            id="auth-username"
            v-model="username"
            type="text"
            :maxlength="LIMITS.username"
            autocomplete="username"
            placeholder="2–16 位字符"
            required
          />
        </label>

        <label v-if="isRegister" class="field">
          <span class="field-label">昵称（可选）</span>
          <input
            v-model="displayName"
            type="text"
            :maxlength="LIMITS.displayName"
            placeholder="不填则与用户名相同"
          />
        </label>

        <label class="field">
          <span class="field-label">密码</span>
          <input
            id="auth-password"
            v-model="password"
            type="password"
            :maxlength="LIMITS.password"
            :autocomplete="isRegister ? 'new-password' : 'current-password'"
            placeholder="至少 6 位"
            required
          />
        </label>

        <p class="auth-error" role="alert">{{ errorText }}</p>

        <button type="submit" class="btn-primary btn-block" :disabled="auth.busy">
          {{ auth.busy ? '请稍候…' : submitLabel }}
        </button>
      </form>

      <p class="auth-switch">
        <span>{{ isRegister ? '已有账号？' : '还没有账号？' }}</span>
        <button type="button" class="link-btn" @click="switchMode">
          {{ isRegister ? '去登录' : '立即注册' }}
        </button>
      </p>

      <p class="auth-note">账号由后端校验并保存在服务端内存中，重启服务后需要重新注册。</p>
    </div>
  </dialog>
</template>
