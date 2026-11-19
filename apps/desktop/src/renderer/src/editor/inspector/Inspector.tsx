import clsx from 'clsx';
import { Captions, Crop, Image, Keyboard, MousePointer2, Search, Video, Volume2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEnv } from '../context';
import { useEditor, type InspectorTab } from '../store';
import { BackgroundPanel } from './BackgroundPanel';
import { PanelHeader } from './common';
import { Presets } from './Presets';
import { SelectionPanel } from './SelectionPanel';
import { AudioPanel, CameraPanel, CaptionsPanel, CursorPanel, FramePanel, KeysPanel, ZoomPanel } from './StylePanels';

const TABS: { id: InspectorTab; label: string; icon: ReactNode; panel: () => ReactNode; needsCamera?: boolean }[] = [
  { id: 'background', label: 'Background', icon: <Image size={17} />, panel: () => <BackgroundPanel /> },
  { id: 'frame', label: 'Frame & crop', icon: <Crop size={17} />, panel: () => <FramePanel /> },
  { id: 'cursor', label: 'Cursor', icon: <MousePointer2 size={17} />, panel: () => <CursorPanel /> },
  { id: 'zoom', label: 'Zoom', icon: <Search size={17} />, panel: () => <ZoomPanel /> },
  { id: 'camera', label: 'Camera', icon: <Video size={17} />, panel: () => <CameraPanel />, needsCamera: true },
  { id: 'audio', label: 'Audio', icon: <Volume2 size={17} />, panel: () => <AudioPanel /> },
  { id: 'keys', label: 'Keyboard', icon: <Keyboard size={17} />, panel: () => <KeysPanel /> },
  { id: 'captions', label: 'Captions', icon: <Captions size={17} />, panel: () => <CaptionsPanel /> },
];

export function Inspector() {
  const env = useEnv();
  const { tab, setTab, selection } = useEditor();
  const hasCamera = !!env.loaded.data.manifest.camera;
  const tabs = TABS.filter((t) => !t.needsCamera || hasCamera);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];

  return (
    <aside className="flex w-[340px] shrink-0 border-l border-line bg-panel">
      <div className="min-w-0 flex-1">
        {selection ? (
          <SelectionPanel selection={selection} />
        ) : (
          <div className="flex h-full flex-col">
            <PanelHeader title={current.label}>
              <Presets />
            </PanelHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">{current.panel()}</div>
          </div>
        )}
      </div>
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-line py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={t.label}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              !selection && current.id === t.id ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-hover hover:text-ink',
            )}
          >
            {t.icon}
          </button>
        ))}
      </nav>
    </aside>
  );
}
