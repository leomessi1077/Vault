// All encryption happens in the browser. The master password never leaves this device.
const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// master password -> PBKDF2 -> HKDF -> { AES key (stays here), authHash (sent to server) }
export async function deriveKeys(email, masterPassword) {
  const pw = await crypto.subtle.importKey('raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveBits']);
  const master = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: enc.encode('vault:' + email.trim().toLowerCase()) },
    pw,
    256
  );
  const hk = await crypto.subtle.importKey('raw', master, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const salt = new Uint8Array(32);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('enc') },
    hk,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const authBits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('auth') }, hk, 256);
  return { key, authHash: toHex(authBits) };
}

export async function encryptJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), data: toB64(ct) };
}

export async function decryptJSON(key, { iv, data }) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv) }, key, fromB64(data));
  return JSON.parse(dec.decode(pt));
}

export function generatePassword(length = 20) {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+?';
  const r = new Uint32Array(length);
  crypto.getRandomValues(r);
  return Array.from(r, (n) => chars[n % chars.length]).join('');
}
