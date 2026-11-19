import { newId, type CameraLayout, type MaskSegment, type Project } from '@shared/project';
import { detectTypingBursts } from '@/engine/keystrokes';
import { drawFrame, SceneBuilder } from '@/engine/render';
import { removeClip, speedUpRanges, splitClips, Timeline } from '@/engine/timeline';
import { createZoom, generateAutoZooms } from '@/engine/zoom';
import { api } from '@/lib/api';
import { backgroundImageFor } from './backgroundImage';
import type { EditorEnv } from './context';
import { useEditor } from './store';

/** Edit commands shared by the toolbar, keyboard shortcuts and the command menu. */

const NEW_SEGMENT_MS = 3000;
const TYPING_SPEED = 4;

const state = () => useEditor.getState();
const byStart = <T extends { start: number }>(a: T, b: T) => a.start - b.start;

/** A source-time span of ~3 s of OUTPUT time starting at the playhead. */
function spanAtPlayhead(env: EditorEnv, project: Project): { start: number; end: number } {
  const timeline = new Timeline(project.clips);
  const out = Math.min(env.player.outputTime, Math.max(0, timeline.duration - NEW_SEGMENT_MS));
  return {
    start: timeline.toSource(out).source,
    end: timeline.toSource(Math.min(out + NEW_SEGMENT_MS, timeline.duration)).source,
  };
}

export function splitAtPlayhead(env: EditorEnv): void {
  const t = env.player.sourceTime;
  state().edit((p) => ({ ...p, clips: splitClips(p.clips, t) }));
}

export function addZoom(env: EditorEnv): void {
  const { project } = state();
  if (!project) return;
  const { start, end } = spanAtPlayhead(env, project);
  const zoom = createZoom(start, end, project.style.zoom.defaultLevel);
  state().edit((p) => ({ ...p, zooms: [...p.zooms, zoom].sort(byStart) }));
  state().select({ kind: 'zoom', id: zoom.id });
}

export function addMask(env: EditorEnv, kind: MaskSegment['kind'] = 'blur'): void {
  const { project } = state();
  if (!project) return;
  const mask: MaskSegment = { id: newId('m'), ...spanAtPlayhead(env, project), kind, rect: { x: 0.35, y: 0.35, w: 0.3, h: 0.3 }, strength: 0.6 };
  state().edit((p) => ({ ...p, masks: [...p.masks, mask].sort(byStart) }));
  state().select({ kind: 'mask', id: mask.id });
}

export function addLayout(env: EditorEnv, layout: CameraLayout = 'fullscreen'): void {
  const { project } = state();
  if (!project) return;
  const segment = { id: newId('l'), ...spanAtPlayhead(env, project), layout };
  state().edit((p) => ({ ...p, layouts: [...p.layouts, segment].sort(byStart) }));
  state().select({ kind: 'layout', id: segment.id });
}

export function addCaption(env: EditorEnv): void {
  const { project } = state();
  if (!project) return;
  const caption = { id: newId('t'), ...spanAtPlayhead(env, project), text: 'New caption' };
  state().edit((p) => ({ ...p, captions: [...p.captions, caption].sort(byStart), style: { ...p.style, captions: { ...p.style.captions, enabled: true } } }));
  state().select({ kind: 'caption', id: caption.id });
}

export function deleteSelection(): void {
  const { selection } = state();
  if (!selection) return;
  const { id } = selection;
  state().edit((p) => {
    switch (selection.kind) {
      case 'clip':
        return { ...p, clips: removeClip(p.clips, id) };
      case 'zoom':
        return { ...p, zooms: p.zooms.filter((z) => z.id !== id) };
      case 'layout':
        return { ...p, layouts: p.layouts.filter((l) => l.id !== id) };
      case 'mask':
        return { ...p, masks: p.masks.filter((m) => m.id !== id) };
      case 'caption':
        return { ...p, captions: p.captions.filter((c) => c.id !== id) };
    }
  });
  state().select(null);
}

/** Plays every stretch of continuous typing at 4×. Returns how many stretches were found. */
export function speedUpTyping(env: EditorEnv): number {
  const bursts = detectTypingBursts(env.loaded.data.input.keys);
  if (bursts.length) state().edit((p) => ({ ...p, clips: speedUpRanges(p.clips, bursts, TYPING_SPEED) }));
  return bursts.length;
}

/** Replaces the automatic zooms with freshly detected ones; manual zooms are kept. */
export function regenerateAutoZooms(env: EditorEnv): void {
  const { data } = env.loaded;
  state().edit((p) => ({
    ...p,
    zooms: [...p.zooms.filter((z) => z.mode === 'manual'), ...generateAutoZooms(data.input.clicks, data.durationMs, p.style.zoom.defaultLevel)].sort(byStart),
  }));
}

export function removeAllZooms(): void {
  state().edit((p) => ({ ...p, zooms: [] }));
}

/** Renders the current frame at export resolution as a PNG data URL. */
export async function renderStill(env: EditorEnv): Promise<string> {
  const { project } = state();
  if (!project) throw new Error('No project');
  const settings = await api.settings.get();
  const scene = new SceneBuilder(env.loaded.data).build(project, {
    resolution: settings.export.resolution,
    fps: settings.export.fps,
    backgroundImage: await backgroundImageFor(project),
  });
  const canvas = new OffscreenCanvas(scene.output.w, scene.output.h);
  drawFrame(canvas.getContext('2d')!, scene, env.player.sourceTime, { screen: env.player.screen, camera: env.player.camera });
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function copyFrame(env: EditorEnv): Promise<void> {
  await api.exporter.copyImage(await renderStill(env));
}
