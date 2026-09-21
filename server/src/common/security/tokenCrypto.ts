import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '../utils/logger';

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const hex = process.env.META_TOKEN_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  if (!hex) {
    logger.warn('META_TOKEN_KEY not set — using insecure dev fallback. Set a 64-char hex key for any shared environment.');
  }
  return Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return PREFIX + iv.toString('hex') + ':' + ciphertext.toString('hex') + ':' + cipher.getAuthTag().toString('hex');
}

export function decryptToken(stored?: string): string | undefined {
  if (!stored) return undefined;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext (dev/test fixtures)
  try {
    const [ivHex, ctHex, tagHex] = stored.slice(PREFIX.length).split(':');
    if (!ivHex || !ctHex || !tagHex) return undefined;
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(ctHex, 'hex')), decipher.final()]).toString('utf8');
  } catch {
    logger.error('Token decryption failed — wrong META_TOKEN_KEY?');
    return undefined;
  }
}

export function isEncrypted(value?: string): boolean {
  return !!value && value.startsWith(PREFIX);
}
