import { safeStorage } from 'electron';
import type { SecretCipher } from './deviceStore';

/** `safeStorage` = DPAPI en Windows: solo el mismo usuario de Windows puede descifrar. */
export function createSafeStorageCipher(): SecretCipher {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El cifrado del sistema (safeStorage) no está disponible.');
  }
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (encrypted) => safeStorage.decryptString(Buffer.from(encrypted, 'base64')),
  };
}
