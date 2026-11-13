(function () {
  'use strict';

  const STORAGE_KEY = 'miniblog.posts.v1';
  const MAX_LENGTH = 280;
  const PROFILE = { name: 'Guest', handle: '@guest', initial: 'G' };

  const form = document.getElementById('composer-form');
  const input = document.getElementById('composer-input');
  const publishBtn = document.getElementById('publish-btn');
  const notice = document.getElementById('composer-notice');
  const list = document.getElementById('post-list');
  const emptyState = document.getElementById('empty-state');
  const countLabel = document.getElementById('post-count');
  const template = document.getElementById('post-template');

  const defaultNotice = notice.textContent;
  const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const state = {
    posts: [],
    storageOk: true,
  };

  function canUseStorage() {
    try {
      const probe = '__miniblog_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function normalizePost(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const content = typeof raw.content === 'string' ? raw.content.trim() : '';
    if (!content) return null;

    const createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now();

    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
      content: content.slice(0, MAX_LENGTH),
      createdAt: createdAt,
    };
  }

  function loadPosts() {
    if (!state.storageOk) return [];

    let parsed;
    try {
      parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (error) {
      console.warn('[miniblog] 本地数据解析失败，已按空列表处理。', error);
      return [];
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalizePost)
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function persist() {
    if (!state.storageOk) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posts));
      return true;
    } catch (error) {
      console.warn('[miniblog] 写入本地存储失败。', error);
      showNotice('保存失败：浏览器存储空间不足或已被禁用。', true);
      return false;
    }
  }

  function showNotice(text, isError) {
    notice.textContent = text;
    notice.classList.toggle('is-error', Boolean(isError));
  }

  function resetNotice() {
    showNotice(defaultNotice, false);
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return timeFormatter.format(date);
  }

  function buildPostElement(post) {
    const node = template.content.firstElementChild.cloneNode(true);

    node.dataset.id = post.id;
    node.querySelector('.avatar').textContent = PROFILE.initial;
    node.querySelector('.post-author').textContent = PROFILE.name;
    node.querySelector('.post-handle').textContent = PROFILE.handle;

    const time = node.querySelector('.post-time');
    const date = new Date(post.createdAt);
    if (!Number.isNaN(date.getTime())) {
      time.dateTime = date.toISOString();
    }
    time.textContent = formatTime(post.createdAt);

    node.querySelector('.post-content').textContent = post.content;

    return node;
  }

  function updateCount() {
    countLabel.textContent = state.posts.length ? state.posts.length + ' 条' : '';
  }

  function renderAll() {
    const fragment = document.createDocumentFragment();
    state.posts.forEach((post) => fragment.appendChild(buildPostElement(post)));
    list.replaceChildren(fragment);
    emptyState.hidden = state.posts.length > 0;
    updateCount();
  }

  function prependPost(post) {
    list.prepend(buildPostElement(post));
    emptyState.hidden = true;
    updateCount();
  }

  function syncPublishState() {
    const hasContent = input.value.trim().length > 0;
    publishBtn.disabled = !state.storageOk || !hasContent;
  }

  function createPost() {
    if (!state.storageOk) {
      showNotice('当前浏览器不支持本地存储，无法发布。', true);
      return;
    }

    const content = input.value.trim().slice(0, MAX_LENGTH);
    if (!content) {
      syncPublishState();
      return;
    }

    const post = { id: createId(), content: content, createdAt: Date.now() };
    state.posts.unshift(post);

    if (!persist()) {
      state.posts.shift();
      return;
    }

    prependPost(post);
    form.reset();
    resetNotice();
    syncPublishState();
    input.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    createPost();
  });

  input.addEventListener('input', () => {
    if (notice.classList.contains('is-error')) resetNotice();
    syncPublishState();
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  function init() {
    state.storageOk = canUseStorage();

    if (!state.storageOk) {
      showNotice('当前浏览器禁用了本地存储，内容无法保存。', true);
    }

    state.posts = loadPosts();
    renderAll();
    syncPublishState();
  }

  init();
})();
