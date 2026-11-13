import { mount, type MountingOptions } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';

let activePinia: Pinia | null = null;

/** 每个用例安装一份全新的 Pinia，保证 store 之间互不污染。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function installPinia(_legacySeed?: Record<string, string>): void {
  activePinia = createPinia();
  setActivePinia(activePinia);
}

export function undoPinia(): void {
  activePinia = null;
}

/** 等待一轮 microtask + 定时器，用于 await store 的异步 action。 */
export function flushPromises(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mountWithPinia(component: any, options: MountingOptions<any> = {}) {
  const plugins: unknown[] = [...(options.global?.plugins ?? [])];
  if (activePinia) plugins.push(activePinia);

  return mount(component, {
    ...options,
    global: {
      ...(options.global ?? {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plugins: plugins as any,
    },
  });
}
