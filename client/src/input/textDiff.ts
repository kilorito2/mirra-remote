/**
 * Teclado móvil (R19): los teclados mandan keyCode 229 y componen palabras (autocorrección,
 * predicción). En vez de interpretar teclas, se compara el contenido del input oculto antes y
 * después de cada `input`: lo borrado son backspaces y lo agregado es texto. Así la PC refleja
 * exactamente lo que hay en el campo, incluido ñ, tildes, @ y €.
 */
export interface TextEdit {
  backspaces: number;
  insert: string;
}

export function diffText(prev: string, next: string): TextEdit {
  // Por code point (no por unidad UTF-16): un emoji es un solo backspace.
  const a = Array.from(prev);
  const b = Array.from(next);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return { backspaces: a.length - i, insert: b.slice(i).join('') };
}

/** Relleno inicial del campo: permite detectar un backspace aunque "no haya nada escrito". */
/** Espacio de ancho cero (U+200B). */
const ZWSP = String.fromCharCode(0x200b);

export const SENTINEL = ZWSP.repeat(4);

/** Si el campo creció demasiado (o quedó sin centinela), se vuelve a empezar desde el centinela. */
export function needsReset(value: string): boolean {
  return value.length > 200 || !value.startsWith(SENTINEL.slice(0, 1));
}

/** Teclas que se mandan como tecla y no como texto. */
export function splitInsert(insert: string): ({ kind: 'text'; text: string } | { kind: 'enter' } | { kind: 'tab' })[] {
  const out: ({ kind: 'text'; text: string } | { kind: 'enter' } | { kind: 'tab' })[] = [];
  let buf = '';
  for (const ch of insert) {
    if (ch === '\n' || ch === '\t') {
      if (buf) out.push({ kind: 'text', text: buf });
      buf = '';
      out.push({ kind: ch === '\n' ? 'enter' : 'tab' });
    } else if (ch !== ZWSP) {
      buf += ch;
    }
  }
  if (buf) out.push({ kind: 'text', text: buf });
  return out;
}
