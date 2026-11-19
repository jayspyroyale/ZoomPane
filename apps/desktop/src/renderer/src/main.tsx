import { lazy, StrictMode, Suspense, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const routes: Record<string, ComponentType<{ query: URLSearchParams }>> = {
  launcher: lazy(() => import('./windows/launcher/Launcher')),
  editor: lazy(() => import('./editor/Editor')),
  toolbar: lazy(() => import('./windows/toolbar/Toolbar')),
  countdown: lazy(() => import('./windows/Countdown')),
  area: lazy(() => import('./windows/AreaSelector')),
  settings: lazy(() => import('./windows/settings/Settings')),
};

// Each window loads index.html#/<route>?<query>.
const [path, search = ''] = window.location.hash.replace(/^#\/?/, '').split('?');
const Route = routes[path] ?? routes.launcher;
const transparent = ['toolbar', 'countdown', 'area'].includes(path);
if (transparent) document.body.classList.add('transparent');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Route query={new URLSearchParams(search)} />
    </Suspense>
  </StrictMode>,
);
