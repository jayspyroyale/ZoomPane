import { createContext, useContext } from 'react';
import type { SceneBuilder } from '@/engine/render';
import type { LoadedRecording } from './loadRecording';
import type { Player } from './player';
import { useEditor } from './store';

/** Long-lived objects of an open editor window, shared by its components. */
export interface EditorEnv {
  loaded: LoadedRecording;
  player: Player;
  /** Scene builder for the preview resolution (keeps its caches between edits). */
  builder: SceneBuilder;
  watermark: boolean;
}

export const EditorContext = createContext<EditorEnv | null>(null);

export function useEnv(): EditorEnv {
  const env = useContext(EditorContext);
  if (!env) throw new Error('EditorContext missing');
  return env;
}

/** Moves the playhead (OUTPUT time) and the player together. */
export function seek(env: EditorEnv, outputMs: number): void {
  env.player.seekOutput(outputMs);
  useEditor.getState().setPlayhead(env.player.outputTime);
}
