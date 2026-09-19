import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const childProcesses = [];
let shuttingDown = false;

function terminate(code = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of childProcesses) {
    child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 250);
}

function run(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  childProcesses.push(child);
  child.on('error', (error) => {
    console.error(`[${name}] could not start: ${error.message}`);
    terminate(1);
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[${name}] exited from signal ${signal}`);
      terminate(1);
      return;
    }

    console.error(`[${name}] exited with code ${code}`);
    terminate(code ?? 1);
  });
}

const nodeBin = process.execPath;
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

run('ws', nodeBin, ['server/ws-lobby-server.mjs']);
run('vite', nodeBin, [viteBin, '--host', '0.0.0.0']);

process.on('SIGINT', () => terminate(0));
process.on('SIGTERM', () => terminate(0));
