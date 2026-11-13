window.Store = (function () {
  'use strict';

  const KEYS = {
    users: 'miniblog.users.v2',
    posts: 'miniblog.posts.v2',
    comments: 'miniblog.comments.v2',
    session: 'miniblog.session.v2',
    legacyPosts: 'miniblog.posts.v1',
  };

  const LIMITS = {
    post: 280,
    comment: 140,
    username: 16,
    displayName: 16,
  };

  let storageOk = null;

  function canUseStorage() {
    if (storageOk !== null) return storageOk;
    try {
      const probe = '__miniblog_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      storageOk = true;
    } catch (error) {
      storageOk = false;
    }
    return storageOk;
  }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function read(key, fallback) {
    if (!canUseStorage()) return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      console.warn('[miniblog] 读取失败：' + key, error);
      return fallback;
    }
  }

  function write(key, value) {
    if (!canUseStorage()) return false;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[miniblog] 写入失败：' + key, error);
      return false;
    }
  }

  function remove(key) {
    if (!canUseStorage()) return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('[miniblog] 删除失败：' + key, error);
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  function optionalId(value) {
    return typeof value === 'string' && value ? value : null;
  }

  function normalizePost(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const content = text(raw.content, LIMITS.post);
    if (!content) return null;
    return {
      id: optionalId(raw.id) || uid('post'),
      authorId: optionalId(raw.authorId),
      content: content,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    };
  }

  function normalizeComment(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const content = text(raw.content, LIMITS.comment);
    const postId = optionalId(raw.postId);
    if (!content || !postId) return null;
    return {
      id: optionalId(raw.id) || uid('comment'),
      postId: postId,
      authorId: optionalId(raw.authorId),
      content: content,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    };
  }

  function normalizeUser(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const username = text(raw.username, LIMITS.username);
    const salt = typeof raw.salt === 'string' ? raw.salt : '';
    const passwordHash = typeof raw.passwordHash === 'string' ? raw.passwordHash : '';
    if (!username || !salt || !passwordHash) return null;

    const displayName = text(raw.displayName, LIMITS.displayName) || username;

    return {
      id: optionalId(raw.id) || uid('user'),
      username: username,
      usernameLower: username.toLowerCase(),
      displayName: displayName,
      salt: salt,
      passwordHash: passwordHash,
      createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(),
    };
  }

  function loadPosts() {
    return asArray(read(KEYS.posts, []))
      .map(normalizePost)
      .filter(Boolean)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function savePosts(posts) {
    return write(KEYS.posts, posts);
  }

  function loadComments() {
    return asArray(read(KEYS.comments, []))
      .map(normalizeComment)
      .filter(Boolean)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  function saveComments(comments) {
    return write(KEYS.comments, comments);
  }

  function loadUsers() {
    return asArray(read(KEYS.users, []))
      .map(normalizeUser)
      .filter(Boolean);
  }

  function saveUsers(users) {
    return write(KEYS.users, users);
  }

  function getSessionUserId() {
    const session = read(KEYS.session, null);
    if (!session || typeof session !== 'object') return null;
    return optionalId(session.userId);
  }

  function setSession(userId) {
    return write(KEYS.session, { userId: userId });
  }

  function clearSession() {
    remove(KEYS.session);
  }

  function migrateLegacyPosts() {
    if (!canUseStorage()) return 0;

    let legacyRaw;
    try {
      if (localStorage.getItem(KEYS.posts) !== null) return 0;
      legacyRaw = localStorage.getItem(KEYS.legacyPosts);
    } catch (error) {
      return 0;
    }
    if (!legacyRaw) return 0;

    let legacy;
    try {
      legacy = JSON.parse(legacyRaw);
    } catch (error) {
      console.warn('[miniblog] 旧数据损坏，跳过迁移。', error);
      return 0;
    }
    if (!Array.isArray(legacy) || legacy.length === 0) return 0;

    const posts = legacy.map(normalizePost).filter(Boolean);
    if (!posts.length) return 0;

    if (!write(KEYS.posts, posts)) return 0;
    remove(KEYS.legacyPosts);
    return posts.length;
  }

  return {
    KEYS: KEYS,
    LIMITS: LIMITS,
    canUseStorage: canUseStorage,
    uid: uid,
    loadPosts: loadPosts,
    savePosts: savePosts,
    loadComments: loadComments,
    saveComments: saveComments,
    loadUsers: loadUsers,
    saveUsers: saveUsers,
    getSessionUserId: getSessionUserId,
    setSession: setSession,
    clearSession: clearSession,
    migrateLegacyPosts: migrateLegacyPosts,
  };
})();
