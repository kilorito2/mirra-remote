import { describe, expect, it } from 'vitest';
import { FileMessage } from '@shared/protocol';
import { PhoneFiles, type FileChannel, type PhoneTransfer } from './PhoneFiles';

class FakeChannel implements FileChannel {
  readyState: RTCDataChannelState = 'open';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onbufferedamountlow: FileChannel['onbufferedamountlow'] = null;
  readonly json: FileMessage[] = [];
  bytes = 0;
  send(data: string | ArrayBuffer): void {
    if (typeof data === 'string') this.json.push(FileMessage.parse(JSON.parse(data)));
    else this.bytes += data.byteLength;
  }
}

function setup() {
  const ch = new FakeChannel();
  const saved: { blob: Blob; name: string }[] = [];
  let last: PhoneTransfer[] = [];
  let n = 0;
  const files = new PhoneFiles({ channel: () => ch, onChange: (t) => (last = t), save: (blob, name) => saved.push({ blob, name }), newId: () => `id${++n}` });
  return { files, ch, saved, transfers: () => last };
}

const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe('PhoneFiles: celular → PC', () => {
  it('oferta, bytes en chunks y fin', async () => {
    const { files, ch } = setup();
    files.send(new Blob([new Uint8Array(40_000)]), 'foto.jpg');
    await wait(50);
    expect(ch.json[0]).toMatchObject({ t: 'file.offer', id: 'id1', name: 'foto.jpg', size: 40_000 });
    expect(ch.bytes).toBe(40_000);
    expect(ch.json.at(-1)).toEqual({ t: 'file.end', id: 'id1' });
    files.receive(JSON.stringify({ t: 'file.done', id: 'id1' }));
  });

  it('se frena con 8 MiB sin confirmar y sigue con el ack', async () => {
    const { files, ch } = setup();
    files.send(new Blob([new Uint8Array(10 * 1024 * 1024)]), 'video.mp4');
    await wait(300);
    expect(ch.bytes).toBe(8 * 1024 * 1024);
    files.receive(JSON.stringify({ t: 'file.ack', id: 'id1', received: 8 * 1024 * 1024 }));
    await wait(300);
    expect(ch.bytes).toBe(10 * 1024 * 1024);
  });

  it('cancelar avisa a la PC y deja de mandar', async () => {
    const { files, ch, transfers } = setup();
    files.send(new Blob([new Uint8Array(10 * 1024 * 1024)]), 'v.mp4');
    await wait(100);
    files.cancel('id1');
    const sent = ch.bytes;
    await wait(100);
    expect(ch.bytes).toBe(sent);
    expect(ch.json.at(-1)).toEqual({ t: 'file.cancel', id: 'id1' });
    expect(transfers()[0]?.state).toBe('cancelled');
  });
});

describe('PhoneFiles: PC → celular', () => {
  it('arma el Blob, confirma cada MiB y lo guarda', () => {
    const { files, ch, saved } = setup();
    files.receive(JSON.stringify({ t: 'file.offer', id: 'p1', name: 'informe.pdf', size: 2 * 1024 * 1024, mime: 'application/pdf' }));
    for (let i = 0; i < 128; i++) files.receive(new ArrayBuffer(16 * 1024));
    files.receive(JSON.stringify({ t: 'file.end', id: 'p1' }));
    expect(ch.json.filter((m) => m.t === 'file.ack')).toHaveLength(2);
    expect(ch.json.at(-1)).toEqual({ t: 'file.done', id: 'p1' });
    expect(saved[0]?.name).toBe('informe.pdf');
    expect(saved[0]?.blob.size).toBe(2 * 1024 * 1024);
  });

  it('bytes de más o de menos no se guardan', () => {
    const { files, ch, saved } = setup();
    files.receive(JSON.stringify({ t: 'file.offer', id: 'p2', name: 'a', size: 10, mime: '' }));
    files.receive(new ArrayBuffer(11));
    expect(ch.json.at(-1)).toEqual({ t: 'file.error', id: 'p2', code: 'SIZE_MISMATCH' });
    files.receive(JSON.stringify({ t: 'file.offer', id: 'p3', name: 'b', size: 10, mime: '' }));
    files.receive(new ArrayBuffer(5));
    files.receive(JSON.stringify({ t: 'file.end', id: 'p3' }));
    expect(saved).toEqual([]);
  });

  it('rechaza más de 512 MiB (va a memoria)', () => {
    const { files, ch } = setup();
    files.receive(JSON.stringify({ t: 'file.offer', id: 'p4', name: 'x', size: 600 * 1024 * 1024, mime: '' }));
    expect(ch.json).toEqual([{ t: 'file.error', id: 'p4', code: 'TOO_LARGE' }]);
  });
});
