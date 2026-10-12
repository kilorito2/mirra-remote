import { useState } from 'react';
import { MODIFIER_KEYS, type KeyName } from '@shared/protocol';
import type { InputSender } from '../input/InputSender';

type Modifier = (typeof MODIFIER_KEYS)[number];

const MOD_LABEL: Record<Modifier, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' };

const KEYS: { key: KeyName; label: string }[] = [
  { key: 'escape', label: 'Esc' },
  { key: 'tab', label: 'Tab' },
  { key: 'delete', label: 'Supr' },
  { key: 'home', label: 'Inicio' },
  { key: 'end', label: 'Fin' },
  { key: 'pageup', label: 'RePág' },
  { key: 'pagedown', label: 'AvPág' },
];

const ARROWS: { key: KeyName; label: string; name: string }[] = [
  { key: 'left', label: '←', name: 'Flecha izquierda' },
  { key: 'up', label: '↑', name: 'Flecha arriba' },
  { key: 'down', label: '↓', name: 'Flecha abajo' },
  { key: 'right', label: '→', name: 'Flecha derecha' },
];

const FKEYS = Array.from({ length: 12 }, (_, i) => ({ key: `f${i + 1}` as KeyName, label: `F${i + 1}` }));

const COMBOS: { keys: KeyName[]; label: string }[] = [
  { keys: ['alt', 'tab'], label: 'Alt+Tab' },
  { keys: ['meta', 'd'], label: 'Win+D' },
  { keys: ['ctrl', 'c'], label: 'Ctrl+C' },
  { keys: ['ctrl', 'v'], label: 'Ctrl+V' },
  { keys: ['ctrl', 'z'], label: 'Ctrl+Z' },
  { keys: ['ctrl', 's'], label: 'Ctrl+S' },
  { keys: ['ctrl', 'shift', 'escape'], label: 'Administrador de tareas' },
];

const keyClass =
  'min-h-11 min-w-11 rounded-[11px] border border-linea bg-tecla px-3 font-medium text-pluma transition-colors active:bg-rama aria-pressed:border-pico aria-pressed:bg-pico aria-pressed:font-semibold aria-pressed:text-selva';
const pillClass = 'min-h-10 shrink-0 rounded-pill border border-linea px-3.5 text-sm text-pluma transition-colors active:bg-tecla';

/**
 * R20: teclas especiales y combinaciones. Los modificadores quedan "pegados" hasta la próxima tecla
 * (de esta hoja o del teclado del celular).
 */
export function KeysSheet({
  sender,
  modifiers,
  onModifiers,
}: {
  sender: InputSender;
  modifiers: Modifier[];
  onModifiers: (mods: Modifier[]) => void;
}) {
  const [confirmLock, setConfirmLock] = useState(false);
  const [sasNote, setSasNote] = useState(false);

  const press = (key: KeyName) => {
    if (modifiers.length) {
      sender.combo([...modifiers, key]);
      onModifiers([]);
    } else sender.key(key);
  };
  const toggle = (m: Modifier) => onModifiers(modifiers.includes(m) ? modifiers.filter((x) => x !== m) : [...modifiers, m]);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Modificadores" className="grid grid-cols-4 gap-1.5">
        {MODIFIER_KEYS.map((m) => (
          <button key={m} type="button" aria-pressed={modifiers.includes(m)} className={keyClass} onClick={() => toggle(m)}>
            {MOD_LABEL[m]}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Teclas" className="grid grid-cols-4 gap-1.5 font-mono text-sm">
        {KEYS.map((k) => (
          <button key={k.key} type="button" className={keyClass} onClick={() => press(k.key)}>
            {k.label}
          </button>
        ))}
        {ARROWS.map((k) => (
          <button key={k.key} type="button" aria-label={k.name} className={keyClass} onClick={() => press(k.key)}>
            {k.label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Teclas de función" className="grid grid-cols-6 gap-1.5 font-mono text-sm">
        {FKEYS.map((k) => (
          <button key={k.key} type="button" className={keyClass} onClick={() => press(k.key)}>
            {k.label}
          </button>
        ))}
      </div>

      <div role="group" aria-label="Combinaciones" className="flex flex-wrap gap-1.5">
        {COMBOS.map((c) => (
          <button key={c.label} type="button" className={pillClass} onClick={() => sender.combo(c.keys)}>
            {c.label}
          </button>
        ))}
        <button type="button" className={pillClass} onClick={() => setConfirmLock(true)}>
          Win+L
        </button>
        {/* No se puede enviar, pero se puede tocar para saber por qué. */}
        <button type="button" className={`${pillClass} opacity-50`} aria-label="Ctrl+Alt+Supr, no disponible" onClick={() => setSasNote(true)}>
          Ctrl+Alt+Supr
        </button>
      </div>

      {confirmLock && (
        <div role="alertdialog" aria-label="Bloquear la PC" className="rounded-2xl border border-pico/30 bg-pico/8 p-3.5">
          <p>Win+L bloquea la PC. Vas a perder el control hasta que alguien la desbloquee ahí.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="min-h-11 rounded-xl bg-pico px-4 font-semibold text-selva"
              onClick={() => {
                sender.combo(['meta', 'l']);
                setConfirmLock(false);
              }}
            >
              Bloquear igual
            </button>
            <button type="button" className="min-h-11 rounded-xl border border-rama px-4" onClick={() => setConfirmLock(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {sasNote && (
        <p role="status" className="text-sm text-liquen">
          Ctrl+Alt+Supr requiere el servicio nativo de Windows; desde una app no se puede enviar.
        </p>
      )}
    </div>
  );
}
