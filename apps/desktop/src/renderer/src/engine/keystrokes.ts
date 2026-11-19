import type { KeyPress } from './input';

const DISPLAY_MS = 1300;
const TYPING_GAP_MS = 350;
const BURST_GAP_MS = 700;
const MIN_BURST_KEYS = 8;

const MODIFIERS: Record<number, 'Ctrl' | 'Shift' | 'Alt' | 'Win'> = {
  0x10: 'Shift', 0xa0: 'Shift', 0xa1: 'Shift',
  0x11: 'Ctrl', 0xa2: 'Ctrl', 0xa3: 'Ctrl',
  0x12: 'Alt', 0xa4: 'Alt', 0xa5: 'Alt',
  0x5b: 'Win', 0x5c: 'Win',
};
const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Win'] as const;

const NAMED_KEYS: Record<number, string> = {
  0x08: 'Backspace', 0x09: 'Tab', 0x0d: 'Enter', 0x13: 'Pause', 0x14: 'Caps Lock', 0x1b: 'Esc',
  0x20: 'Space', 0x21: 'Page Up', 0x22: 'Page Down', 0x23: 'End', 0x24: 'Home',
  0x25: '←', 0x26: '↑', 0x27: '→', 0x28: '↓', 0x2c: 'Print Screen', 0x2d: 'Insert', 0x2e: 'Delete',
  0x6a: '*', 0x6b: '+', 0x6d: '-', 0x6e: '.', 0x6f: '/',
  0xba: ';', 0xbb: '=', 0xbc: ',', 0xbd: '-', 0xbe: '.', 0xbf: '/', 0xc0: '`',
  0xdb: '[', 0xdc: '\\', 0xdd: ']', 0xde: "'",
};

/** Keys worth showing on their own even without a modifier. */
const STANDALONE = new Set([0x08, 0x09, 0x0d, 0x1b, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2e]);

export function keyName(vk: number): string {
  if (NAMED_KEYS[vk]) return NAMED_KEYS[vk];
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk);
  if (vk >= 0x60 && vk <= 0x69) return `Num ${vk - 0x60}`;
  if (vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6f}`;
  return `Key ${vk}`;
}

export interface Keystroke {
  /** Stable id `k<sourceMs>` used to hide individual shortcuts. */
  id: string;
  start: number;
  end: number;
  keys: string[];
  /** True for a modifier combination (Ctrl+C), false for a single key. */
  isShortcut: boolean;
}

/** Turns raw key events into displayable keystrokes, skipping ordinary typing. */
export function detectKeystrokes(keys: KeyPress[], showSingleKeys: boolean): Keystroke[] {
  const held = new Set<string>();
  const presses: { t: number; vk: number; mods: string[] }[] = [];
  for (const k of keys) {
    const mod = MODIFIERS[k.vk];
    if (mod) {
      if (k.down) held.add(mod);
      else held.delete(mod);
      continue;
    }
    if (k.down) presses.push({ t: k.t, vk: k.vk, mods: MODIFIER_ORDER.filter((m) => held.has(m)) });
  }

  const result: Keystroke[] = [];
  presses.forEach((p, i) => {
    // Ctrl/Alt/Win make a shortcut; Shift alone is just capitalisation.
    const isShortcut = p.mods.some((m) => m !== 'Shift');
    if (!isShortcut) {
      if (!showSingleKeys || !STANDALONE.has(p.vk)) return;
      const prev = presses[i - 1];
      const next = presses[i + 1];
      const typing = (prev && p.t - prev.t < TYPING_GAP_MS) || (next && next.t - p.t < TYPING_GAP_MS);
      if (typing) return;
    }
    const last = result[result.length - 1];
    if (last && last.end > p.t) last.end = p.t;
    result.push({ id: `k${Math.round(p.t)}`, start: p.t, end: p.t + DISPLAY_MS, keys: [...p.mods, keyName(p.vk)], isShortcut });
  });
  return result;
}

/** Finds stretches of continuous typing, which "Speed up typing" plays faster. */
export function detectTypingBursts(keys: KeyPress[]): { start: number; end: number }[] {
  const presses = keys.filter((k) => k.down && !MODIFIERS[k.vk]).map((k) => k.t);
  const bursts: { start: number; end: number }[] = [];
  let begin = 0;
  for (let i = 1; i <= presses.length; i++) {
    if (i === presses.length || presses[i] - presses[i - 1] > BURST_GAP_MS) {
      if (i - begin >= MIN_BURST_KEYS) bursts.push({ start: presses[begin], end: presses[i - 1] + 150 });
      begin = i;
    }
  }
  return bursts;
}
