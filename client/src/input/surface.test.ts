import { describe, expect, it } from 'vitest';
import { NO_ZOOM, applyPinch, clampZoom, contentRect, followCursor, frameToSurface, surfaceToFrame } from './surface';
import { SENTINEL, diffText, needsReset, splitInsert } from './textDiff';

const view = { width: 800, height: 400 };
const video = { width: 1920, height: 1080 };

describe('superficie', () => {
  it('letterbox: 16:9 dentro de 2:1 deja bandas a los costados', () => {
    const r = contentRect(view, video);
    expect(r.height).toBe(400);
    expect(r.width).toBeCloseTo(711.1, 1);
    expect(r.x).toBeCloseTo(44.4, 1);
  });

  it('toque ⇄ frame sin zoom, con clamp en las bandas', () => {
    expect(surfaceToFrame({ x: 400, y: 200 }, view, video, NO_ZOOM)).toEqual({ x: 0.5, y: 0.5 });
    expect(surfaceToFrame({ x: 5, y: 200 }, view, video, NO_ZOOM).x).toBe(0);
    const back = frameToSurface({ x: 0.25, y: 0.75 }, view, video, NO_ZOOM);
    const again = surfaceToFrame(back, view, video, NO_ZOOM);
    expect(again.x).toBeCloseTo(0.25, 6);
    expect(again.y).toBeCloseTo(0.75, 6);
  });

  it('con zoom, el mismo toque apunta a otra parte del frame y la ida y vuelta se mantiene', () => {
    const z = applyPinch(NO_ZOOM, 2, { x: 400, y: 200 }, { x: 0, y: 0 }, view);
    expect(z.scale).toBe(2);
    expect(surfaceToFrame({ x: 400, y: 200 }, view, video, z)).toEqual({ x: 0.5, y: 0.5 });
    const p = surfaceToFrame({ x: 600, y: 200 }, view, video, z);
    expect(p.x).toBeCloseTo(0.5 + 100 / contentRect(view, video).width, 6);
    const s = frameToSurface(p, view, video, z);
    expect(s.x).toBeCloseTo(600, 6);
  });

  it('zoom entre 1× y 5× y sin panear fuera del contenido', () => {
    expect(applyPinch(NO_ZOOM, 0.5, { x: 10, y: 10 }, { x: 0, y: 0 }, view)).toEqual(NO_ZOOM);
    expect(applyPinch({ scale: 4, tx: 0, ty: 0 }, 3, { x: 0, y: 0 }, { x: 0, y: 0 }, view).scale).toBe(5);
    expect(clampZoom({ scale: 2, tx: 500, ty: -9999 }, view)).toEqual({ scale: 2, tx: 0, ty: -400 });
  });

  it('la vista sigue al cursor cerca del borde', () => {
    const z = { scale: 2, tx: -400, ty: -200 };
    const moved = followCursor(z, { x: 790, y: 200 }, view);
    expect(moved.tx).toBeLessThan(z.tx);
    expect(followCursor(z, { x: 400, y: 200 }, view)).toEqual(z);
    expect(followCursor(NO_ZOOM, { x: 799, y: 0 }, view)).toEqual(NO_ZOOM);
  });
});

describe('diffText (teclado móvil)', () => {
  it('agregar texto con caracteres españoles', () => {
    expect(diffText(SENTINEL, `${SENTINEL}ñandú @ 5 €`)).toEqual({ backspaces: 0, insert: 'ñandú @ 5 €' });
  });

  it('backspace aunque el campo "esté vacío" (come el centinela)', () => {
    expect(diffText(SENTINEL, SENTINEL.slice(1))).toEqual({ backspaces: 1, insert: '' });
  });

  it('autocorrección: reemplaza el final de la palabra', () => {
    expect(diffText(`${SENTINEL}hla`, `${SENTINEL}hola `)).toEqual({ backspaces: 2, insert: 'ola ' });
  });

  it('cuenta caracteres, no unidades UTF-16 (emoji)', () => {
    expect(diffText(`${SENTINEL}a😀`, `${SENTINEL}a`)).toEqual({ backspaces: 1, insert: '' });
  });

  it('enter y tab salen como teclas; el centinela no se tipea', () => {
    expect(splitInsert(`hola\nmundo\t${SENTINEL}`)).toEqual([
      { kind: 'text', text: 'hola' },
      { kind: 'enter' },
      { kind: 'text', text: 'mundo' },
      { kind: 'tab' },
    ]);
  });

  it('reset cuando crece o pierde el centinela', () => {
    expect(needsReset(SENTINEL + 'x')).toBe(false);
    expect(needsReset('x'.repeat(250))).toBe(true);
    expect(needsReset('hola')).toBe(true);
  });
});
