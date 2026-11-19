import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import log from './log';
import { paths } from './paths';

interface Reply {
  id: number;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/**
 * JSON-lines RPC client for the native capture sidecar (zoompane-capture.exe).
 * The process starts lazily and restarts on the next call if it exits.
 */
class Sidecar {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  private ensure(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    const child = spawn(paths.sidecar, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    createInterface({ input: child.stdout }).on('line', (line) => this.onLine(line));
    createInterface({ input: child.stderr }).on('line', (line) => log.warn('[capture]', line));
    child.on('exit', (code) => {
      log.info('[capture] exited', code);
      this.child = null;
      for (const p of this.pending.values()) p.reject(new Error('Capture engine stopped unexpectedly'));
      this.pending.clear();
    });
    child.on('error', (error) => log.error('[capture] failed to start', error));
    this.child = child;
    return child;
  }

  private onLine(line: string): void {
    let reply: Reply;
    try {
      reply = JSON.parse(line) as Reply;
    } catch {
      log.warn('[capture] bad line', line);
      return;
    }
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    this.pending.delete(reply.id);
    if (reply.ok) pending.resolve(reply.result);
    else pending.reject(new Error(reply.error ?? 'Capture engine error'));
  }

  call<T = unknown>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
    const child = this.ensure();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      child.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n');
    });
  }

  /** Closing stdin makes the sidecar finish any recording and exit cleanly. */
  dispose(): void {
    this.child?.stdin.end();
  }
}

export const sidecar = new Sidecar();
