import { z } from 'zod';
import { base64urlToBytes } from '@shared/base64url';
import { DeviceId, DeviceSecret } from '@shared/protocol';

/**
 * Credenciales del dispositivo. El `deviceId` va en localStorage; el secreto se importa como CryptoKey HMAC
 * **no exportable** y se guarda en IndexedDB: un script en el mismo origen (p. ej. tras aceptar el certificado
 * de un atacante en la LAN) puede firmar mientras esté ahí, pero no puede leer el secreto para usarlo después.
 */
export interface Credentials {
  deviceId: string;
  key: CryptoKey;
}

export interface CredentialStore {
  load(): Promise<Credentials | null>;
  save(deviceId: string, deviceSecret: string): Promise<Credentials>;
  clear(): Promise<void>;
}

export const LS_KEY = 'kr.credentials.v1';
const DB = 'kr';
const STORE = 'keys';

const Stored = z.strictObject({ deviceId: DeviceId });
/** Formato de antes (secreto en claro): se migra al cargar. */
const Legacy = z.strictObject({ deviceId: DeviceId, deviceSecret: DeviceSecret });

export function importSecret(deviceSecret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', base64urlToBytes(deviceSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

function openDb(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
}

async function idbRequest<T>(idb: IDBFactory, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb(idb);
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    });
  } finally {
    db.close();
  }
}

export function browserCredentialStore(storage: Storage = localStorage, idb: IDBFactory | null = 'indexedDB' in globalThis ? globalThis.indexedDB : null): CredentialStore {
  // Sin IndexedDB (modo privado restringido): la clave vive solo en memoria y hay que emparejar cada vez.
  let memory: Credentials | null = null;
  const putKey = async (deviceId: string, key: CryptoKey) => {
    memory = { deviceId, key };
    if (idb) await idbRequest(idb, 'readwrite', (s) => s.put(key, deviceId)).catch(() => undefined);
    storage.setItem(LS_KEY, JSON.stringify({ deviceId }));
    return memory;
  };
  return {
    async load() {
      let raw: unknown;
      try {
        raw = JSON.parse(storage.getItem(LS_KEY) ?? 'null');
      } catch {
        return null;
      }
      const legacy = Legacy.safeParse(raw);
      if (legacy.success) return putKey(legacy.data.deviceId, await importSecret(legacy.data.deviceSecret));
      const stored = Stored.safeParse(raw);
      if (!stored.success) return null;
      if (memory?.deviceId === stored.data.deviceId) return memory;
      if (!idb) return null;
      const key = await idbRequest<unknown>(idb, 'readonly', (s) => s.get(stored.data.deviceId)).catch(() => null);
      return key instanceof CryptoKey ? { deviceId: stored.data.deviceId, key } : null;
    },
    async save(deviceId, deviceSecret) {
      return putKey(deviceId, await importSecret(deviceSecret));
    },
    async clear() {
      memory = null;
      storage.removeItem(LS_KEY);
      if (idb) await idbRequest(idb, 'readwrite', (s) => s.clear()).catch(() => undefined);
    },
  };
}

/** Para tests y para cuando no hay almacenamiento persistente. */
export function memoryCredentialStore(): CredentialStore {
  let creds: Credentials | null = null;
  return {
    load: () => Promise.resolve(creds),
    async save(deviceId, deviceSecret) {
      creds = { deviceId, key: await importSecret(deviceSecret) };
      return creds;
    },
    clear: () => {
      creds = null;
      return Promise.resolve();
    },
  };
}
