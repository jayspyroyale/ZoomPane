import { Trash2, X } from 'lucide-react';
import type { CameraLayout, Project } from '@shared/project';
import { updateClip } from '@/engine/timeline';
import { clampFocus } from '@/engine/zoom';
import { percent } from '@/lib/format';
import { Button, Field, Section, Segmented } from '@/ui/controls';
import { deleteSelection } from '../actions';
import { useEditor, type Selection } from '../store';
import { commitEdit, PanelHeader, SliderField, times, ToggleField } from './common';

const SPEEDS = [0.5, 1, 1.5, 2, 4, 8];
const TITLES = { clip: 'Clip', zoom: 'Zoom', layout: 'Camera layout', mask: 'Mask', caption: 'Caption' } as const;

type Kind = NonNullable<Selection>['kind'];

/** Edits for the selected timeline item. */
export function SelectionPanel({ selection }: { selection: NonNullable<Selection> }) {
  const project = useEditor((s) => s.project!);
  const select = useEditor((s) => s.select);
  const edit = useEditor((s) => s.edit);
  const preview = useEditor((s) => s.preview);
  const apply = (recipe: (p: Project) => Project, live?: boolean) => (live ? preview : edit)(recipe);

  return (
    <div className="flex h-full flex-col">
      <PanelHeader title={TITLES[selection.kind as Kind]}>
        <button type="button" aria-label="Close" className="text-muted hover:text-ink" onClick={() => select(null)}>
          <X size={16} />
        </button>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body selection={selection} project={project} apply={apply} />
        <div className="p-4">
          <Button size="sm" variant="danger" onClick={deleteSelection} disabled={selection.kind === 'clip' && project.clips.length <= 1}>
            <Trash2 size={14} /> {selection.kind === 'clip' ? 'Cut this clip' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Body({ selection, project, apply }: { selection: NonNullable<Selection>; project: Project; apply: (r: (p: Project) => Project, live?: boolean) => void }) {
  const { id } = selection;
  switch (selection.kind) {
    case 'clip': {
      const clip = project.clips.find((c) => c.id === id);
      if (!clip) return null;
      const set = (patch: Partial<typeof clip>, live?: boolean) => apply((p) => ({ ...p, clips: updateClip(p.clips, id, patch) }), live);
      return (
        <Section title="Playback">
          <Field label="Speed">
            <Segmented size="sm" value={clip.speed} onChange={(speed) => set({ speed })} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} />
          </Field>
          <SliderField label="Volume" value={clip.volume} min={0} max={2} format={percent} onChange={(volume) => set({ volume }, true)} />
          <ToggleField label="Mute" checked={clip.volume === 0} onChange={(muted) => set({ volume: muted ? 0 : 1 })} />
          <p className="text-xs text-muted">Split with S at the playhead to change the speed of just one part.</p>
        </Section>
      );
    }
    case 'zoom': {
      const zoom = project.zooms.find((z) => z.id === id);
      if (!zoom) return null;
      const set = (patch: Partial<typeof zoom>, live?: boolean) => apply((p) => ({ ...p, zooms: p.zooms.map((z) => (z.id === id ? { ...z, ...patch } : z)) }), live);
      return (
        <Section title="Zoom">
          <Field label="Mode">
            <Segmented
              size="sm"
              value={zoom.mode}
              onChange={(mode) => set({ mode })}
              options={[
                { value: 'auto', label: 'Follow cursor' },
                { value: 'manual', label: 'Fixed area' },
              ]}
            />
          </Field>
          <SliderField
            label="Zoom level"
            value={zoom.level}
            min={1.1}
            max={5}
            step={0.05}
            format={times}
            onChange={(level) => set({ level, focus: clampFocus(zoom.focus, level) }, true)}
          />
          {zoom.mode === 'manual' && <p className="text-xs text-muted">Drag the box in the preview to choose what to zoom into.</p>}
          <ToggleField label="Instant" hint="Cut in and out without animating" checked={zoom.instant} onChange={(instant) => set({ instant })} />
          <ToggleField label="Enabled" checked={zoom.enabled} onChange={(enabled) => set({ enabled })} />
        </Section>
      );
    }
    case 'layout': {
      const layout = project.layouts.find((l) => l.id === id);
      if (!layout) return null;
      return (
        <Section title="Layout">
          <Segmented<CameraLayout>
            size="sm"
            value={layout.layout}
            onChange={(value) => apply((p) => ({ ...p, layouts: p.layouts.map((l) => (l.id === id ? { ...l, layout: value } : l)) }))}
            options={[
              { value: 'overlay', label: 'Bubble' },
              { value: 'fullscreen', label: 'Full' },
              { value: 'split', label: 'Split' },
              { value: 'hidden', label: 'Hidden' },
            ]}
          />
        </Section>
      );
    }
    case 'mask': {
      const mask = project.masks.find((m) => m.id === id);
      if (!mask) return null;
      const set = (patch: Partial<typeof mask>, live?: boolean) => apply((p) => ({ ...p, masks: p.masks.map((m) => (m.id === id ? { ...m, ...patch } : m)) }), live);
      return (
        <Section title="Mask">
          <Segmented
            size="sm"
            value={mask.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: 'blur', label: 'Blur (hide)' },
              { value: 'highlight', label: 'Highlight' },
            ]}
          />
          <SliderField label={mask.kind === 'blur' ? 'Blur amount' : 'Dim surroundings'} value={mask.strength} min={0} max={1} format={percent} onChange={(strength) => set({ strength }, true)} />
          <p className="text-xs text-muted">Drag the box in the preview to position it.</p>
        </Section>
      );
    }
    case 'caption': {
      const caption = project.captions.find((c) => c.id === id);
      if (!caption) return null;
      return (
        <Section title="Text">
          <textarea
            value={caption.text}
            rows={4}
            onChange={(e) => apply((p) => ({ ...p, captions: p.captions.map((c) => (c.id === id ? { ...c, text: e.target.value } : c)) }), true)}
            onBlur={commitEdit}
            className="w-full resize-none rounded-lg bg-raised p-2 ring-1 ring-line outline-none select-text focus:ring-accent"
          />
        </Section>
      );
    }
  }
}
