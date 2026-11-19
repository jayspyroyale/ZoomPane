import { app } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'node:util';

/** Minimal file + console logger (userData/logs/main.log); attach the file to bug reports. */
function write(level: string, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${format(...args)}`;
  if (level === 'error') console.error(line);
  else console.log(line);
  try {
    const dir = join(app.getPath('userData'), 'logs');
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, 'main.log'), line + '\n');
  } catch {
    // Logging must never crash the app.
  }
}

const log = {
  info: (...args: unknown[]) => write('info', args),
  warn: (...args: unknown[]) => write('warn', args),
  error: (...args: unknown[]) => write('error', args),
};

export default log;
