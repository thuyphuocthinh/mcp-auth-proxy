import crypto from 'node:crypto';

export interface PKCEPair {
  verifier: string;
  challenge: string;
  method: 'S256';
}

export function base64url(buffer: Buffer): string {
  return buffer.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function generatePKCE(): PKCEPair {
  // RFC 7636: verifier must have minimum 43 characters and maximum 128 characters
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return {
    verifier,
    challenge,
    method: 'S256'
  };
}
