import { useState, type DragEvent } from 'react';
import type { TransferView } from '@shared/uiState';
import { Button } from './controls';

const STATE: Record<TransferView['state'], string> = { running: '', done: 'Listo', cancelled: 'Cancelado', error: 'Falló' };

function size(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** R25: enviar al celular con el botón o soltando archivos en la ventana; progreso y cancelar en ambos sentidos. */
export function Transfers({
  active,
  transfers,
  onPick,
  onDrop,
  onCancel,
}: {
  active: boolean;
  transfers: TransferView[];
  onPick: () => void;
  onDrop: (files: File[]) => void;
  onCancel: (id: string) => void;
}) {
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (active) onDrop(Array.from(e.dataTransfer.files));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(active);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`space-y-3 rounded-xl p-1 ${over ? 'outline-2 outline-dashed outline-pico' : ''}`}
    >
      {active ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-liquen">Soltá archivos acá o elegilos. Los del celular llegan a Descargas › Kilorito Remote.</p>
          <Button variant="primary" onClick={onPick}>
            Enviar al celular
          </Button>
        </div>
      ) : (
        <p className="text-sm text-liquen">Con un celular conectado vas a poder pasar archivos en los dos sentidos.</p>
      )}
      {transfers.length > 0 && (
        <ul className="space-y-2" aria-label="Transferencias">
          {[...transfers].reverse().map((t) => (
            <li key={t.id} className="rounded-lg bg-hoja p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {t.direction === 'toPhone' ? 'Al celular: ' : 'Del celular: '}
                  {t.name}
                </span>
                {t.state === 'running' ? (
                  <button type="button" className="min-h-11 px-2 text-sm font-semibold text-alerta" onClick={() => onCancel(t.id)} aria-label={`Cancelar ${t.name}`}>
                    Cancelar
                  </button>
                ) : (
                  <span className="text-sm text-liquen">{STATE[t.state]}</span>
                )}
              </div>
              <progress className="mt-1 h-1.5 w-full accent-pico" max={Math.max(1, t.size)} value={t.done} aria-label={`Progreso de ${t.name}`} />
              <span className="text-xs text-liquen tabular-nums">
                {size(t.done)} de {size(t.size)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
