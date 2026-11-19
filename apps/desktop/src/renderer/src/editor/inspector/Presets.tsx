import { Check, ChevronDown, Plus, Star, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { newId, type Preset } from '@shared/project';
import { useSettings } from '@/lib/hooks';
import { useEditor } from '../store';

/** Saved looks: apply one, save the current style, or pick the default for new recordings. */
export function Presets() {
  const [settings, update] = useSettings();
  const edit = useEditor((s) => s.edit);
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  if (!settings) return null;
  const { presets, defaultPresetId } = settings;

  const apply = (preset: Preset) => {
    edit((p) => ({ ...p, style: { ...preset.style, crop: p.style.crop } }));
    setOpen(false);
  };

  const save = () => {
    const name = naming?.trim();
    if (!name) return;
    const { crop: _crop, ...style } = useEditor.getState().project!.style;
    update({ presets: [...presets, { id: newId('preset'), name, style }] });
    setNaming(null);
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-hover hover:text-ink">
        Presets <ChevronDown size={13} />
      </button>
      {open && (
        <div className="absolute top-8 right-0 z-30 w-64 rounded-xl bg-raised p-1.5 shadow-2xl ring-1 ring-line">
          {presets.length === 0 && <div className="px-2 py-2 text-xs text-muted">Save your current look to reuse it on every recording.</div>}
          {presets.map((preset) => (
            <div key={preset.id} className="group flex h-8 items-center gap-1 rounded-lg px-2 hover:bg-hover">
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => apply(preset)}>
                {preset.name}
              </button>
              <button
                type="button"
                title={defaultPresetId === preset.id ? 'Default for new recordings' : 'Use for new recordings'}
                onClick={() => update({ defaultPresetId: defaultPresetId === preset.id ? null : preset.id })}
                className={defaultPresetId === preset.id ? 'text-accent' : 'text-faint opacity-0 group-hover:opacity-100 hover:text-ink'}
              >
                <Star size={13} fill={defaultPresetId === preset.id ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                title="Delete preset"
                onClick={() => update({ presets: presets.filter((p) => p.id !== preset.id), defaultPresetId: defaultPresetId === preset.id ? null : defaultPresetId })}
                className="text-faint opacity-0 group-hover:opacity-100 hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            {naming === null ? (
              <button type="button" onClick={() => setNaming('')} className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-muted hover:bg-hover hover:text-ink">
                <Plus size={14} /> Save current style…
              </button>
            ) : (
              <form
                className="flex items-center gap-1 p-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <input
                  autoFocus
                  value={naming}
                  placeholder="Preset name"
                  onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
                  className="h-7 min-w-0 flex-1 rounded-md bg-canvas px-2 ring-1 ring-line outline-none select-text focus:ring-accent"
                />
                <button type="submit" aria-label="Save preset" className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-white">
                  <Check size={14} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
