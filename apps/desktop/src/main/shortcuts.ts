import { globalShortcut } from 'electron';
import type { Shortcuts } from '@shared/api';
import log from './log';
import { recorder } from './recorder';

/** Registers the global recording shortcuts; call again whenever settings change. */
export function registerShortcuts(shortcuts: Shortcuts): void {
  globalShortcut.unregisterAll();
  const bindings: [string, () => Promise<void>][] = [
    [shortcuts.toggleRecording, () => recorder.toggle()],
    [shortcuts.togglePause, () => recorder.togglePause()],
    [shortcuts.cancelRecording, () => recorder.cancel()],
  ];
  for (const [accelerator, action] of bindings) {
    if (!accelerator) continue;
    try {
      if (!globalShortcut.register(accelerator, () => void action())) log.warn('shortcut in use', accelerator);
    } catch (error) {
      log.warn('invalid shortcut', accelerator, error);
    }
  }
}
