import { useState, type DragEvent } from 'react';
import { DOWNLOADS_SUBDIR } from '@shared/constants';
import type { TransferView } from '@shared/uiState';
import { Card, Icon } from './controls';

const STATE: Record<TransferView['state'], string> = { running: '', done: 'Listo', cancelled: 'Cancelado', error: 'Falló' };

function size(n: number): string {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** R25: enviar al celular con el botón o soltando archivos en la ventana; progreso y cancelar en ambos sentidos. */
export function Transfers({
  active,
  transfers,
  onDrop,
  onCancel,
}: {
  active: boolean;
  transfers: TransferView[];
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
      className="space-y-2"
    >
      <div
        className={`flex items-center gap-3 rounded-2xl border border-dashed p-4 text-[13px] text-liquen transition-colors ${
          over ? 'border-pico bg-pico/8 text-pluma' : 'border-rama'
        }`}
      >
        <Icon name="file" className="size-5 shrink-0" />
        {active ? (
          <p>Soltá archivos acá o elegilos. Los del celular llegan a Descargas › {DOWNLOADS_SUBDIR}.</p>
        ) : (
          <p>Con un celular conectado vas a poder pasar archivos en los dos sentidos.</p>
        )}
      </div>
      {transfers.length > 0 && (
        <Card>
          <ul className="divide-y divide-linea" aria-label="Transferencias">
            {[...transfers].reverse().map((t) => (
              <li key={t.id} className="space-y-2 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <Icon name={t.direction === 'toPhone' ? 'up' : 'down'} className="size-[18px] shrink-0 text-tenue" />
                  <span className="min-w-0 grow truncate font-medium">
                    <span className="sr-only">{t.direction === 'toPhone' ? 'Al celular: ' : 'Del celular: '}</span>
                    {t.name}
                  </span>
                  {t.state === 'running' ? (
                    <button
                      type="button"
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-liquen transition-colors hover:bg-tecla hover:text-pluma"
                      onClick={() => onCancel(t.id)}
                      aria-label={`Cancelar ${t.name}`}
                    >
                      <Icon name="close" />
                    </button>
                  ) : (
                    <span className={`flex items-center gap-1 text-xs ${t.state === 'done' ? 'text-menta' : 'text-liquen'}`}>
                      {t.state === 'done' && <Icon name="check" className="size-3.5" />}
                      {STATE[t.state]}
                    </span>
                  )}
                </div>
                {t.state === 'running' && (
                  <>
                    <progress
                      className="block h-1 w-full overflow-hidden rounded-pill accent-pico [&::-webkit-progress-bar]:bg-rama/70 [&::-webkit-progress-value]:bg-pico"
                      max={Math.max(1, t.size)}
                      value={t.done}
                      aria-label={`Progreso de ${t.name}`}
                    />
                    <span className="block font-mono text-xs text-liquen">
                      {size(t.done)} de {size(t.size)} · {t.direction === 'toPhone' ? 'al celular' : 'del celular'}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
