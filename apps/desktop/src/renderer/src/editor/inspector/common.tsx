import type { ReactNode } from 'react';
import type { Style } from '@shared/project';
import { Field, Slider, Toggle } from '@/ui/controls';
import { useEditor } from '../store';

/** Style edits: `live` edits (slider drags) are committed as one undo step by {@link commitEdit}. */
export function useStyleEdit(): { style: Style; set: (patch: Partial<Style>, live?: boolean) => void } {
  const style = useEditor((s) => s.project!.style);
  const edit = useEditor((s) => s.edit);
  const preview = useEditor((s) => s.preview);
  return {
    style,
    set: (patch, live) => (live ? preview : edit)((p) => ({ ...p, style: { ...p.style, ...patch } })),
  };
}

export const commitEdit = () => useEditor.getState().commit();

export function SliderField({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label} hint={hint}>
      <Slider value={value} min={min} max={max} step={step} format={format} onChange={onChange} onCommit={commitEdit} />
    </Field>
  );
}

export function ToggleField({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Field label={label} hint={hint} inline>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </Field>
  );
}

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export const px = (v: number) => `${Math.round(v)}px`;
export const times = (v: number) => `${v.toFixed(1)}×`;
