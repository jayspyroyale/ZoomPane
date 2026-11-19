import { Command, Redo2, Undo2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SceneBuilder } from '@/engine/render';
import { api } from '@/lib/api';
import { useLicense } from '@/lib/hooks';
import { Button, IconButton, Spinner } from '@/ui/controls';
import { TitleBar } from '@/ui/TitleBar';
import { CommandMenu, ShortcutsSheet } from './CommandDialogs';
import { handleKeyDown } from './commands';
import { EditorContext, type EditorEnv } from './context';
import { ExportDialog } from './ExportDialog';
import { Inspector } from './inspector/Inspector';
import { loadRecording, type LoadedRecording } from './loadRecording';
import { Player } from './player';
import { Preview } from './Preview';
import { useEditor } from './store';
import { TimelinePanel } from './Timeline';

const AUTOSAVE_MS = 800;
const THUMBNAIL_WIDTH = 480;

interface Session {
  loaded: LoadedRecording;
  player: Player;
  builder: SceneBuilder;
}

export default function Editor({ query }: { query: URLSearchParams }) {
  const dir = query.get('dir') ?? '';
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    let player: Player | null = null;
    (async () => {
      const opened = await api.projects.open(dir);
      const loaded = await loadRecording(opened);
      if (!live) return;
      player = new Player(loaded.media, loaded.data.manifest, loaded.project);
      await player.ready();
      if (!live) return;
      useEditor.getState().load(loaded.project);
      // A fresh recording has no project.json yet: save the generated one right away.
      if (!opened.project) useEditor.setState({ dirty: true });
      setSession({ loaded, player, builder: new SceneBuilder(loaded.data) });
    })().catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
      player?.destroy();
    };
  }, [dir]);

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar title="ZoomPane" />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="font-medium">This recording could not be opened</div>
          <div className="max-w-md text-sm text-muted">{error}</div>
          <Button onClick={() => api.projects.reveal(dir)}>Show folder</Button>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar title="Opening…" />
        <div className="flex flex-1 items-center justify-center text-muted">
          <Spinner />
        </div>
      </div>
    );
  }
  return <EditorShell session={session} dir={dir} />;
}

function EditorShell({ session, dir }: { session: Session; dir: string }) {
  const license = useLicense();
  const watermark = license?.state !== 'active';
  const env = useMemo<EditorEnv>(() => ({ ...session, watermark }), [session, watermark]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useEditor((s) => s.project!);
  const { dialog, setDialog, undo, redo, past, future, dirty } = useEditor();
  const { player } = session;

  // Player → store: playhead and play state.
  useEffect(
    () =>
      player.onFrame(() => {
        const s = useEditor.getState();
        if (s.playing !== player.playing) s.setPlaying(player.playing);
        s.setPlayhead(player.outputTime);
      }),
    [player],
  );

  // Store → player: cuts, speeds, volumes and music follow the project.
  useEffect(() => player.setProject(project), [player, project]);

  useEffect(() => api.window.setTitle(`${project.name} – ZoomPane`), [project.name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKeyDown(env, e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [env]);

  // Autosave shortly after each change, with a fresh thumbnail for the projects list.
  useEffect(() => {
    if (!dirty) return;
    const save = () => {
      const state = useEditor.getState();
      if (!state.project) return;
      state.markSaved();
      void api.projects.save(dir, state.project, thumbnail(canvasRef.current));
    };
    const timer = setTimeout(save, AUTOSAVE_MS);
    window.addEventListener('beforeunload', save);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeunload', save);
    };
  }, [dir, dirty, project]);

  return (
    <EditorContext.Provider value={env}>
      <div className="flex h-full flex-col">
        <TitleBar title={project.name}>
          <IconButton label="Undo (Ctrl+Z)" disabled={!past.length} onClick={undo}>
            <Undo2 size={16} />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" disabled={!future.length} onClick={redo}>
            <Redo2 size={16} />
          </IconButton>
          <IconButton label="Command menu (Ctrl+K)" onClick={() => setDialog('commands')}>
            <Command size={15} />
          </IconButton>
          <Button variant="primary" size="sm" className="mx-2" onClick={() => setDialog('export')}>
            <Upload size={14} /> Export
          </Button>
        </TitleBar>
        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="checker flex min-h-0 flex-1 p-6">
              <Preview canvasRef={canvasRef} />
            </div>
            <div className="h-[248px] shrink-0">
              <TimelinePanel />
            </div>
          </div>
          <Inspector />
        </div>
      </div>
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'commands' && <CommandMenu />}
      {dialog === 'shortcuts' && <ShortcutsSheet />}
    </EditorContext.Provider>
  );
}

function thumbnail(canvas: HTMLCanvasElement | null): string | undefined {
  if (!canvas || !canvas.width) return undefined;
  const small = document.createElement('canvas');
  small.width = THUMBNAIL_WIDTH;
  small.height = Math.round((canvas.height / canvas.width) * THUMBNAIL_WIDTH);
  small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
  return small.toDataURL('image/jpeg', 0.8);
}
