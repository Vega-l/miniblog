window.Trending = (function () {
  'use strict';

  // 数据源：同源 JSON，换成自己的接口时只改这一行即可。
  // 要求返回 { updatedAt, source, items: [{ title, hot, tag }] }
  const ENDPOINT = 'data/trending.json';

  const CACHE_KEY = 'miniblog.trending.v1';
  const CACHE_TTL = 5 * 60 * 1000;
  const REQUEST_TIMEOUT = 6000;
  const LIMIT = 10;

  // 以 file:// 直接打开时浏览器会拦截同源 JSON 请求，这里保留一份兜底数据
  const FALLBACK_ITEMS = [
    { title: '国产开源推理框架发布 2.0 版本，长文本吞吐提升明显', hot: '982.4万', tag: '科技' },
    { title: '多地迎来今冬首场降雪，早高峰通行时间普遍延长', hot: '861.2万', tag: '社会' },
    { title: '高校团队研发出可降解快递包装材料，成本接近传统纸箱', hot: '734.9万', tag: '科技' },
    { title: '部分城市地铁试点安静车厢，乘客评价两极', hot: '652.7万', tag: '生活' },
    { title: '冬季流感进入高发期，医生建议重点人群尽早接种疫苗', hot: '598.3万', tag: '健康' },
    { title: '国产动画电影累计票房突破十亿，密钥宣布延期一个月', hot: '541.6万', tag: '文娱' },
    { title: '深空探测任务公布新一批月背高清影像', hot: '487.0万', tag: '科学' },
    { title: '多款智能手表新增睡眠呼吸监测功能，监管标准仍在讨论', hot: '412.8万', tag: '科技' },
    { title: '菜市场改造后引入溯源电子秤，扫码即可查看产地', hot: '356.5万', tag: '民生' },
    { title: '马拉松赛季开启，多地为避开高温调整赛事路线', hot: '301.2万', tag: '体育' },
  ];

  const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const state = {
    items: [],
    source: '',
    updatedAt: '',
    loading: false,
  };

  let listEl = null;
  let updatedEl = null;
  let sourceEl = null;
  let emptyEl = null;
  let refreshBtn = null;

  function normalize(payload) {
    if (!payload || !Array.isArray(payload.items)) return null;

    const items = payload.items
      .map(function (raw) {
        if (!raw || typeof raw.title !== 'string') return null;
        const title = raw.title.trim().slice(0, 80);
        if (!title) return null;
        return {
          title: title,
          hot: typeof raw.hot === 'string' ? raw.hot : '',
          tag: typeof raw.tag === 'string' ? raw.tag : '',
        };
      })
      .filter(Boolean)
      .slice(0, LIMIT);

    if (!items.length) return null;

    return {
      items: items,
      source: typeof payload.source === 'string' ? payload.source : '未知来源',
      updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : '',
    };
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.savedAt !== 'number') return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeCache(payload) {
    try {
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          items: payload.items,
          source: payload.source,
          updatedAt: payload.updatedAt,
        })
      );
    } catch (error) {
      /* 缓存失败不影响展示 */
    }
  }

  async function request() {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? window.setTimeout(function () {
          controller.abort();
        }, REQUEST_TIMEOUT)
      : null;

    try {
      const response = await fetch(ENDPOINT + '?t=' + Date.now(), {
        cache: 'no-store',
        signal: controller ? controller.signal : undefined,
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);

      const data = normalize(await response.json());
      if (!data) throw new Error('数据格式不符合预期');
      return data;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async function load(options) {
    const force = Boolean(options && options.force);

    if (!force) {
      const cached = readCache();
      if (cached && Date.now() - cached.savedAt < CACHE_TTL) {
        return { ok: true, fromCache: true, items: cached.items, source: cached.source, updatedAt: cached.updatedAt };
      }
    }

    try {
      const fresh = await request();
      writeCache(fresh);
      return { ok: true, fromCache: false, items: fresh.items, source: fresh.source, updatedAt: fresh.updatedAt };
    } catch (error) {
      const cached = readCache();
      if (cached) {
        return {
          ok: true,
          fromCache: true,
          stale: true,
          items: cached.items,
          source: cached.source,
          updatedAt: cached.updatedAt,
        };
      }
      console.warn('[miniblog] 热搜数据加载失败，改用内置兜底数据。', error);
      return {
        ok: true,
        items: FALLBACK_ITEMS,
        source: '内置演示数据',
        updatedAt: '',
        fallback: true,
      };
    }
  }

  function buildRow(item, index) {
    const row = document.createElement('li');
    row.className = 'trend-item';

    const rank = document.createElement('span');
    rank.className = 'trend-rank' + (index < 3 ? ' is-top' : '');
    rank.textContent = String(index + 1);

    const title = document.createElement('span');
    title.className = 'trend-title';
    title.textContent = item.title;

    const hot = document.createElement('span');
    hot.className = 'trend-hot';
    hot.textContent = item.hot;

    row.append(rank, title, hot);
    return row;
  }

  function render() {
    if (!listEl) return;

    const fragment = document.createDocumentFragment();
    state.items.forEach(function (item, index) {
      fragment.appendChild(buildRow(item, index));
    });
    listEl.replaceChildren(fragment);

    if (emptyEl) emptyEl.hidden = state.items.length > 0;
    if (updatedEl) {
      updatedEl.textContent = state.updatedAt ? '更新于 ' + state.updatedAt : '更新于 ' + timeFormatter.format(new Date());
    }
    if (sourceEl) sourceEl.textContent = state.source;
  }

  async function refresh(force) {
    if (state.loading) return;
    state.loading = true;
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add('is-spinning');
    }

    const result = await load({ force: Boolean(force) });

    if (result.ok) {
      state.items = result.items;
      state.source = result.source + (result.stale ? '（缓存）' : '');
      state.updatedAt = result.updatedAt;
    } else {
      state.items = [];
      state.source = '加载失败';
      state.updatedAt = '';
    }

    render();

    state.loading = false;
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove('is-spinning');
    }
  }

  function mount(options) {
    listEl = document.getElementById(options.listId);
    updatedEl = document.getElementById(options.updatedId);
    sourceEl = document.getElementById(options.sourceId);
    emptyEl = document.getElementById(options.emptyId);
    refreshBtn = document.getElementById(options.refreshId);

    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refresh(true);
      });
    }

    render();
    refresh(false);
  }

  return { mount: mount, refresh: refresh };
})();
