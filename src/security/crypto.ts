const encoder = new TextEncoder();

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function unbase64(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function seal(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), encoder.encode(value));
  return `${base64(iv)}.${base64(new Uint8Array(encrypted))}`;
}

export async function openSeal(value: string, secret: string): Promise<string> {
  const [iv, encrypted] = value.split('.');
  if (!iv || !encrypted) throw new Error('invalid sealed value');
  const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64(iv) }, await aesKey(secret), unbase64(encrypted));
  return new TextDecoder().decode(out);
}

export async function sha256(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...digest].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hex(value: string): Uint8Array { return Uint8Array.from(value.match(/.{2}/g) ?? [], pair => parseInt(pair, 16)); }

export async function verifyEd25519(publicKey: string, signature: string, message: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw', hex(publicKey), { name: 'Ed25519' }, false, ['verify']);
    return crypto.subtle.verify('Ed25519', key, hex(signature), encoder.encode(message));
  } catch {
    return false;
  }
}
