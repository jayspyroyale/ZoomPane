import type { ZoomPaneApi } from '../shared/api';

declare global {
  interface Window {
    zoompane: ZoomPaneApi;
  }
}

export {};
