import { LIMITS } from './constants';
import { cleanText } from './schema';
import type { TrendingItem, TrendingPayload } from './types';

// 数据源：同源 JSON。换成自己的接口时只改这一行（接口需允许跨域）。
export const TRENDING_ENDPOINT = 'data/trending.json';
export const TRENDING_CACHE_TTL = 5 * 60 * 1000;
export const TRENDING_REQUEST_TIMEOUT = 6000;

// 以 file:// 直接打开时浏览器会拦截同源 JSON 请求，保留一份兜底数据。
export const FALLBACK_TRENDING: TrendingItem[] = [
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

export interface TrendingResult extends TrendingPayload {
  fromCache: boolean;
  stale: boolean;
  fallback: boolean;
}

export type TrendingFetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface TrendingCache extends TrendingPayload {
  savedAt: number;
}

/** 热搜缓存只活在内存里：刷新页面重新拉取，不写浏览器存储。 */
export interface TrendingCacheStore {
  read(): TrendingCache | null;
  write(value: TrendingCache | null): void;
}

export function createMemoryCache(): TrendingCacheStore {
  let current: TrendingCache | null = null;

  return {
    read: () => current,
    write(value) {
      current = value;
    },
  };
}

const defaultCache = createMemoryCache();

/** 测试用：清空模块级缓存，避免用例之间互相影响。 */
export function resetTrendingCache(): void {
  defaultCache.write(null);
}

export interface LoadTrendingOptions {
  cache?: TrendingCacheStore;
  fetcher?: TrendingFetcher;
  now?: () => number;
  endpoint?: string;
  timeoutMs?: number;
  force?: boolean;
}

function normalizeItems(raw: unknown): TrendingItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const source = item as Record<string, unknown>;
      const title = cleanText(source.title, LIMITS.trendTitle);
      if (!title) return null;

      return {
        title,
        hot: typeof source.hot === 'string' ? source.hot : '',
        tag: typeof source.tag === 'string' ? source.tag : '',
      };
    })
    .filter((item): item is TrendingItem => item !== null)
    .slice(0, LIMITS.trendingItems);
}

export function normalizeTrending(payload: unknown): TrendingPayload | null {
  if (!payload || typeof payload !== 'object') return null;

  const source = payload as Record<string, unknown>;
  const items = normalizeItems(source.items);
  if (!items.length) return null;

  return {
    items,
    source: typeof source.source === 'string' ? source.source : '未知来源',
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

function readCache(cache: TrendingCacheStore): TrendingCache | null {
  const raw = cache.read();
  if (!raw || typeof raw !== 'object') return null;

  const items = normalizeItems(raw.items);
  if (!Number.isFinite(raw.savedAt) || !items.length) return null;

  return {
    savedAt: raw.savedAt,
    items,
    source: typeof raw.source === 'string' ? raw.source : '未知来源',
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
  };
}

async function requestTrending(
  fetcher: TrendingFetcher,
  url: string,
  timeoutMs: number
): Promise<TrendingPayload> {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, timeoutMs)
    : null;

  try {
    const response = await fetcher(url, {
      cache: 'no-store',
      signal: controller?.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = normalizeTrending(await response.json());
    if (!data) throw new Error('数据格式不符合预期');
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toResult(
  cache: TrendingCache,
  flags: Pick<TrendingResult, 'fromCache' | 'stale' | 'fallback'>
): TrendingResult {
  return {
    items: cache.items,
    source: cache.source,
    updatedAt: cache.updatedAt,
    ...flags,
  };
}

export async function loadTrending(options: LoadTrendingOptions = {}): Promise<TrendingResult> {
  const cache = options.cache ?? defaultCache;
  const now = options.now ?? Date.now;
  const fetcher = options.fetcher ?? (globalThis.fetch?.bind(globalThis) as TrendingFetcher | undefined);
  const endpoint = options.endpoint ?? TRENDING_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? TRENDING_REQUEST_TIMEOUT;
  const cached = readCache(cache);

  if (!options.force && cached && now() - cached.savedAt < TRENDING_CACHE_TTL) {
    return toResult(cached, { fromCache: true, stale: false, fallback: false });
  }

  try {
    if (!fetcher) throw new Error('当前环境不支持 fetch');

    const fresh = await requestTrending(fetcher, `${endpoint}?t=${now()}`, timeoutMs);
    cache.write({ ...fresh, savedAt: now() });

    return { ...fresh, fromCache: false, stale: false, fallback: false };
  } catch {
    if (cached) {
      return toResult(cached, { fromCache: true, stale: true, fallback: false });
    }

    return {
      items: FALLBACK_TRENDING,
      source: '内置演示数据',
      updatedAt: '',
      fromCache: false,
      stale: false,
      fallback: true,
    };
  }
}
