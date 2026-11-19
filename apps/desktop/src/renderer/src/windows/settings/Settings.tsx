import clsx from 'clsx';
import { Bug, Code2, Info, Keyboard, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { REPO_URL, type AppSettings, type Shortcuts, type UpdateStatus } from '@shared/api';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { Button, Field, Toggle } from '@/ui/controls';
import { Logo } from '@/ui/Logo';
import { TitleBar } from '@/ui/TitleBar';

type Tab = 'general' | 'shortcuts' | 'about';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('general');
  const [settings, update] = useSettings();

  return (
    <div className="flex h-full flex-col">
      <TitleBar title="Settings" maximizable={false} />
      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 space-y-0.5 border-r border-line bg-panel p-2">
          <NavItem icon={<Settings2 size={15} />} label="General" active={tab === 'general'} onClick={() => setTab('general')} />
          <NavItem icon={<Keyboard size={15} />} label="Shortcuts" active={tab === 'shortcuts'} onClick={() => setTab('shortcuts')} />
          <NavItem icon={<Info size={15} />} label="About" active={tab === 'about'} onClick={() => setTab('about')} />
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {tab === 'general' && settings && <GeneralPanel settings={settings} update={update} />}
          {tab === 'shortcuts' && settings && <ShortcutsPanel shortcuts={settings.shortcuts} onChange={(shortcuts) => update({ shortcuts })} />}
          {tab === 'about' && <AboutPanel />}
        </main>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={clsx('flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5', active ? 'bg-raised text-ink' : 'text-muted hover:bg-hover hover:text-ink')}>
      {icon}
      {label}
    </button>
  );
}

function AboutPanel() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Logo className="h-10 w-10" />
        <div>
          <div className="font-display text-lg font-semibold">ZoomPane {api.version}</div>
          <div className="text-muted">Free and open-source screen recorder for Windows.</div>
        </div>
      </div>
      <p className="text-muted">
        ZoomPane is released under the MIT License. Every feature is free, with no watermark, account or upload. Recordings stay on this PC.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => api.app.openExternal(REPO_URL)}>
          <Code2 size={15} /> Source code
        </Button>
        <Button variant="ghost" onClick={() => api.app.openExternal(`${REPO_URL}/issues/new/choose`)}>
          <Bug size={15} /> Report a problem
        </Button>
        <Button variant="ghost" onClick={() => api.app.openExternal(`${REPO_URL}/releases`)}>
          Release notes
        </Button>
      </div>
    </div>
  );
}

function GeneralPanel({ settings, update }: { settings: AppSettings; update: (p: Partial<AppSettings>) => void }) {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  useEffect(() => api.app.onUpdate(setUpdateStatus), []);

  return (
    <div className="space-y-5">
      <Field label="Projects folder" hint="Recordings are saved here as .zoompane folders.">
        <div className="truncate rounded-lg bg-raised px-3 py-2 text-xs text-muted ring-1 ring-line select-text">{settings.projectsDir}</div>
      </Field>
      <Field label="Open the editor after recording" inline>
        <Toggle checked={settings.openEditorAfterRecording} onChange={(v) => update({ openEditorAfterRecording: v })} />
      </Field>
      <Field label="Show the launcher in the taskbar" hint="When off, ZoomPane lives in the system tray." inline>
        <Toggle checked={settings.showInTaskbar} onChange={(v) => update({ showInTaskbar: v })} />
      </Field>
      <div className="flex items-center justify-between border-t border-line pt-5">
        <div>
          <div>ZoomPane {api.version}</div>
          <div className="text-xs text-muted">
            {updateStatus.state === 'ready'
              ? `Version ${updateStatus.version} is ready to install.`
              : updateStatus.state === 'downloading'
                ? `Downloading update… ${Math.round(updateStatus.progress ?? 0)}%`
                : updateStatus.state === 'checking'
                  ? 'Checking for updates…'
                  : 'Updates install automatically.'}
          </div>
        </div>
        {updateStatus.state === 'ready' ? (
          <Button variant="primary" onClick={() => api.app.installUpdate()}>
            Restart to update
          </Button>
        ) : (
          <Button onClick={() => api.app.checkForUpdates()}>Check for updates</Button>
        )}
      </div>
    </div>
  );
}

const SHORTCUT_LABELS: Record<keyof Shortcuts, string> = {
  toggleRecording: 'Start / stop recording',
  togglePause: 'Pause / resume recording',
  cancelRecording: 'Discard recording',
};

function ShortcutsPanel({ shortcuts, onChange }: { shortcuts: Shortcuts; onChange: (s: Shortcuts) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-muted">Global shortcuts work anywhere in Windows, even when ZoomPane is in the background.</p>
      {(Object.keys(SHORTCUT_LABELS) as (keyof Shortcuts)[]).map((id) => (
        <Field key={id} label={SHORTCUT_LABELS[id]} inline>
          <ShortcutInput value={shortcuts[id]} onChange={(v) => onChange({ ...shortcuts, [id]: v })} />
        </Field>
      ))}
    </div>
  );
}

/** Records a key combination as an Electron accelerator string. */
function ShortcutInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const label = value.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.preventDefault();
    if (e.key === 'Escape') return setListening(false);
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const parts = [e.ctrlKey && 'CommandOrControl', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[];
    if (parts.length === 0) return;
    const key = e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    onChange([...parts, key].join('+'));
    setListening(false);
  };

  return (
    <button
      type="button"
      onClick={() => setListening(true)}
      onBlur={() => setListening(false)}
      onKeyDown={listening ? onKeyDown : undefined}
      className={clsx('h-8 min-w-44 rounded-lg px-3 text-sm ring-1', listening ? 'bg-accent-soft text-accent ring-accent' : 'bg-raised ring-line hover:bg-hover')}
    >
      {listening ? 'Press a combination…' : label || 'Not set'}
    </button>
  );
}
