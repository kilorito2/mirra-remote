import { base64urlToBytes, bytesToBase64url } from './base64url';
import { HMAC_CONTEXT } from './constants';

/**
 * HMAC-SHA256(deviceSecret, "kr-auth-v1:" + nonce) en base64url, con WebCrypto.
 * La misma función corre en el celular (`crypto.subtle`, requiere contexto seguro) y en main (Node).
 */
export async function computeAuthHmac(deviceSecret: string, nonce: string): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', base64urlToBytes(deviceSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await subtle.sign('HMAC', key, new TextEncoder().encode(HMAC_CONTEXT + nonce));
  return bytesToBase64url(new Uint8Array(mac));
}

/** CryptoKey sin depender de lib.dom (este módulo también compila para Node). */
type HmacKey = Awaited<ReturnType<typeof globalThis.crypto.subtle.importKey>>;

/** Igual que computeAuthHmac pero con una CryptoKey (no exportable) ya importada. */
export async function signAuthNonce(key: HmacKey, nonce: string): Promise<string> {
  const mac = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(HMAC_CONTEXT + nonce));
  return bytesToBase64url(new Uint8Array(mac));
}
