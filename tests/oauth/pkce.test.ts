import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { generatePKCE, base64url } from '../../src/oauth/pkce.js';

describe('PKCE Generator (RFC 7636)', () => {
  it('should generate valid base64url strings without standard base64 padding or symbols', () => {
    const { verifier, challenge, method } = generatePKCE();

    assert.strictEqual(method, 'S256');
    assert.ok(verifier.length >= 43 && verifier.length <= 128, 'Verifier length must be between 43 and 128 characters');
    assert.match(verifier, /^[A-Za-z0-9_-]+$/, 'Verifier must only contain base64url characters');
    assert.match(challenge, /^[A-Za-z0-9_-]+$/, 'Challenge must only contain base64url characters');
    assert.ok(!verifier.includes('+') && !verifier.includes('/') && !verifier.includes('='));
    assert.ok(!challenge.includes('+') && !challenge.includes('/') && !challenge.includes('='));
  });

  it('should compute the exact SHA-256 hash challenge corresponding to the verifier', () => {
    const { verifier, challenge } = generatePKCE();
    const expectedChallenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    assert.strictEqual(challenge, expectedChallenge, 'Challenge must strictly equal base64url(sha256(verifier))');
  });

  it('should produce high entropy unique pairs across multiple invocations', () => {
    const verifiers = new Set<string>();
    const challenges = new Set<string>();
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const pair = generatePKCE();
      verifiers.add(pair.verifier);
      challenges.add(pair.challenge);
    }

    assert.strictEqual(verifiers.size, iterations, 'All generated verifiers must be distinct');
    assert.strictEqual(challenges.size, iterations, 'All generated challenges must be distinct');
  });

  it('should correctly format known RFC 7636 test vectors', () => {
    // RFC 7636 Appendix B test vector
    const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const hash = crypto.createHash('sha256').update(testVerifier).digest();
    const computedChallenge = base64url(hash);

    assert.strictEqual(computedChallenge, expectedChallenge, 'base64url must match standard RFC 7636 test vector');
  });
});
