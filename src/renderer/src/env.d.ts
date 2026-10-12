import type { KrUiApi } from '@shared/uiState';

declare global {
  interface Window {
    kr: KrUiApi;
  }
}
