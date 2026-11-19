import { api } from '@/lib/api';
import { addLayout, addMask, addZoom, copyFrame, deleteSelection, regenerateAutoZooms, speedUpTyping, splitAtPlayhead } from './actions';
import { seek, type EditorEnv } from './context';
import { useEditor } from './store';

/** One editor command, used by the keyboard handler, the command menu and the shortcuts sheet. */
export interface Command {
  id: string;
  title: string;
  section: 'Playback' | 'Edit' | 'Add' | 'View' | 'File';
  /** Display form, e.g. "Ctrl+Z". */
  keys?: string;
  /** Matches a keydown event. */
  match?: (e: KeyboardEvent) => boolean;
  run: (env: EditorEnv) => void;
}

const FRAME_MS = 1000 / 60;
const state = () => useEditor.getState();
const plain = (key: string) => (e: KeyboardEvent) => !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === key;
const ctrl = (key: string, shift = false) => (e: KeyboardEvent) => e.ctrlKey && e.shiftKey === shift && e.key.toLowerCase() === key;

export const COMMANDS: Command[] = [
  { id: 'play', title: 'Play / pause', section: 'Playback', keys: 'Space', match: (e) => e.code === 'Space' && !e.ctrlKey, run: (env) => env.player.toggle() },
  { id: 'back', title: 'Previous frame', section: 'Playback', keys: '←', match: (e) => e.key === 'ArrowLeft' && !e.shiftKey, run: (env) => seek(env, state().playhead - FRAME_MS) },
  { id: 'forward', title: 'Next frame', section: 'Playback', keys: '→', match: (e) => e.key === 'ArrowRight' && !e.shiftKey, run: (env) => seek(env, state().playhead + FRAME_MS) },
  { id: 'back-1s', title: 'Back 1 second', section: 'Playback', keys: 'Shift+←', match: (e) => e.key === 'ArrowLeft' && e.shiftKey, run: (env) => seek(env, state().playhead - 1000) },
  { id: 'forward-1s', title: 'Forward 1 second', section: 'Playback', keys: 'Shift+→', match: (e) => e.key === 'ArrowRight' && e.shiftKey, run: (env) => seek(env, state().playhead + 1000) },
  { id: 'start', title: 'Go to start', section: 'Playback', keys: 'Home', match: (e) => e.key === 'Home', run: (env) => seek(env, 0) },
  { id: 'end', title: 'Go to end', section: 'Playback', keys: 'End', match: (e) => e.key === 'End', run: (env) => seek(env, env.player.duration) },

  { id: 'undo', title: 'Undo', section: 'Edit', keys: 'Ctrl+Z', match: ctrl('z'), run: () => state().undo() },
  { id: 'redo', title: 'Redo', section: 'Edit', keys: 'Ctrl+Shift+Z', match: (e) => ctrl('z', true)(e) || ctrl('y')(e), run: () => state().redo() },
  { id: 'split', title: 'Split clip at playhead', section: 'Edit', keys: 'S', match: plain('s'), run: splitAtPlayhead },
  { id: 'delete', title: 'Delete selected item', section: 'Edit', keys: 'Delete', match: (e) => e.key === 'Delete' || e.key === 'Backspace', run: () => deleteSelection() },
  { id: 'deselect', title: 'Deselect', section: 'Edit', keys: 'Esc', match: (e) => e.key === 'Escape', run: () => state().select(null) },
  { id: 'speed-typing', title: 'Speed up typing', section: 'Edit', run: (env) => void speedUpTyping(env) },
  { id: 'regenerate-zooms', title: 'Regenerate automatic zooms', section: 'Edit', run: regenerateAutoZooms },

  { id: 'add-zoom', title: 'Add zoom', section: 'Add', keys: 'Z', match: plain('z'), run: addZoom },
  { id: 'add-mask', title: 'Add blur mask', section: 'Add', keys: 'M', match: plain('m'), run: (env) => addMask(env, 'blur') },
  { id: 'add-highlight', title: 'Add highlight', section: 'Add', keys: 'H', match: plain('h'), run: (env) => addMask(env, 'highlight') },
  { id: 'add-layout', title: 'Add camera layout', section: 'Add', keys: 'L', match: plain('l'), run: (env) => env.loaded.data.manifest.camera && addLayout(env) },

  { id: 'timeline-in', title: 'Zoom timeline in', section: 'View', keys: 'Ctrl+=', match: (e) => e.ctrlKey && (e.key === '=' || e.key === '+'), run: () => state().setPxPerSecond(state().pxPerSecond * 1.4) },
  { id: 'timeline-out', title: 'Zoom timeline out', section: 'View', keys: 'Ctrl+-', match: ctrl('-'), run: () => state().setPxPerSecond(state().pxPerSecond / 1.4) },
  { id: 'commands', title: 'Command menu', section: 'View', keys: 'Ctrl+K', match: ctrl('k'), run: () => state().setDialog('commands') },
  { id: 'shortcuts', title: 'Keyboard shortcuts', section: 'View', keys: 'Ctrl+/', match: ctrl('/'), run: () => state().setDialog('shortcuts') },

  { id: 'export', title: 'Export…', section: 'File', keys: 'Ctrl+E', match: ctrl('e'), run: () => state().setDialog('export') },
  { id: 'copy-frame', title: 'Copy current frame as image', section: 'File', keys: 'Ctrl+Shift+C', match: ctrl('c', true), run: (env) => void copyFrame(env) },
  { id: 'new-recording', title: 'New recording', section: 'File', keys: 'Ctrl+N', match: ctrl('n'), run: () => void api.app.openLauncher() },
];

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/** Runs the command for a keydown, unless focus is in a text field or a dialog is open. */
export function handleKeyDown(env: EditorEnv, e: KeyboardEvent): void {
  if (e.repeat && !e.key.startsWith('Arrow')) return;
  if (isTyping(e.target)) return;
  const dialog = state().dialog;
  if (dialog) {
    if (e.key === 'Escape') state().setDialog(null);
    return;
  }
  const command = COMMANDS.find((c) => c.match?.(e));
  if (!command) return;
  e.preventDefault();
  command.run(env);
}
