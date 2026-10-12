import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { DEVICE_ID_BYTES, SECRET_BYTES } from '@shared/constants';
import { cryptoRandom, randomBase64url, systemClock, type Clock, type RandomSource } from './secureCompare';

/** Cifrado en reposo; en producción es `safeStorage` (DPAPI en Windows). */
export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(encrypted: string): string;
}

export interface PublicDevice {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

const DeviceRecord = z.strictObject({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  lastSeenAt: z.number(),
  secretEnc: z.string(),
});
type DeviceRecord = z.infer<typeof DeviceRecord>;
const DeviceFile = z.strictObject({ version: z.literal(1), devices: z.array(DeviceRecord) });

export class DeviceStore {
  private devices: DeviceRecord[];

  constructor(
    private readonly file: string,
    private readonly cipher: SecretCipher,
    private readonly clock: Clock = systemClock,
    private readonly random: RandomSource = cryptoRandom,
  ) {
    this.devices = this.load();
  }

  list(): PublicDevice[] {
    return this.devices.map(({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt }));
  }

  has(id: string): boolean {
    return this.devices.some((d) => d.id === id);
  }

  create(name: string): { deviceId: string; deviceSecret: string } {
    const deviceId = randomBase64url(DEVICE_ID_BYTES, this.random);
    const deviceSecret = randomBase64url(SECRET_BYTES, this.random);
    const now = this.clock();
    this.devices.push({ id: deviceId, name, createdAt: now, lastSeenAt: now, secretEnc: this.cipher.encrypt(deviceSecret) });
    this.save();
    return { deviceId, deviceSecret };
  }

  /** Secreto descifrado o null si el dispositivo no existe (o el cifrado es ilegible). */
  secretFor(id: string): string | null {
    const record = this.devices.find((d) => d.id === id);
    if (!record) return null;
    try {
      return this.cipher.decrypt(record.secretEnc);
    } catch {
      return null;
    }
  }

  nameOf(id: string): string | null {
    return this.devices.find((d) => d.id === id)?.name ?? null;
  }

  touch(id: string): void {
    const record = this.devices.find((d) => d.id === id);
    if (!record) return;
    record.lastSeenAt = this.clock();
    this.save();
  }

  revoke(id: string): boolean {
    const before = this.devices.length;
    this.devices = this.devices.filter((d) => d.id !== id);
    if (this.devices.length === before) return false;
    this.save();
    return true;
  }

  private load(): DeviceRecord[] {
    if (!existsSync(this.file)) return [];
    try {
      return DeviceFile.parse(JSON.parse(readFileSync(this.file, 'utf8'))).devices;
    } catch {
      // Archivo corrupto: se aparta (no se borra) y se arranca sin dispositivos; hay que volver a emparejar.
      renameSync(this.file, `${this.file}.corrupt-${this.clock()}`);
      return [];
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, devices: this.devices }, null, 2), { mode: 0o600 });
    renameSync(tmp, this.file);
  }
}
