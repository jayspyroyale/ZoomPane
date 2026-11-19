import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Kbd } from '@/ui/controls';
import { COMMANDS, type Command } from './commands';
import { useEnv } from './context';
import { useEditor } from './store';

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 pt-24 backdrop-blur-sm" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>
  );
}

/** Ctrl+K: search and run any editor command. */
export function CommandMenu() {
  const env = useEnv();
  const setDialog = useEditor((s) => s.setDialog);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return COMMANDS.filter((c) => c.id !== 'commands' && words.every((w) => `${c.title} ${c.section}`.toLowerCase().includes(w)));
  }, [query]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    setDialog(null);
    command.run(env);
  };

  return (
    <Overlay onClose={() => setDialog(null)}>
      <div className="w-[520px] overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-line">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-muted" />
          <input
            autoFocus
            value={query}
            placeholder="Type a command…"
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
              else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
              else if (e.key === 'Enter') run(results[active]);
              else if (e.key === 'Escape') setDialog(null);
              else return;
              e.preventDefault();
            }}
            className="h-12 flex-1 bg-transparent outline-none select-text"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {results.length === 0 && <div className="px-3 py-6 text-center text-muted">No matching commands</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onPointerMove={() => setActive(i)}
              onClick={() => run(c)}
              className={clsx('flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left', i === active && 'bg-hover')}
            >
              <span className="flex-1">{c.title}</span>
              <span className="text-xs text-faint">{c.section}</span>
              {c.keys && <Kbd>{c.keys}</Kbd>}
            </button>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

/** Ctrl+/: every keyboard shortcut, grouped. */
export function ShortcutsSheet() {
  const setDialog = useEditor((s) => s.setDialog);
  const sections = [...new Set(COMMANDS.map((c) => c.section))];
  return (
    <Overlay onClose={() => setDialog(null)}>
      <div className="w-[640px] rounded-2xl bg-panel shadow-2xl ring-1 ring-line">
        <div className="flex h-12 items-center justify-between border-b border-line px-5">
          <h2 className="font-semibold">Keyboard shortcuts</h2>
          <button type="button" aria-label="Close" className="text-muted hover:text-ink" onClick={() => setDialog(null)}>
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5 p-5">
          {sections.map((section) => (
            <div key={section}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{section}</h3>
              {COMMANDS.filter((c) => c.section === section && c.keys).map((c) => (
                <div key={c.id} className="flex h-7 items-center justify-between">
                  <span>{c.title}</span>
                  <Kbd>{c.keys}</Kbd>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}
