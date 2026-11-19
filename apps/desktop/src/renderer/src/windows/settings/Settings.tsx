import clsx from 'clsx';
import { BadgeCheck, Keyboard, Settings2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, LicenseStatus, Shortcuts, UpdateStatus } from '@shared/api';
import { api } from '@/lib/api';
import { useLicense, useSettings } from '@/lib/hooks';
import { Button, Field, Spinner, Toggle } from '@/ui/controls';
import { TitleBar } from '@/ui/TitleBar';

const WEBSITE = 'https://zoompane.app';

type Tab = 'license' | 'general' | 'shortcuts';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('license');
  const [settings, update] = useSettings();
  const license = useLicense();

  return (
    <div className="flex h-full flex-col">
      <TitleBar title="Settings" maximizable={false} />
      <div className="flex min-h-0 flex-1">
        <nav className="w-44 shrink-0 space-y-0.5 border-r border-line bg-panel p-2">
          <NavItem icon={<BadgeCheck size={15} />} label="License" active={tab === 'license'} onClick={() => setTab('license')} />
          <NavItem icon={<Settings2 size={15} />} label="General" active={tab === 'general'} onClick={() => setTab('general')} />
          <NavItem icon={<Keyboard size={15} />} label="Shortcuts" active={tab === 'shortcuts'} onClick={() => setTab('shortcuts')} />
        </nav>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {tab === 'license' && license && <LicensePanel status={license} />}
          {tab === 'general' && settings && <GeneralPanel settings={settings} update={update} />}
          {tab === 'shortcuts' && settings && <ShortcutsPanel shortcuts={settings.shortcuts} onChange={(shortcuts) => update({ shortcuts })} />}
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

function LicensePanel({ status }: { status: LicenseStatus }) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activate = async () => {
    setBusy(true);
    const result = await api.license.activate(key);
    setBusy(false);
    setMessage(result.state === 'active' ? null : (result.message ?? 'Activation failed'));
  };

  if (status.state === 'active') {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl bg-accent-soft p-4 ring-1 ring-accent/30">
          <Sparkles className="mt-0.5 text-accent" size={20} />
          <div>
            <div className="text-[15px] font-semibold">ZoomPane Pro is active</div>
            <div className="mt-0.5 text-muted">
              {status.email} · {status.plan === 'yearly' ? 'Yearly' : 'Monthly'} plan
            </div>
            <div className="mt-1 font-mono text-xs text-muted">{status.key}</div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => api.app.openExternal(`${WEBSITE}/account`)}>Manage subscription</Button>
          <Button variant="ghost" onClick={() => void api.license.deactivate()}>
            Deactivate this PC
          </Button>
        </div>
        <p className="text-xs text-muted">One license works on up to 3 PCs. Deactivate a PC to move your license to another one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold">Unlock ZoomPane Pro</h2>
        <p className="mt-1 text-muted">Export without a watermark, in up to 4K at 60 fps. Every feature is included in every plan.</p>
      </div>
      <Field label="License key" hint="You'll find it on the purchase confirmation page and on your Stripe receipts.">
        <div className="flex gap-2">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void activate()}
            placeholder="ZP-XXXX-XXXX-XXXX-XXXX"
            className="h-9 flex-1 rounded-lg bg-raised px-3 font-mono uppercase ring-1 ring-line outline-none select-text focus:ring-accent"
          />
          <Button variant="primary" disabled={busy || key.trim().length < 10} onClick={() => void activate()}>
            {busy ? <Spinner /> : 'Activate'}
          </Button>
        </div>
      </Field>
      {(message ?? status.message) && <p className="text-xs text-danger">{message ?? status.message}</p>}
      <div className="flex gap-2">
        <Button onClick={() => api.app.openExternal(`${WEBSITE}/pricing`)}>Buy ZoomPane Pro</Button>
        <Button variant="ghost" onClick={() => api.app.openExternal(`${WEBSITE}/account`)}>
          Lost your key?
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
