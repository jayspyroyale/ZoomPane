import clsx from 'clsx';
import { ImagePlus } from 'lucide-react';
import type { Background } from '@shared/project';
import { COLOR_PRESETS, GRADIENT_PRESETS, renderBackground, WALLPAPERS } from '@/engine/backgrounds';
import { percent } from '@/lib/format';
import { api } from '@/lib/api';
import { Button, Section, Segmented } from '@/ui/controls';
import { commitEdit, SliderField, useStyleEdit } from './common';

const thumbs = new Map<string, string>();

/** Small rendered previews of the procedural wallpapers (cached for the session). */
function wallpaperThumb(id: string): string {
  let url = thumbs.get(id);
  if (!url) {
    const off = renderBackground({ kind: 'wallpaper', id }, { w: 160, h: 100 }, 0, null);
    const canvas = document.createElement('canvas');
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.getContext('2d')!.drawImage(off, 0, 0);
    url = canvas.toDataURL('image/jpeg', 0.85);
    thumbs.set(id, url);
  }
  return url;
}

function Swatch({ active, onClick, style, title, children }: { active: boolean; onClick: () => void; style?: React.CSSProperties; title?: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={style}
      className={clsx('aspect-[16/10] overflow-hidden rounded-lg bg-cover bg-center ring-offset-2 ring-offset-panel transition', active ? 'ring-2 ring-accent' : 'ring-1 ring-line hover:ring-muted')}
    >
      {children}
    </button>
  );
}

export function BackgroundPanel() {
  const { style, set } = useStyleEdit();
  const bg = style.background;
  const setBg = (background: Background) => set({ background });

  const pickImage = async () => {
    const path = await api.files.pickImage();
    if (path) setBg({ kind: 'image', path });
  };

  return (
    <>
      <Section title="Background">
        <Segmented
          size="sm"
          value={bg.kind}
          onChange={(kind) => {
            if (kind === 'wallpaper') setBg({ kind, id: WALLPAPERS[0].id });
            if (kind === 'gradient') setBg({ kind, ...GRADIENT_PRESETS[0] });
            if (kind === 'color') setBg({ kind, color: COLOR_PRESETS[0] });
            if (kind === 'image') void pickImage();
          }}
          options={[
            { value: 'wallpaper', label: 'Wallpaper' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'color', label: 'Color' },
            { value: 'image', label: 'Image' },
          ]}
        />

        {bg.kind === 'wallpaper' && (
          <div className="grid grid-cols-3 gap-2">
            {WALLPAPERS.map((w) => (
              <Swatch key={w.id} title={w.name} active={bg.id === w.id} onClick={() => setBg({ kind: 'wallpaper', id: w.id })} style={{ backgroundImage: `url(${wallpaperThumb(w.id)})` }} />
            ))}
          </div>
        )}

        {bg.kind === 'gradient' && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {GRADIENT_PRESETS.map((g) => (
                <Swatch
                  key={g.from + g.to}
                  active={bg.from === g.from && bg.to === g.to}
                  onClick={() => setBg({ kind: 'gradient', ...g })}
                  style={{ background: `linear-gradient(${g.angle}deg, ${g.from}, ${g.to})` }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <ColorInput value={bg.from} onChange={(from) => set({ background: { ...bg, from } }, true)} />
              <ColorInput value={bg.to} onChange={(to) => set({ background: { ...bg, to } }, true)} />
            </div>
            <SliderField label="Angle" value={bg.angle} min={0} max={360} step={1} format={(v) => `${v}°`} onChange={(angle) => set({ background: { ...bg, angle } }, true)} />
          </>
        )}

        {bg.kind === 'color' && (
          <div className="grid grid-cols-6 gap-2">
            {COLOR_PRESETS.map((c) => (
              <Swatch key={c} active={bg.color === c} onClick={() => setBg({ kind: 'color', color: c })} style={{ background: c }} />
            ))}
            <ColorInput value={bg.color} onChange={(color) => set({ background: { kind: 'color', color } }, true)} />
          </div>
        )}

        {bg.kind === 'image' && (
          <div className="space-y-2">
            <div className="truncate text-xs text-muted" title={bg.path}>
              {bg.path.split(/[\\/]/).pop()}
            </div>
            <Button size="sm" onClick={pickImage}>
              <ImagePlus size={14} /> Choose image…
            </Button>
          </div>
        )}

        <SliderField label="Blur" value={style.backgroundBlur} min={0} max={40} step={1} format={(v) => `${v}`} onChange={(backgroundBlur) => set({ backgroundBlur }, true)} />
      </Section>
      <Section title="Shadow">
        <SliderField label="Strength" value={style.shadow} min={0} max={1} format={percent} onChange={(shadow) => set({ shadow }, true)} />
      </Section>
    </>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-raised px-2 text-xs text-muted ring-1 ring-line">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} onBlur={commitEdit} className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0" />
      {value}
    </label>
  );
}
