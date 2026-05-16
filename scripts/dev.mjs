#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '3000';
const TERMINATION_WAIT_MS = 2500;

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
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

    if (
      arg.startsWith('--port=') ||
      arg.startsWith('--host=') ||
      arg === '--strictPort' ||
      arg === '--no-open'
    ) {
      continue;
    }

    cleanedArgs.push(arg);
  }

  return cleanedArgs;
};

const host = readOption(rawArgs, 'host') || process.env.HOST || DEFAULT_HOST;
const port = readOption(rawArgs, 'port') || process.env.PORT || DEFAULT_PORT;
const shouldOpenBrowser = !rawArgs.includes('--no-open');
const passthroughArgs = stripManagedOptions(rawArgs);

const execFileText = (command, args) =>
  new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(stdout);
    });
  });

const getPortPids = async () => {
  try {
    if (process.platform === 'win32') {
      const output = await execFileText('netstat', ['-ano', '-p', 'tcp']);
      return Array.from(
        new Set(
          output
            .split('\n')
            .filter((line) => line.includes(`:${port}`) && line.includes('LISTENING'))
            .map((line) => line.trim().split(/\s+/).at(-1))
            .filter(Boolean),
        ),
      );
    }

    const output = await execFileText('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
    return Array.from(new Set(output.split(/\s+/).filter(Boolean)));
  } catch {
    return [];
  }
};

const waitUntilPortIsFree = async () => {
  const deadline = Date.now() + TERMINATION_WAIT_MS;

  while (Date.now() < deadline) {
    const pids = await getPortPids();
    if (pids.length === 0) {
      return true;
    }

    await delay(100);
  }

  return false;
};

const stopProcessesOnPort = async () => {
  const pids = (await getPortPids()).filter((pid) => Number(pid) !== process.pid);

  if (pids.length === 0) {
    console.log(`[dev] Port ${port} is available.`);
    return;
  }

  console.log(`[dev] Port ${port} is in use by PID(s): ${pids.join(', ')}`);
  console.log('[dev] Stopping existing process before starting Vite...');

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // The process may already have exited between lookup and termination.
    }
  }

  if (await waitUntilPortIsFree()) {
    return;
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL');
    } catch {
      // Nothing else to do if the process already exited or cannot be killed.
    }
  }
};

await stopProcessesOnPort();

const viteArgs = [
  viteBin,
  '--host',
  host,
  '--port',
  port,
  '--strictPort',
  ...(shouldOpenBrowser ? ['--open', '/'] : []),
  ...passthroughArgs,
];

console.log(`[dev] Starting Vite at http://${host}:${port}/`);

const child = spawn(process.execPath, viteArgs, {
  env: {
    ...process.env,
    HOST: host,
    PORT: port,
  },
  stdio: 'inherit',
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
