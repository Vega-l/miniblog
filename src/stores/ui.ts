import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ViewName = 'timeline' | 'profile';
export type ProfileTab = 'posts' | 'comments' | 'bookmarks';
export type AuthMode = 'login' | 'register';

const TOAST_DURATION = 2600;

export const useUiStore = defineStore('ui', () => {
  const view = ref<ViewName>('timeline');
  const profileTab = ref<ProfileTab>('posts');
  const openComments = ref<string[]>([]);
  const highlightPostId = ref<string | null>(null);

  const toastMessage = ref('');
  const toastVisible = ref(false);
  const authOpen = ref(false);
  const authMode = ref<AuthMode>('login');

  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  function openTimeline(): void {
    view.value = 'timeline';
    highlightPostId.value = null;
  }

  function openProfile(): void {
    view.value = 'profile';
    profileTab.value = 'posts';
  }

  function setProfileTab(tab: ProfileTab): void {
    profileTab.value = tab;
  }

  function isCommentsOpen(postId: string): boolean {
    return openComments.value.includes(postId);
  }

  function openCommentsFor(postId: string): void {
    if (!openComments.value.includes(postId)) {
      openComments.value = [...openComments.value, postId];
    }
  }

  function toggleComments(postId: string): void {
    openComments.value = isCommentsOpen(postId)
      ? openComments.value.filter((id) => id !== postId)
      : [...openComments.value, postId];
  }

  function focusPost(postId: string): void {
    view.value = 'timeline';
    highlightPostId.value = postId;
    openCommentsFor(postId);
  }

  function clearOpenComments(): void {
    openComments.value = [];
  }

  function clearHighlight(): void {
    highlightPostId.value = null;
  }

  function showToast(message: string): void {
    toastMessage.value = message;
    toastVisible.value = true;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastVisible.value = false;
    }, TOAST_DURATION);
  }

  function openAuth(mode: AuthMode = 'login'): void {
    authMode.value = mode;
    authOpen.value = true;
  }

  function closeAuth(): void {
    authOpen.value = false;
  }

  return {
    view,
    profileTab,
    openComments,
    highlightPostId,
    toastMessage,
    toastVisible,
    authOpen,
    authMode,
    openTimeline,
    openProfile,
    setProfileTab,
    isCommentsOpen,
    openCommentsFor,
    toggleComments,
    focusPost,
    clearOpenComments,
    clearHighlight,
    showToast,
    openAuth,
    closeAuth,
  };
});
