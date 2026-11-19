import clsx from 'clsx';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <button
      type="button"
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' && 'h-7 px-2.5 text-xs',
        size === 'md' && 'h-9 px-3.5',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        variant === 'primary' && 'bg-accent text-white hover:bg-accent-hover',
        variant === 'secondary' && 'bg-raised text-ink ring-1 ring-line hover:bg-hover',
        variant === 'ghost' && 'text-muted hover:bg-hover hover:text-ink',
        variant === 'danger' && 'bg-danger/15 text-danger hover:bg-danger/25',
        className,
      )}
    />
  );
}

export function IconButton({
  label,
  active,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={clsx(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
        active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-ink',
        className,
      )}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx('relative h-5 w-9 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line')}
    >
      <span className={clsx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 0.01,
  onChange,
  onCommit,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Called once when the drag ends (for undo history). */
  onCommit?: () => void;
  format?: (value: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--color-accent)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        style={{ background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-line) ${pct}%)` }}
      />
      {format && <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{format(value)}</span>}
    </div>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = 'md',
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex rounded-lg bg-canvas p-0.5 ring-1 ring-line">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5',
            o.value === value ? 'bg-raised text-ink shadow ring-1 ring-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={clsx('h-8 rounded-lg bg-raised px-2 ring-1 ring-line outline-none hover:bg-hover', className)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-panel">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, hint, children, inline }: { label: string; hint?: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={clsx(inline ? 'flex items-center justify-between gap-4' : 'space-y-2')}>
      <div>
        <div className="text-[13px] text-ink">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-line px-4 py-4 last:border-b-0">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md bg-raised px-1.5 py-0.5 font-sans text-[11px] text-muted ring-1 ring-line">{children}</kbd>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent', className)} />;
}
