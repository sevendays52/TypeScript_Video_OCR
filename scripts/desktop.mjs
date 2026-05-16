#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '3000';
const SERVER_START_TIMEOUT_MS = 20_000;

const require = createRequire(import.meta.url);
const electronBin = require('electron');
const rawArgs = process.argv.slice(2);

const readOption = (args, optionName) => {
  const prefix = `--${optionName}=`;
  const directIndex = args.indexOf(`--${optionName}`);

  if (directIndex !== -1) {
    return args[directIndex + 1];
  }

  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};

const stripManagedOptions = (args) => {
  const cleanedArgs = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--port' || arg === '--host') {
      index += 1;
      continue;
    }

    if (arg.startsWith('--port=') || arg.startsWith('--host=')) {
      continue;
    }

    cleanedArgs.push(arg);
  }

  return cleanedArgs;
};

const host = readOption(rawArgs, 'host') || process.env.HOST || DEFAULT_HOST;
const port = readOption(rawArgs, 'port') || process.env.PORT || DEFAULT_PORT;
const appUrl = `http://${host}:${port}/`;
const passthroughArgs = stripManagedOptions(rawArgs);

const waitForServer = async () => {
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(appUrl);

      if (response.ok) {
        return;
      }
    } catch {
      // Vite is still booting.
    }

    await delay(150);
  }

  throw new Error(`Timed out waiting for Vite at ${appUrl}`);
};

const viteProcess = spawn(
  process.execPath,
  ['scripts/dev.mjs', '--host', host, '--port', port, '--no-open', ...passthroughArgs],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let electronProcess;
let didStartElectron = false;

const waitForViteReady = () =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Vite to report ready at ${appUrl}`));
    }, SERVER_START_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      viteProcess.off('exit', handleExit);
    };

    const handleText = (chunk) => {
      const text = chunk.toString();

      if (text.includes('Local:') || text.includes('ready in')) {
        cleanup();
        resolve();
      }
    };

    const handleExit = (code) => {
      cleanup();
      reject(new Error(`Vite exited before Electron could start. Exit code: ${code ?? 0}`));
    };

    viteProcess.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      handleText(chunk);
    });

    viteProcess.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      handleText(chunk);
    });

    viteProcess.once('exit', handleExit);
  });

const shutdown = () => {
  if (electronProcess && !electronProcess.killed) {
    electronProcess.kill();
  }

  if (!viteProcess.killed) {
    viteProcess.kill();
  }
};

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

try {
  await waitForViteReady();
  await waitForServer();
  console.log(`[desktop] Opening Video OCR Extractor at ${appUrl}`);

  electronProcess = spawn(electronBin, ['electron/main.cjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: appUrl,
    },
    stdio: 'inherit',
  });
  didStartElectron = true;

  electronProcess.on('exit', (code) => {
    shutdown();
    process.exit(code ?? 0);
  });
} catch (error) {
  if (!didStartElectron) {
    console.error(error instanceof Error ? error.message : error);
  }
  shutdown();
  process.exit(1);
}
