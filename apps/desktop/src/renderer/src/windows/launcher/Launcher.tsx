import { Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useSettings } from '@/lib/hooks';
import { api } from '@/lib/api';
import { Segmented } from '@/ui/controls';
import { TitleBar } from '@/ui/TitleBar';
import { ProjectsView } from './ProjectsView';
import { RecordView } from './RecordView';

export default function Launcher() {
  const [tab, setTab] = useState<'record' | 'projects'>('record');
  const [settings, updateSettings] = useSettings();

  return (
    <div className="flex h-full flex-col">
      <TitleBar title="ZoomPane" maximizable={false}>
        <button type="button" title="Settings" onClick={() => api.app.openSettings()} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-ink">
          <Settings2 size={16} />
        </button>
      </TitleBar>
      <div className="px-4 pt-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'record', label: 'New recording' },
            { value: 'projects', label: 'Projects' },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1">
        {settings && tab === 'record' && <RecordView settings={settings} updateSettings={updateSettings} />}
        {tab === 'projects' && <ProjectsView />}
      </div>
    </div>
  );
}
