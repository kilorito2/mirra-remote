import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FileMessage } from '@shared/protocol';
import type { TransferView } from '@shared/uiState';
import { FileReceiver } from './fileReceiver';
import { FileSender } from './fileSender';
import { sanitizeFileName, uniquePath } from './sanitize';

describe('sanitizeFileName', () => {
  it.each([
    ['foto.jpg', 'foto.jpg'],
    ['../../Windows/system32/evil.dll', 'evil.dll'],
    ['C:\\Users\\x\\a.txt', 'a.txt'],
    ['con.txt', '_con.txt'],
    ['NUL', '_NUL'],
    ['inform<e>:"final"?.pdf', 'inform_e___final__.pdf'],
    ['nota. ', 'nota'],
    ['..', 'archivo'],
    ['', 'archivo'],
    ['factura\u202Efdp.exe', 'facturafdp.exe'],
    ['línea\u0007.txt', 'línea.txt'],
    ['Año ñandú.png', 'Año ñandú.png'],
  ])('%s → %s', (raw, expected) => {
    expect(sanitizeFileName(raw)).toBe(expected);
  });

  it('acota el largo conservando la extensión', () => {
    const name = sanitizeFileName(`${'a'.repeat(300)}.mp4`);
    expect(name.length).toBeLessThanOrEqual(180);
    expect(name.endsWith('.mp4')).toBe(true);
  });

  it('no pisa archivos existentes', () => {
    const taken = new Set([join('d', 'foto.jpg'), join('d', 'foto (1).jpg')]);
    expect(uniquePath('d', 'foto.jpg', (p) => taken.has(p))).toBe(join('d', 'foto (2).jpg'));
  });
});

function receiver() {
  const dir = mkdtempSync(join(tmpdir(), 'kr-recv-'));
  const sent: FileMessage[] = [];
  const progress: TransferView[] = [];
  const r = new FileReceiver({ dir: () => dir, send: (m) => sent.push(m), onProgress: (p) => progress.push(p) });
  return { r, dir, sent, progress };
}

describe('FileReceiver', () => {
  it('recibe en stream, confirma cada MiB y guarda con el nombre saneado', async () => {
    const { r, dir, sent } = receiver();
    const size = 3 * 1024 * 1024 + 10;
    r.message({ t: 'file.offer', id: 'a1', name: '../x/video.mp4', size, mime: 'video/mp4' });
    const chunk = new Uint8Array(16 * 1024).fill(7);
    let left = size;
    while (left > 0) {
      const n = Math.min(left, chunk.length);
      r.chunk(chunk.subarray(0, n));
      left -= n;
    }
    r.message({ t: 'file.end', id: 'a1' });
    await r.flushed();
    expect(sent.filter((m) => m.t === 'file.ack')).toHaveLength(3);
    expect(sent.at(-1)).toEqual({ t: 'file.done', id: 'a1' });
    expect(readdirSync(dir)).toEqual(['video.mp4']);
    expect(readFileSync(join(dir, 'video.mp4')).length).toBe(size);
  });

  it('más bytes que los anunciados: se corta y se borra el parcial', async () => {
    const { r, dir, sent } = receiver();
    r.message({ t: 'file.offer', id: 'b', name: 'a.bin', size: 10, mime: '' });
    r.chunk(new Uint8Array(11));
    await r.flushed();
    expect(sent.at(-1)).toEqual({ t: 'file.error', id: 'b', code: 'SIZE_MISMATCH' });
    await new Promise((res) => setTimeout(res, 20));
    expect(readdirSync(dir)).toEqual([]);
  });

  it('menos bytes al terminar: no se guarda', async () => {
    const { r, dir, sent } = receiver();
    r.message({ t: 'file.offer', id: 'c', name: 'a.bin', size: 10, mime: '' });
    r.chunk(new Uint8Array(5));
    r.message({ t: 'file.end', id: 'c' });
    await r.flushed();
    expect(sent.at(-1)).toEqual({ t: 'file.error', id: 'c', code: 'SIZE_MISMATCH' });
    expect(existsSync(join(dir, 'a.bin'))).toBe(false);
  });

  it('cancelar desde el celular borra el parcial; una segunda oferta en curso es BUSY', async () => {
    const { r, dir, sent, progress } = receiver();
    r.message({ t: 'file.offer', id: 'd', name: 'a.bin', size: 100, mime: '' });
    r.message({ t: 'file.offer', id: 'e', name: 'b.bin', size: 100, mime: '' });
    expect(sent).toContainEqual({ t: 'file.error', id: 'e', code: 'BUSY' });
    r.chunk(new Uint8Array(50));
    r.message({ t: 'file.cancel', id: 'd' });
    await r.flushed();
    await new Promise((res) => setTimeout(res, 20));
    expect(readdirSync(dir)).toEqual([]);
    expect(progress.at(-1)?.state).toBe('cancelled');
  });

  it('no pisa un archivo que ya existe en Descargas', async () => {
    const { r, dir } = receiver();
    writeFileSync(join(dir, 'a.txt'), 'viejo');
    r.message({ t: 'file.offer', id: 'f', name: 'a.txt', size: 3, mime: '' });
    r.chunk(new TextEncoder().encode('new'));
    r.message({ t: 'file.end', id: 'f' });
    await r.flushed();
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('viejo');
    expect(readFileSync(join(dir, 'a (1).txt'), 'utf8')).toBe('new');
  });

  it('rechaza archivos de más de 4 GiB', () => {
    const { r, sent } = receiver();
    r.message({ t: 'file.offer', id: 'g', name: 'x', size: 5 * 1024 ** 3, mime: '' });
    expect(sent).toEqual([{ t: 'file.error', id: 'g', code: 'TOO_LARGE' }]);
  });
});

describe('FileSender', () => {
  it('manda oferta, chunks y fin; respeta la ventana sin ack y avanza con file.ack', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-send-'));
    const path = join(dir, 'grande.bin');
    writeFileSync(path, Buffer.alloc(12 * 1024 * 1024, 1));
    const sent: FileMessage[] = [];
    let bytes = 0;
    const s = new FileSender({ send: (m) => sent.push(m), sendChunk: (d) => (bytes += d.byteLength), onProgress: () => undefined });
    expect(s.enqueue(path).ok).toBe(true);
    const offer = sent[0];
    expect(offer).toMatchObject({ t: 'file.offer', name: 'grande.bin', size: 12 * 1024 * 1024 });
    await new Promise((res) => setTimeout(res, 200));
    // Sin acks no pasa de 8 MiB (+ un bloque de lectura).
    expect(bytes).toBeLessThanOrEqual(8 * 1024 * 1024 + 256 * 1024);
    if (offer?.t !== 'file.offer') throw new Error('sin oferta');
    s.message({ t: 'file.ack', id: offer.id, received: bytes });
    await new Promise((res) => setTimeout(res, 200));
    expect(bytes).toBe(12 * 1024 * 1024);
    expect(sent.at(-1)).toEqual({ t: 'file.end', id: offer.id });
  });

  it('rechaza archivos de más de 512 MiB o inexistentes', () => {
    const s = new FileSender({ send: () => undefined, sendChunk: () => undefined, onProgress: () => undefined });
    expect(s.enqueue('C:/no/existe.bin')).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('endurecimiento (auditoría)', () => {
  it('extensiones que Windows interpreta quedan inertes', async () => {
    const { defuseName } = await import('./fileReceiver');
    expect(defuseName('desktop.ini')).toBe('desktop.ini.bloqueado');
    expect(defuseName('x.library-ms')).toBe('x.library-ms.bloqueado');
    expect(defuseName('acceso.LNK')).toBe('acceso.LNK.bloqueado');
    expect(defuseName('foto.jpg')).toBe('foto.jpg');
    expect(sanitizeFileName('CONIN$')).toBe('_CONIN$');
  });

  it('sin espacio libre se rechaza antes de escribir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-full-'));
    const sent: FileMessage[] = [];
    const r = new FileReceiver({ dir: () => dir, send: (m) => sent.push(m), onProgress: () => undefined, freeBytes: () => 100 * 1024 * 1024 });
    r.message({ t: 'file.offer', id: 'h', name: 'a.bin', size: 10, mime: '' });
    expect(sent).toEqual([{ t: 'file.error', id: 'h', code: 'DISK' }]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('marca el archivo como bajado de internet (Mark-of-the-Web)', async () => {
    const { r, dir } = receiver();
    r.message({ t: 'file.offer', id: 'i', name: 'setup.exe', size: 3, mime: '' });
    r.chunk(new Uint8Array(3));
    r.message({ t: 'file.end', id: 'i' });
    await r.flushed();
    if (process.platform === 'win32') expect(readFileSync(join(dir, 'setup.exe:Zone.Identifier'), 'utf8')).toContain('ZoneId=3');
  });

  it('limpia parciales de una caída', async () => {
    const { cleanupPartials } = await import('./fileReceiver');
    const dir = mkdtempSync(join(tmpdir(), 'kr-parts-'));
    writeFileSync(join(dir, 'a.bin.part'), 'x');
    writeFileSync(join(dir, 'b.txt'), 'x');
    cleanupPartials(dir);
    expect(readdirSync(dir)).toEqual(['b.txt']);
  });
});
