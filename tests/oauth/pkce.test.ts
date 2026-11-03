import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { generatePKCE, base64url } from '../../src/oauth/pkce.js';

describe('PKCE Generator (RFC 7636)', () => {
  it('phải sinh verifier và challenge đúng chuẩn Base64URL', () => {
    const { verifier, challenge, method } = generatePKCE();

    assert.strictEqual(method, 'S256');
    assert.ok(verifier.length >= 43 && verifier.length <= 128, 'Verifier phải dài từ 43 đến 128 ký tự');
    assert.ok(!verifier.includes('+') && !verifier.includes('/') && !verifier.includes('='), 'Verifier không được chứa ký tự base64 thông thường');
    assert.ok(!challenge.includes('+') && !challenge.includes('/') && !challenge.includes('='), 'Challenge không được chứa ký tự base64 thông thường');

    // Verify hash SHA256 matches
    const expectedChallenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    assert.strictEqual(challenge, expectedChallenge, 'Challenge phải khớp chính xác SHA-256 của Verifier');
  });

  it('mỗi lần sinh phải là ngẫu nhiên và khác nhau', () => {
    const pair1 = generatePKCE();
    const pair2 = generatePKCE();
    assert.notStrictEqual(pair1.verifier, pair2.verifier);
    assert.notStrictEqual(pair1.challenge, pair2.challenge);
  });
});
