import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons';

export interface ToolbarItem {
  id: string;
  label: string;
  icon: IconName;
  onClick: () => void;
  pressed?: boolean;
}

/**
 * Barra flotante abajo al centro, al alcance del pulgar (R27 diseño). Se esconde sola; el tirador
 * (44 px de alto) la vuelve a mostrar sin tapar el video.
 */
export function Toolbar({ items, hidden, onReveal }: { items: ToolbarItem[]; hidden: boolean; onReveal: () => void }) {
  return (
    <>
      <nav
        aria-label="Controles"
        aria-hidden={hidden}
        inert={hidden}
        className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 gap-0.5 rounded-pill border border-white/6 bg-hoja/82 p-[5px] shadow-[0_10px_30px_rgb(0_0_0/0.45)] backdrop-blur-lg transition-[transform,opacity] duration-200 ease-out ${
          hidden ? 'pointer-events-none translate-y-[150%] opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        {items.map((item) => [
          item.id === 'exit' && <span key="sep" aria-hidden="true" className="mx-1 my-2.5 w-px bg-white/10" />,
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={item.pressed}
            onClick={item.onClick}
            className={`flex size-[46px] items-center justify-center rounded-pill transition-colors active:bg-rama aria-pressed:bg-pico aria-pressed:text-selva ${item.id === 'exit' ? 'text-alerta' : 'text-pluma'}`}
          >
            <Icon name={item.icon} />
          </button>,
        ])}
      </nav>
      {hidden && (
        <button
          type="button"
          aria-label="Mostrar controles"
          onClick={onReveal}
          className="fixed bottom-0 left-1/2 z-20 flex h-11 w-24 -translate-x-1/2 items-end justify-center pb-2"
        >
          <span aria-hidden="true" className="h-1.5 w-12 rounded-pill bg-pluma/45" />
        </button>
      )}
    </>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <section
      role="dialog"
      aria-label={title}
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[70vh] max-w-2xl overflow-y-auto rounded-t-3xl border-t border-white/6 bg-hondo/94 px-4 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.5)] backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-9 rounded-pill bg-rama" />
      <div className="mb-3.5 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">{title}</h2>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="group flex size-11 items-center justify-center">
          <span className="flex size-9 items-center justify-center rounded-pill bg-tecla transition-colors group-active:bg-rama">
            <Icon name="close" className="size-4" />
          </span>
        </button>
      </div>
      {children}
    </section>
  );
}
