window.Auth = (function () {
  'use strict';

  const Store = window.Store;

  const USERNAME_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9_]{2,16}$/;
  const MIN_PASSWORD_LENGTH = 6;

  function fail(message) {
    return { ok: false, error: message };
  }

  function toHex(bytes) {
    return Array.prototype.map
      .call(bytes, function (byte) {
        return byte.toString(16).padStart(2, '0');
      })
      .join('');
  }

  function randomHex(byteLength) {
    const bytes = new Uint8Array(byteLength);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < byteLength; i += 1) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return toHex(bytes);
  }

  function weakHash(value) {
    let h1 = 0x811c9dc5;
    let h2 = 0x9e3779b9;
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
      h2 = Math.imul(h2 ^ code, 0x85ebca6b) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
  }

  async function hashPassword(password, salt) {
    const payload = salt + ':' + password;

    if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
      try {
        const data = new TextEncoder().encode(payload);
        const digest = await window.crypto.subtle.digest('SHA-256', data);
        return 'sha256$' + toHex(new Uint8Array(digest));
      } catch (error) {
        console.warn('[miniblog] SHA-256 不可用，降级为弱哈希。', error);
      }
    }

    return 'weak$' + weakHash(payload);
  }

  function currentUser() {
    const userId = Store.getSessionUserId();
    if (!userId) return null;

    const user = Store.loadUsers().find(function (item) {
      return item.id === userId;
    });

    if (!user) {
      Store.clearSession();
      return null;
    }
    return user;
  }

  function adoptOrphanPosts(userId) {
    const posts = Store.loadPosts();
    let adopted = 0;

    const next = posts.map(function (post) {
      if (post.authorId !== null) return post;
      adopted += 1;
      return {
        id: post.id,
        authorId: userId,
        content: post.content,
        createdAt: post.createdAt,
      };
    });

    if (adopted > 0 && !Store.savePosts(next)) return 0;
    return adopted;
  }

  async function register(input) {
    const username = (input.username || '').trim();
    const displayName = (input.displayName || '').trim();
    const password = input.password || '';

    if (!USERNAME_PATTERN.test(username)) {
      return fail('用户名需为 2–16 位汉字、字母、数字或下划线');
    }
    if (displayName.length > Store.LIMITS.displayName) {
      return fail('昵称最多 16 个字符');
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return fail('密码至少 ' + MIN_PASSWORD_LENGTH + ' 位');
    }

    const users = Store.loadUsers();
    const taken = users.some(function (user) {
      return user.usernameLower === username.toLowerCase();
    });
    if (taken) return fail('该用户名已被占用');

    const salt = randomHex(16);
    const passwordHash = await hashPassword(password, salt);

    const user = {
      id: Store.uid('user'),
      username: username,
      usernameLower: username.toLowerCase(),
      displayName: displayName || username,
      salt: salt,
      passwordHash: passwordHash,
      createdAt: Date.now(),
    };

    users.push(user);
    if (!Store.saveUsers(users)) {
      return fail('本地存储不可用，无法保存账号');
    }

    Store.setSession(user.id);

    const adopted = users.length === 1 ? adoptOrphanPosts(user.id) : 0;
    return { ok: true, user: user, adopted: adopted };
  }

  async function login(input) {
    const username = (input.username || '').trim();
    const password = input.password || '';

    if (!username || !password) return fail('请输入用户名和密码');

    const user = Store.loadUsers().find(function (item) {
      return item.usernameLower === username.toLowerCase();
    });

    if (!user) return fail('用户名或密码不正确');

    const passwordHash = await hashPassword(password, user.salt);
    if (passwordHash !== user.passwordHash) return fail('用户名或密码不正确');

    Store.setSession(user.id);
    return { ok: true, user: user, adopted: 0 };
  }

  function logout() {
    Store.clearSession();
  }

  return {
    currentUser: currentUser,
    register: register,
    login: login,
    logout: logout,
  };
})();
