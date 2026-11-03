import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TokenStore } from '../../src/store/token-store.js';

describe('TokenStore & Silent Refresh Logic', () => {
  const tempDir = path.join(os.tmpdir(), `mcp-token-store-test-${Date.now()}-${Math.random()}`);
  const storeFilePath = path.join(tempDir, 'tokens.json');
  let store: TokenStore;

  beforeEach(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    store = new TokenStore(storeFilePath);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should persist and retrieve tokens across different resources independently', () => {
    store.saveToken('https://mcp.alpha.com', {
      accessToken: 'token_alpha',
      refreshToken: 'refresh_alpha',
      expiresAt: Date.now() + 3600_000,
      tokenType: 'Bearer',
      scope: 'read'
    });

    store.saveToken('https://mcp.beta.com', {
      accessToken: 'token_beta',
      expiresAt: Date.now() + 7200_000
    });

    const alpha = store.getToken('https://mcp.alpha.com');
    const beta = store.getToken('https://mcp.beta.com');
    const gamma = store.getToken('https://mcp.gamma.com');

    assert.strictEqual(alpha?.accessToken, 'token_alpha');
    assert.strictEqual(alpha?.refreshToken, 'refresh_alpha');
    assert.strictEqual(alpha?.scope, 'read');

    assert.strictEqual(beta?.accessToken, 'token_beta');
    assert.strictEqual(beta?.refreshToken, undefined);

    assert.strictEqual(gamma, null);
  });

  it('should handle missing or corrupted JSON file gracefully without throwing', () => {
    const freshStore = new TokenStore(path.join(tempDir, 'does-not-exist.json'));
    assert.strictEqual(freshStore.getToken('any'), null);

    const corruptPath = path.join(tempDir, 'corrupt.json');
    fs.writeFileSync(corruptPath, '{ malformed json: not valid !!');
    const corruptStore = new TokenStore(corruptPath);
    assert.strictEqual(corruptStore.getToken('any'), null);
  });

  it('should detect tokens expiring within customizable buffer threshold', () => {
    const now = Date.now();

    const expiringIn3Min = { accessToken: 'a', expiresAt: now + 180_000 };
    const expiringIn7Min = { accessToken: 'b', expiresAt: now + 420_000 };

    // Default 5-minute buffer (300,000ms)
    assert.strictEqual(store.isExpiringSoon(expiringIn3Min), true);
    assert.strictEqual(store.isExpiringSoon(expiringIn7Min), false);

    // Custom 10-minute buffer (600,000ms)
    assert.strictEqual(store.isExpiringSoon(expiringIn7Min, 600_000), true);
  });

  it('refreshToken should exchange refresh_token for a new access_token and update storage', async () => {
    const resource = 'https://mcp.example.com';
    const tokenEndpoint = 'https://api.example.com/oauth/token';
    const clientId = 'client_xyz';

    store.saveToken(resource, {
      accessToken: 'stale_token',
      refreshToken: 'current_refresh_token',
      expiresAt: Date.now() + 60_000
    });

    let requestBody: URLSearchParams | undefined;
    const mockFetch: typeof fetch = async (_input, init) => {
      requestBody = new URLSearchParams(init?.body as string);
      return new Response(
        JSON.stringify({
          access_token: 'freshly_refreshed_access_token',
          refresh_token: 'rotated_refresh_token',
          expires_in: 3600,
          token_type: 'Bearer'
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const newAccessToken = await store.refreshToken({
      resource,
      tokenEndpoint,
      clientId,
      fetchFn: mockFetch,
      log: () => {}
    });

    assert.strictEqual(newAccessToken, 'freshly_refreshed_access_token');
    assert.strictEqual(requestBody?.get('grant_type'), 'refresh_token');
    assert.strictEqual(requestBody?.get('refresh_token'), 'current_refresh_token');
    assert.strictEqual(requestBody?.get('client_id'), clientId);

    const updated = store.getToken(resource);
    assert.strictEqual(updated?.accessToken, 'freshly_refreshed_access_token');
    assert.strictEqual(updated?.refreshToken, 'rotated_refresh_token');
    assert.ok(updated.expiresAt > Date.now() + 3500_000);
  });

  it('refreshToken should return null when refresh_token is missing or revoked', async () => {
    const resource = 'https://mcp.example.com';
    store.saveToken(resource, {
      accessToken: 'token_no_refresh',
      expiresAt: Date.now() + 60_000
    });

    const res1 = await store.refreshToken({
      resource,
      tokenEndpoint: 'https://auth.com/token',
      clientId: 'id',
      log: () => {}
    });
    assert.strictEqual(res1, null, 'Should return null when token has no refresh_token');

    // Server returns 400 invalid_grant
    store.saveToken(resource, {
      accessToken: 'token',
      refreshToken: 'bad_refresh',
      expiresAt: Date.now() + 60_000
    });

    const mockFetch400: typeof fetch = async () => new Response('invalid_grant', { status: 400 });
    const res2 = await store.refreshToken({
      resource,
      tokenEndpoint: 'https://auth.com/token',
      clientId: 'id',
      fetchFn: mockFetch400,
      log: () => {}
    });
    assert.strictEqual(res2, null, 'Should return null when server rejects refresh request');
  });

  it('getOrRefreshToken should return valid token without network call if not expiring soon', async () => {
    const resource = 'https://mcp.example.com';
    store.saveToken(resource, {
      accessToken: 'long_lived_token',
      expiresAt: Date.now() + 1800_000 // 30 mins
    });

    let networkHit = false;
    const mockFetch: typeof fetch = async () => {
      networkHit = true;
      return new Response('{}');
    };

    const token = await store.getOrRefreshToken({
      resource,
      tokenEndpoint: 'https://auth.com/token',
      clientId: 'id',
      fetchFn: mockFetch,
      log: () => {}
    });

    assert.strictEqual(token, 'long_lived_token');
    assert.strictEqual(networkHit, false, 'Must not make HTTP request when token is still valid');
  });

  it('getOrRefreshToken should fallback to unexpired token if silent refresh fails', async () => {
    const resource = 'https://mcp.example.com';
    store.saveToken(resource, {
      accessToken: 'still_working_for_2_minutes',
      refreshToken: 'broken_refresh',
      expiresAt: Date.now() + 120_000 // 2 mins remaining (< 5m buffer, but > 0s)
    });

    const mockFailingFetch: typeof fetch = async () => new Response('Server Error', { status: 500 });

    const token = await store.getOrRefreshToken({
      resource,
      tokenEndpoint: 'https://auth.com/token',
      clientId: 'id',
      fetchFn: mockFailingFetch,
      log: () => {}
    });

    assert.strictEqual(token, 'still_working_for_2_minutes', 'Should fallback to remaining validity');
  });
});
