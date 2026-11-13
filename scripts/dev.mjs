#!/usr/bin/env node
/**
 * 同时启动 Vite 开发服务器与 Hono API，任一退出即整体退出。
 * 直接调用 node 执行本地 CLI，避免 shell 拼接参数带来的告警。
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const tsxCli = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

const commands = {
  api: existsSync(tsxCli)
    ? { label: 'api', command: process.execPath, args: [tsxCli, 'watch', 'server/index.ts'] }
    : { label: 'api', command: npmCmd, args: ['run', 'dev:api'] },
  web: existsSync(viteCli)
    ? { label: 'web', command: process.execPath, args: [viteCli] }
    : { label: 'web', command: npmCmd, args: ['run', 'dev:web'] },
};

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) child.kill();
  }

  process.exit(code);
}

function run({ label, command, args }) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.log(`\n[miniblog] ${label} 进程退出（code=${code ?? 0}），正在关闭其余进程…`);
    shutdown(code ?? 0);
  });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run(commands.api);
run(commands.web);
