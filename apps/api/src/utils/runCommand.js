'use strict';

const { spawn } = require('child_process');

/**
 * Spawns a child process without a shell (no injection surface) and always
 * resolves or rejects: a hung binary is killed after `timeoutMs`.
 */
function runCommand(command, args = [], options = {}) {
  const timeoutMs = options.timeoutMs || 120000;

  return new Promise((resolve, reject) => {
    let child;

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    child.stdout.on('data', (chunk) => {
      // Cap captured output so a chatty binary can't balloon memory.
      if (stdout.length < 64 * 1024) stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      if (stderr.length < 64 * 1024) stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      const error = new Error(`Command timed out after ${timeoutMs}ms: ${command}`);
      error.code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
    timer.unref();

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      // SIGKILL with no timeout of ours almost always means the kernel OOM
      // killer stepped in — worth saying plainly, it is the top failure mode
      // on a 512 MB instance.
      const reason =
        signal === 'SIGKILL'
          ? 'process was killed (most likely out of memory)'
          : stderr.trim() || stdout.trim() || `exit code ${code}`;

      const error = new Error(`${command} failed: ${reason}`);
      error.exitCode = code;
      error.signal = signal;
      error.stderr = stderr;
      reject(error);
    });
  });
}

module.exports = { runCommand };
