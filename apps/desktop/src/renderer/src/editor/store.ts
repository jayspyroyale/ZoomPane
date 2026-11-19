import { create } from 'zustand';
import type { Project } from '@shared/project';

const HISTORY_LIMIT = 200;

export type Selection =
  | { kind: 'clip'; id: string }
  | { kind: 'zoom'; id: string }
  | { kind: 'layout'; id: string }
  | { kind: 'mask'; id: string }
  | { kind: 'caption'; id: string }
  | null;

export type InspectorTab = 'background' | 'frame' | 'cursor' | 'zoom' | 'camera' | 'audio' | 'keys' | 'captions';

export type Dialog = 'export' | 'commands' | 'shortcuts' | null;

interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  /** Snapshot taken before a continuous edit (slider drag) began; committed as one undo step. */
  pending: Project | null;
  dirty: boolean;
  selection: Selection;
  tab: InspectorTab;
  /** Playhead in OUTPUT time (ms). */
  playhead: number;
  playing: boolean;
  /** Timeline zoom: px per second. */
  pxPerSecond: number;
  dialog: Dialog;

  load(project: Project): void;
  /** Applies an edit as one undo step. */
  edit(recipe: (p: Project) => Project): void;
  /** Applies an edit while dragging; call {@link commit} when the gesture ends. */
  preview(recipe: (p: Project) => Project): void;
  commit(): void;
  undo(): void;
  redo(): void;
  markSaved(): void;
  select(selection: Selection): void;
  setTab(tab: InspectorTab): void;
  setPlayhead(ms: number): void;
  setPlaying(playing: boolean): void;
  setPxPerSecond(value: number): void;
  setDialog(dialog: Dialog): void;
}

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  past: [],
  future: [],
  pending: null,
  dirty: false,
  selection: null,
  tab: 'background',
  playhead: 0,
  playing: false,
  pxPerSecond: 60,
  dialog: null,

  load: (project) => set({ project, past: [], future: [], pending: null, dirty: false, selection: null, playhead: 0 }),

  edit: (recipe) => {
    const { project, past, pending } = get();
    if (!project) return;
    const base = pending ?? project;
    set({ project: touch(recipe(project)), past: [...past, base].slice(-HISTORY_LIMIT), future: [], pending: null, dirty: true });
  },

  preview: (recipe) => {
    const { project, pending } = get();
    if (!project) return;
    set({ project: recipe(project), pending: pending ?? project, dirty: true });
  },

  commit: () => {
    const { project, pending, past } = get();
    if (!project || !pending) return;
    set({ project: touch(project), past: [...past, pending].slice(-HISTORY_LIMIT), future: [], pending: null });
  },

  undo: () => {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], pending: null, dirty: true });
  },

  redo: () => {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    set({ project: future[0], past: [...past, project], future: future.slice(1), pending: null, dirty: true });
  },

  markSaved: () => set({ dirty: false }),
  select: (selection) => set({ selection }),
  setTab: (tab) => set({ tab, selection: null }),
  setPlayhead: (playhead) => set({ playhead }),
  setPlaying: (playing) => set({ playing }),
  setPxPerSecond: (pxPerSecond) => set({ pxPerSecond: Math.min(Math.max(pxPerSecond, 8), 600) }),
  setDialog: (dialog) => set({ dialog }),
}));

/** Convenience for components that only render once a project is loaded. */
export function useProject(): Project {
  const project = useEditor((s) => s.project);
  if (!project) throw new Error('Project not loaded');
  return project;
}
