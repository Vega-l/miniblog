(function () {
  'use strict';

  const Store = window.Store;
  const Auth = window.Auth;

  const postList = document.getElementById('post-list');
  const emptyState = document.getElementById('empty-state');
  const postCount = document.getElementById('post-count');

  const composerGuest = document.getElementById('composer-guest');
  const composerUser = document.getElementById('composer-user');
  const composerForm = document.getElementById('composer-form');
  const composerInput = document.getElementById('composer-input');
  const composerAvatar = document.getElementById('composer-avatar');
  const composerNotice = document.getElementById('composer-notice');
  const publishBtn = document.getElementById('publish-btn');

  const loginOpenBtn = document.getElementById('login-open-btn');
  const userMenu = document.getElementById('user-menu');
  const headerAvatar = document.getElementById('header-avatar');
  const headerName = document.getElementById('header-name');
  const profileBtn = document.getElementById('profile-btn');
  const logoutBtn = document.getElementById('logout-btn');

  const timelineView = document.getElementById('timeline-view');
  const profileView = document.getElementById('profile-view');
  const backBtn = document.getElementById('back-btn');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileHandle = document.getElementById('profile-handle');
  const profileMeta = document.getElementById('profile-meta');
  const profileStats = document.getElementById('profile-stats');
  const profilePosts = document.getElementById('profile-posts');
  const profileComments = document.getElementById('profile-comments');
  const profileEmpty = document.getElementById('profile-empty');

  const authDialog = document.getElementById('auth-dialog');
  const authForm = document.getElementById('auth-form');
  const authTitle = document.getElementById('auth-title');
  const authUsername = document.getElementById('auth-username');
  const authDisplayField = document.getElementById('auth-display-field');
  const authDisplay = document.getElementById('auth-display');
  const authPassword = document.getElementById('auth-password');
  const authError = document.getElementById('auth-error');
  const authSubmit = document.getElementById('auth-submit');
  const authClose = document.getElementById('auth-close');
  const authSwitchBtn = document.getElementById('auth-switch-btn');
  const authSwitchLabel = document.getElementById('auth-switch-label');

  const toast = document.getElementById('toast');

  const postTemplate = document.getElementById('post-template');
  const commentTemplate = document.getElementById('comment-template');
  const profileItemTemplate = document.getElementById('profile-item-template');

  const noticeDefault = composerNotice.textContent;

  const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const state = {
    users: [],
    posts: [],
    comments: [],
    currentUser: null,
    view: 'timeline',
    profileTab: 'posts',
    openComments: new Set(),
    authMode: 'login',
    authBusy: false,
  };

  let toastTimer = null;

  /* ---------- 通用工具 ---------- */

  function initialOf(user) {
    const source = (user.displayName || user.username || '?').trim();
    return source ? source.slice(0, 1).toUpperCase() : '?';
  }

  function authorOf(userId) {
    if (!userId) {
      return { name: '之前的访客', handle: '@guest', initial: '客' };
    }
    const user = state.users.find(function (item) {
      return item.id === userId;
    });
    if (!user) {
      return { name: '已注销用户', handle: '@unknown', initial: '?' };
    }
    return { name: user.displayName, handle: '@' + user.username, initial: initialOf(user) };
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date);
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2600);
  }

  function findPostNode(postId) {
    return (
      Array.prototype.find.call(postList.children, function (node) {
        return node.dataset.postId === postId;
      }) || null
    );
  }

  function commentCountOf(postId) {
    return state.comments.filter(function (comment) {
      return comment.postId === postId;
    }).length;
  }

  function fillList(element, nodes) {
    const fragment = document.createDocumentFragment();
    nodes.forEach(function (node) {
      fragment.appendChild(node);
    });
    element.replaceChildren(fragment);
  }

  /* ---------- 渲染：外壳 ---------- */

  function renderHeader() {
    const user = state.currentUser;
    loginOpenBtn.hidden = Boolean(user);
    userMenu.hidden = !user;

    if (user) {
      headerAvatar.textContent = initialOf(user);
      headerName.textContent = user.displayName;
    }
  }

  function renderComposer() {
    const user = state.currentUser;
    composerGuest.hidden = Boolean(user);
    composerUser.hidden = !user;

    if (user) {
      composerAvatar.textContent = initialOf(user);
    }
    syncPublishState();
  }

  function renderShell() {
    renderHeader();
    renderComposer();
  }

  /* ---------- 渲染：帖子与评论 ---------- */

  function applyCommentPermissions(node) {
    const loggedIn = Boolean(state.currentUser);
    node.querySelector('[data-role="comment-form"]').hidden = !loggedIn;
    node.querySelector('[data-role="comment-lock"]').hidden = loggedIn;
  }

  function buildCommentNode(comment) {
    const node = commentTemplate.content.firstElementChild.cloneNode(true);
    const author = authorOf(comment.authorId);

    node.querySelector('[data-role="comment-avatar"]').textContent = author.initial;
    node.querySelector('[data-role="comment-author"]').textContent = author.name;

    const time = node.querySelector('[data-role="comment-time"]');
    const date = new Date(comment.createdAt);
    if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
    time.textContent = formatTime(comment.createdAt);

    node.querySelector('[data-role="comment-content"]').textContent = comment.content;
    return node;
  }

  function fillComments(postId, box) {
    const list = box.querySelector('[data-role="comment-list"]');
    const items = state.comments.filter(function (comment) {
      return comment.postId === postId;
    });

    if (!items.length) {
      const placeholder = document.createElement('li');
      placeholder.className = 'comment-empty';
      placeholder.textContent = '还没有评论';
      list.replaceChildren(placeholder);
      return;
    }

    fillList(list, items.map(buildCommentNode));
  }

  function updateCommentCount(node, postId) {
    const count = commentCountOf(postId);
    const label = node.querySelector('[data-role="comment-count"]');
    label.textContent = count > 0 ? String(count) : '评论';
    node.querySelector('[data-role="toggle-comments"]').setAttribute(
      'aria-label',
      count > 0 ? '查看 ' + count + ' 条评论' : '查看评论'
    );
  }

  function buildPostNode(post) {
    const node = postTemplate.content.firstElementChild.cloneNode(true);
    const author = authorOf(post.authorId);

    node.dataset.postId = post.id;
    node.querySelector('[data-role="post-avatar"]').textContent = author.initial;
    node.querySelector('[data-role="post-author"]').textContent = author.name;
    node.querySelector('[data-role="post-handle"]').textContent = author.handle;

    const time = node.querySelector('[data-role="post-time"]');
    const date = new Date(post.createdAt);
    if (!Number.isNaN(date.getTime())) time.dateTime = date.toISOString();
    time.textContent = formatTime(post.createdAt);

    node.querySelector('[data-role="post-content"]').textContent = post.content;

    const box = node.querySelector('[data-role="comments"]');
    const toggle = node.querySelector('[data-role="toggle-comments"]');
    const open = state.openComments.has(post.id);

    box.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) fillComments(post.id, box);

    updateCommentCount(node, post.id);
    applyCommentPermissions(node);

    return node;
  }

  function renderTimeline() {
    fillList(postList, state.posts.map(buildPostNode));
    emptyState.hidden = state.posts.length > 0;
    postCount.textContent = state.posts.length ? state.posts.length + ' 条' : '';
  }

  function toggleComments(postId) {
    const node = findPostNode(postId);
    if (!node) return;

    const box = node.querySelector('[data-role="comments"]');
    const toggle = node.querySelector('[data-role="toggle-comments"]');
    const willOpen = box.hidden;

    if (willOpen) {
      state.openComments.add(postId);
      fillComments(postId, box);
      box.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      const input = node.querySelector('[data-role="comment-input"]');
      if (input && state.currentUser) {
        window.setTimeout(function () {
          input.focus();
        }, 0);
      }
    } else {
      state.openComments.delete(postId);
      box.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  /* ---------- 渲染：个人主页 ---------- */

  function buildProfileItem(options) {
    const node = profileItemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('[data-role="content"]').textContent = options.content;
    node.querySelector('[data-role="meta"]').textContent = options.meta;

    const jump = node.querySelector('[data-role="jump"]');
    if (options.jumpTo) {
      jump.hidden = false;
      jump.dataset.targetPost = options.jumpTo;
    }
    return node;
  }

  function renderProfile() {
    const user = state.currentUser;
    if (!user) {
      switchView('timeline');
      return;
    }

    profileAvatar.textContent = initialOf(user);
    profileName.textContent = user.displayName;
    profileHandle.textContent = '@' + user.username;
    profileMeta.textContent = '加入于 ' + formatDate(user.createdAt);

    const myPosts = state.posts.filter(function (post) {
      return post.authorId === user.id;
    });
    const myComments = state.comments.filter(function (comment) {
      return comment.authorId === user.id;
    });

    profileStats.textContent = myPosts.length + ' 条帖子 · ' + myComments.length + ' 条评论';

    fillList(
      profilePosts,
      myPosts.map(function (post) {
        return buildProfileItem({
          content: post.content,
          meta: formatTime(post.createdAt) + ' · ' + commentCountOf(post.id) + ' 条评论',
        });
      })
    );

    fillList(
      profileComments,
      myComments.map(function (comment) {
        const post = state.posts.find(function (item) {
          return item.id === comment.postId;
        });
        const target = post ? authorOf(post.authorId).name : '已删除的帖子';
        return buildProfileItem({
          content: comment.content,
          meta: '评论于 ' + target + ' 的帖子 · ' + formatTime(comment.createdAt),
          jumpTo: post ? post.id : null,
        });
      })
    );

    const isPostsTab = state.profileTab === 'posts';
    const activeList = isPostsTab ? profilePosts : profileComments;

    profilePosts.hidden = !isPostsTab;
    profileComments.hidden = isPostsTab;

    const isEmpty = activeList.children.length === 0;
    profileEmpty.hidden = !isEmpty;
    profileEmpty.textContent = isPostsTab ? '还没有发过帖子。' : '还没有发表过评论。';
  }

  /* ---------- 视图切换 ---------- */

  function switchView(view, options) {
    state.view = view;
    timelineView.hidden = view !== 'timeline';
    profileView.hidden = view !== 'profile';

    if (view === 'profile') renderProfile();

    if (!options || !options.keepScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function jumpToPost(postId) {
    switchView('timeline', { keepScroll: true });

    const node = findPostNode(postId);
    if (!node) {
      showToast('原帖已不存在');
      return;
    }

    state.openComments.add(postId);
    const box = node.querySelector('[data-role="comments"]');
    box.hidden = false;
    node.querySelector('[data-role="toggle-comments"]').setAttribute('aria-expanded', 'true');
    fillComments(postId, box);

    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    node.classList.remove('is-highlight');
    void node.offsetWidth;
    node.classList.add('is-highlight');
    window.setTimeout(function () {
      node.classList.remove('is-highlight');
    }, 1600);
  }

  /* ---------- 发布与评论 ---------- */

  function syncPublishState() {
    const hasContent = composerInput.value.trim().length > 0;
    publishBtn.disabled = !state.currentUser || !hasContent;
  }

  function setComposerNotice(text, isError) {
    composerNotice.textContent = text;
    composerNotice.classList.toggle('is-error', Boolean(isError));
  }

  function submitPost() {
    const user = state.currentUser;
    if (!user) {
      openAuthDialog('login');
      return;
    }

    const content = composerInput.value.trim().slice(0, Store.LIMITS.post);
    if (!content) {
      syncPublishState();
      return;
    }

    const post = {
      id: Store.uid('post'),
      authorId: user.id,
      content: content,
      createdAt: Date.now(),
    };

    state.posts.unshift(post);

    if (!Store.savePosts(state.posts)) {
      state.posts.shift();
      setComposerNotice('发布失败：本地存储不可用', true);
      return;
    }

    const node = buildPostNode(post);
    node.classList.add('is-new');
    postList.prepend(node);

    emptyState.hidden = true;
    postCount.textContent = state.posts.length + ' 条';

    composerForm.reset();
    setComposerNotice(noticeDefault, false);
    syncPublishState();
    composerInput.focus();
    showToast('已发布');
  }

  function submitComment(postId, rawText) {
    const user = state.currentUser;
    if (!user) {
      openAuthDialog('login');
      return;
    }

    const content = rawText.trim().slice(0, Store.LIMITS.comment);
    if (!content) return;

    const comment = {
      id: Store.uid('comment'),
      postId: postId,
      authorId: user.id,
      content: content,
      createdAt: Date.now(),
    };

    state.comments.push(comment);

    if (!Store.saveComments(state.comments)) {
      state.comments.pop();
      showToast('评论保存失败');
      return;
    }

    state.openComments.add(postId);

    const node = findPostNode(postId);
    if (!node) return;

    const box = node.querySelector('[data-role="comments"]');
    box.hidden = false;
    node.querySelector('[data-role="toggle-comments"]').setAttribute('aria-expanded', 'true');
    fillComments(postId, box);
    updateCommentCount(node, postId);

    const input = node.querySelector('[data-role="comment-input"]');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  /* ---------- 账号 ---------- */

  function applyAuthMode() {
    const isRegister = state.authMode === 'register';

    authTitle.textContent = isRegister ? '创建账号' : '登录';
    authSubmit.textContent = isRegister ? '创建账号' : '登录';
    authSubmit.disabled = state.authBusy;
    authDisplayField.hidden = !isRegister;
    authSwitchLabel.textContent = isRegister ? '已有账号？' : '还没有账号？';
    authSwitchBtn.textContent = isRegister ? '去登录' : '立即注册';
    authPassword.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
    authError.textContent = '';
  }

  function openAuthDialog(mode) {
    state.authMode = mode || 'login';
    state.authBusy = false;
    authForm.reset();
    applyAuthMode();

    if (!authDialog.open) authDialog.showModal();
    authUsername.focus();
  }

  function reloadData() {
    state.users = Store.loadUsers();
    state.posts = Store.loadPosts();
    state.comments = Store.loadComments();
    state.currentUser = Auth.currentUser();
  }

  function refreshAfterAuth() {
    reloadData();
    renderShell();
    renderTimeline();
    if (state.view === 'profile') renderProfile();
  }

  async function handleAuthSubmit() {
    if (state.authBusy) return;

    const payload = {
      username: authUsername.value,
      displayName: authDisplay.value,
      password: authPassword.value,
    };

    state.authBusy = true;
    authError.textContent = '';
    applyAuthMode();

    const mode = state.authMode;
    const result = mode === 'register' ? await Auth.register(payload) : await Auth.login(payload);

    state.authBusy = false;
    applyAuthMode();

    if (!result.ok) {
      authError.textContent = result.error;
      return;
    }

    authDialog.close();
    refreshAfterAuth();

    if (mode === 'register') {
      showToast(
        result.adopted > 0
          ? '账号已创建，接管了之前的 ' + result.adopted + ' 条内容'
          : '账号已创建，欢迎'
      );
    } else {
      showToast('欢迎回来，' + result.user.displayName);
    }
  }

  function handleLogout() {
    Auth.logout();
    state.currentUser = null;
    state.openComments.clear();
    renderShell();
    if (state.view === 'profile') switchView('timeline');
    renderTimeline();
    showToast('已退出登录');
  }

  /* ---------- 事件绑定 ---------- */

  function bindEvents() {
    loginOpenBtn.addEventListener('click', function () {
      openAuthDialog('login');
    });

    document.addEventListener('click', function (event) {
      const trigger = event.target.closest('.js-open-auth');
      if (!trigger) return;
      event.preventDefault();
      openAuthDialog('login');
    });

    profileBtn.addEventListener('click', function () {
      switchView('profile');
    });

    backBtn.addEventListener('click', function () {
      switchView('timeline');
    });

    logoutBtn.addEventListener('click', handleLogout);

    document.querySelector('.tabs').addEventListener('click', function (event) {
      const tab = event.target.closest('.tab');
      if (!tab) return;

      state.profileTab = tab.dataset.tab;
      Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (item) {
        const active = item === tab;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', String(active));
      });
      renderProfile();
    });

    composerForm.addEventListener('submit', function (event) {
      event.preventDefault();
      submitPost();
    });

    composerInput.addEventListener('input', function () {
      if (composerNotice.classList.contains('is-error')) {
        setComposerNotice(noticeDefault, false);
      }
      syncPublishState();
    });

    composerInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        composerForm.requestSubmit();
      }
    });

    postList.addEventListener('click', function (event) {
      const toggle = event.target.closest('[data-role="toggle-comments"]');
      if (!toggle) return;
      const post = toggle.closest('.post');
      if (post) toggleComments(post.dataset.postId);
    });

    postList.addEventListener('submit', function (event) {
      const form = event.target.closest('.comment-form');
      if (!form) return;
      event.preventDefault();

      const post = form.closest('.post');
      const input = form.querySelector('[data-role="comment-input"]');
      if (post && input) submitComment(post.dataset.postId, input.value);
    });

    profileComments.addEventListener('click', function (event) {
      const jump = event.target.closest('[data-role="jump"]');
      if (!jump || !jump.dataset.targetPost) return;
      jumpToPost(jump.dataset.targetPost);
    });

    authClose.addEventListener('click', function () {
      authDialog.close();
    });

    authSwitchBtn.addEventListener('click', function () {
      state.authMode = state.authMode === 'register' ? 'login' : 'register';
      authForm.reset();
      applyAuthMode();
      authUsername.focus();
    });

    authForm.addEventListener('submit', function (event) {
      event.preventDefault();
      handleAuthSubmit();
    });

    authDialog.addEventListener('click', function (event) {
      if (event.target === authDialog) authDialog.close();
    });
  }

  /* ---------- 初始化 ---------- */

  function cleanupOrphanComments() {
    const postIds = new Set(
      state.posts.map(function (post) {
        return post.id;
      })
    );
    const kept = state.comments.filter(function (comment) {
      return postIds.has(comment.postId);
    });

    if (kept.length !== state.comments.length) {
      state.comments = kept;
      Store.saveComments(state.comments);
    }
  }

  function init() {
    if (!Store.canUseStorage()) {
      setComposerNotice('当前浏览器禁用了本地存储，内容无法保存', true);
    }

    Store.migrateLegacyPosts();
    reloadData();
    cleanupOrphanComments();

    renderShell();
    renderTimeline();
    bindEvents();

    if (window.Trending) {
      window.Trending.mount({
        listId: 'trend-list',
        updatedId: 'trend-updated',
        sourceId: 'trend-source',
        emptyId: 'trend-empty',
        refreshId: 'trend-refresh',
      });
    }
  }

  init();
})();
