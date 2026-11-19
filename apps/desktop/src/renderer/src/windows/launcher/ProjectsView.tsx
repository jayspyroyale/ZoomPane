import { FolderOpen, MoreHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ProjectSummary } from '@shared/api';
import { api } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { Button, Spinner } from '@/ui/controls';

export function ProjectsView() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => void api.projects.list().then(setProjects).catch((e: Error) => setError(e.message));
  useEffect(load, []);

  const browse = async () => {
    try {
      const dir = await api.projects.browse();
      if (dir) await api.projects.openEditor(dir);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (p: ProjectSummary) => {
    if (!confirm(`Move "${p.name}" to the Recycle Bin?`)) return;
    await api.projects.remove(p.dir);
    load();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        {!projects ? (
          <div className="flex h-40 items-center justify-center text-muted">
            <Spinner />
          </div>
        ) : projects.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <p className="text-[15px] text-ink">No recordings yet</p>
            <p className="mt-1">Your recordings will appear here.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {projects.map((p) => (
              <li key={p.dir}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => api.projects.openEditor(p.dir)}
                  onKeyDown={(e) => e.key === 'Enter' && api.projects.openEditor(p.dir)}
                  className="group flex cursor-pointer items-center gap-3 rounded-xl p-2 ring-1 ring-transparent hover:bg-panel hover:ring-line"
                >
                  <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-canvas ring-1 ring-line">
                    {p.thumbnail && <img src={api.files.mediaUrl(p.thumbnail)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="text-xs text-muted">
                      {formatDate(p.createdAt)} · {formatTime(p.durationMs)}
                    </div>
                  </div>
                  <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" title="Show in Explorer" className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink" onClick={(e) => (e.stopPropagation(), void api.projects.reveal(p.dir))}>
                      <MoreHorizontal size={15} />
                    </button>
                    <button type="button" title="Delete" className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-danger" onClick={(e) => (e.stopPropagation(), void remove(p))}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-line px-4 py-3">
        <Button className="w-full" onClick={() => void browse()}>
          <FolderOpen size={15} /> Open project from disk…
        </Button>
      </div>
    </div>
  );
}
