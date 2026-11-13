import { serve } from '@hono/node-server';
import { createApp } from './app';

const DEFAULT_PORT = 8787;
const parsedPort = Number(process.env.PORT ?? DEFAULT_PORT);
const port =
  Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : DEFAULT_PORT;

const server = serve({ fetch: createApp().fetch, port, hostname: '127.0.0.1' }, (info) => {
  console.log(`[miniblog] API 已启动：http://127.0.0.1:${info.port}`);
});

function shutdown(signal: string): void {
  console.log(`[miniblog] 收到 ${signal}，正在关闭 API 服务…`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
