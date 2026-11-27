// Re-run the pnpm that started this script (`npm_execpath`), so root scripts work when pnpm is
// only reachable through corepack (no global `pnpm` on PATH). Exits with the child's exit code.
import { spawnSync } from 'node:child_process';

const execPath = process.env.npm_execpath;
const [cmd, pre] = execPath && /\.[cm]?js$/.test(execPath) ? [process.execPath, [execPath]] : [execPath || 'pnpm', []];
const r = spawnSync(cmd, [...pre, ...process.argv.slice(2)], { stdio: 'inherit', shell: !execPath && process.platform === 'win32' });
if (r.error) {
  console.error(`scripts/pnpm.mjs: could not start pnpm (${r.error.message})`);
  process.exit(1);
}
process.exit(r.status ?? 1);
