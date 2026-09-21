import { encryptToken, decryptToken, isEncrypted } from '../src/common/security/tokenCrypto';

describe('token crypto', () => {
  test('encrypt/decrypt roundtrip', () => {
    const cipher = encryptToken('long-lived-token');
    expect(isEncrypted(cipher)).toBe(true);
    expect(decryptToken(cipher)).toBe('long-lived-token');
  });

  test('legacy plaintext passes through', () => {
    expect(decryptToken('plain-token')).toBe('plain-token');
    expect(decryptToken(undefined)).toBeUndefined();
    expect(isEncrypted('plain-token')).toBe(false);
  });

  test('tampered ciphertext fails closed', () => {
    const cipher = encryptToken('secret');
    const tampered = cipher.slice(0, -2) + 'ff';
    expect(decryptToken(tampered)).toBeUndefined();
  });
});
