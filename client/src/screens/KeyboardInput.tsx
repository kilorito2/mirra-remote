import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { KeyName } from '@shared/protocol';
import type { InputSender } from '../input/InputSender';
import { SENTINEL, diffText, needsReset, splitInsert } from '../input/textDiff';

export interface KeyboardHandle {
  /** Debe llamarse dentro del gesto del usuario (iOS no abre el teclado si no). */
  open(): void;
  close(): void;
}

const LETTER = /^[a-z0-9]$/;

/**
 * Input oculto que abre el teclado del celular (R19). Los teclados móviles mandan keyCode 229,
 * así que no se leen teclas: se compara el contenido del campo en cada `input` (diffText).
 * Con modificadores pegados (Ctrl, Alt…), una letra se manda como combinación.
 */
export const KeyboardInput = forwardRef<KeyboardHandle, { sender: InputSender; modifiers: KeyName[]; onModifiersUsed: () => void }>(
  function KeyboardInput({ sender, modifiers, onModifiersUsed }, ref) {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const last = useRef(SENTINEL);
    const composing = useRef(false);

    useImperativeHandle(ref, () => ({
      open: () => {
        const el = inputRef.current;
        if (!el) return;
        el.value = SENTINEL;
        last.current = SENTINEL;
        el.focus({ preventScroll: true });
        el.setSelectionRange(el.value.length, el.value.length);
      },
      close: () => inputRef.current?.blur(),
    }));

    const onInput = () => {
      const el = inputRef.current;
      if (!el) return;
      const { backspaces, insert } = diffText(last.current, el.value);
      last.current = el.value;
      sender.backspaces(backspaces);
      for (const part of splitInsert(insert)) {
        if (part.kind === 'enter') sender.key('enter');
        else if (part.kind === 'tab') sender.key('tab');
        else if (modifiers.length && LETTER.test(part.text.toLowerCase())) {
          sender.combo([...modifiers, part.text.toLowerCase() as KeyName]);
          onModifiersUsed();
        } else sender.text(part.text);
      }
      // Fuera de una composición (autocorrección en curso), se vuelve al centinela para que el campo no crezca.
      if (!composing.current && needsReset(el.value)) {
        el.value = SENTINEL;
        last.current = SENTINEL;
      }
    };

    return (
      <textarea
        ref={inputRef}
        aria-label="Teclado de la PC"
        data-testid="keyboard-input"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="enter"
        className="fixed bottom-0 left-0 h-px w-px resize-none border-0 bg-transparent p-0 text-transparent caret-transparent opacity-0"
        onInput={onInput}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          onInput();
        }}
        onKeyDown={(e) => {
          // Teclados físicos (Bluetooth): las teclas de navegación no cambian el texto.
          const map: Record<string, KeyName> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Escape: 'escape', Delete: 'delete' };
          const key = map[e.key];
          if (key) {
            e.preventDefault();
            sender.key(key);
          }
        }}
      />
    );
  },
);
