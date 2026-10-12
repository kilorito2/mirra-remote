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
        className={`fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-20 flex -translate-x-1/2 gap-1 rounded-pill bg-selva/92 p-1.5 shadow-[0_8px_24px_rgb(0_0_0/0.45)] backdrop-blur transition-[transform,opacity] duration-200 ease-out ${
          hidden ? 'pointer-events-none translate-y-[150%] opacity-0' : 'translate-y-0 opacity-100'
        }`}
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-pressed={item.pressed}
            onClick={item.onClick}
            className="flex size-12 items-center justify-center rounded-pill text-pluma transition-colors active:bg-rama aria-pressed:bg-pico aria-pressed:text-selva"
          >
            <Icon name={item.icon} />
          </button>
        ))}
      </nav>
      {hidden && (
        <button
          type="button"
          aria-label="Mostrar controles"
          onClick={onReveal}
          className="fixed bottom-0 left-1/2 z-20 flex h-11 w-24 -translate-x-1/2 items-end justify-center pb-2"
        >
          <span aria-hidden="true" className="h-1.5 w-12 rounded-pill bg-pluma/50" />
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
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-h-[70vh] max-w-2xl overflow-y-auto rounded-t-2xl bg-selva/96 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgb(0_0_0/0.5)] backdrop-blur"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="flex size-11 items-center justify-center rounded-pill active:bg-rama">
          <Icon name="close" />
        </button>
      </div>
      {children}
    </section>
  );
}
