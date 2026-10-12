import { useEffect, useState } from 'react';
import type { KrUiApi, UiState } from '@shared/uiState';

export function useUiState(api: KrUiApi): UiState | null {
  const [state, setState] = useState<UiState | null>(null);
  useEffect(() => {
    let alive = true;
    const off = api.onState((s) => setState(s));
    void api.getState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
      off();
    };
  }, [api]);
  return state;
}

/** Reloj para cuentas regresivas; se actualiza cada `intervalMs`. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
