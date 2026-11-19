import { Minus, Square, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { Logo } from './Logo';

/** Custom frameless title bar with Windows-style caption buttons. */
export function TitleBar({ title, children, maximizable = true }: { title?: ReactNode; children?: ReactNode; maximizable?: boolean }) {
  return (
    <header className="drag flex h-11 shrink-0 items-center gap-3 border-b border-line bg-panel pl-3" onDoubleClick={() => maximizable && api.window.toggleMaximize()}>
      <Logo className="h-5 w-5" />
      <div className="min-w-0 truncate text-[13px] font-medium">{title}</div>
      <div className="no-drag ml-auto flex h-full items-center gap-1">{children}</div>
      <div className="no-drag flex h-full">
        <CaptionButton label="Minimize" onClick={() => api.window.minimize()}>
          <Minus size={15} />
        </CaptionButton>
        {maximizable && (
          <CaptionButton label="Maximize" onClick={() => api.window.toggleMaximize()}>
            <Square size={12} />
          </CaptionButton>
        )}
        <CaptionButton label="Close" danger onClick={() => api.window.close()}>
          <X size={16} />
        </CaptionButton>
      </div>
    </header>
  );
}

function CaptionButton({ label, onClick, children, danger }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`flex h-full w-11 items-center justify-center text-muted transition-colors ${danger ? 'hover:bg-[#c42b1c] hover:text-white' : 'hover:bg-hover hover:text-ink'}`}
    >
      {children}
    </button>
  );
}
