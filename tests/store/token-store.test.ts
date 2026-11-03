import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { TokenStore } from '../../src/store/token-store.js';

describe('TokenStore & Silent Refresh', () => {
  const testDir = path.join(os.tmpdir(), `mcp-oauth-test-${Date.now()}`);
  const testFile = path.join(testDir, 'tokens.json');
  let store: TokenStore;

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    store = new TokenStore(testFile);
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('phải lưu trữ và đọc lại token chính xác', () => {
    store.saveToken('https://mcp.200lab.io/mcp/learner', {
      accessToken: 'acc_token_123',
      refreshToken: 'ref_token_456',
      expiresAt: Date.now() + 3600_000,
      tokenType: 'Bearer',
      scope: 'learner'
    });

    const token = store.getToken('https://mcp.200lab.io/mcp/learner');
    assert.ok(token);
    assert.strictEqual(token.accessToken, 'acc_token_123');
    assert.strictEqual(token.refreshToken, 'ref_token_456');
    assert.strictEqual(token.scope, 'learner');
  });

  it('phải phát hiện token sắp hết hạn trong khoảng đệm 5 phút', () => {
    const expiringSoon = {
      accessToken: 'token_exp',
      expiresAt: Date.now() + 180_000 // Còn 3 phút
    };
    assert.strictEqual(store.isExpiringSoon(expiringSoon), true);

    const stillValid = {
      accessToken: 'token_valid',
      expiresAt: Date.now() + 600_000 // Còn 10 phút
    };
    assert.strictEqual(store.isExpiringSoon(stillValid), false);
  });

  it('phải gọi Silent Refresh và tự động cập nhật token mới vào storage', async () => {
    const resource = 'https://mcp.example.com/learner';
    const tokenEndpoint = 'https://api.example.com/oauth/token';
    const clientId = 'client_123';

    store.saveToken(resource, {
      accessToken: 'old_access_token',
      refreshToken: 'valid_refresh_token',
      expiresAt: Date.now() + 60_000 // Còn 1 phút
    });

    let capturedBody: any;
    const mockFetch: typeof fetch = async (_input, init) => {
      capturedBody = new URLSearchParams(init?.body as string);
      return new Response(
        JSON.stringify({
          access_token: 'new_refreshed_access_token',
          refresh_token: 'new_rotated_refresh_token',
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

    assert.strictEqual(newAccessToken, 'new_refreshed_access_token');
    assert.strictEqual(capturedBody.get('grant_type'), 'refresh_token');
    assert.strictEqual(capturedBody.get('refresh_token'), 'valid_refresh_token');
    assert.strictEqual(capturedBody.get('client_id'), clientId);

    // Kiểm tra token trong file đã được cập nhật
    const updated = store.getToken(resource);
    assert.strictEqual(updated?.accessToken, 'new_refreshed_access_token');
    assert.strictEqual(updated?.refreshToken, 'new_rotated_refresh_token');
    assert.ok(updated.expiresAt > Date.now() + 3500_000);
  });

  it('getOrRefreshToken phải tự động refresh khi token sắp hết hạn', async () => {
    const resource = 'https://mcp.example.com/learner';
    const tokenEndpoint = 'https://api.example.com/oauth/token';
    const clientId = 'client_123';

    store.saveToken(resource, {
      accessToken: 'old_token',
      refreshToken: 'my_refresh',
      expiresAt: Date.now() + 100_000 // Sắp hết hạn (< 5 phút)
    });

    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          access_token: 'brand_new_token',
          expires_in: 3600
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const result = await store.getOrRefreshToken({
      resource,
      tokenEndpoint,
      clientId,
      fetchFn: mockFetch,
      log: () => {}
    });

    assert.strictEqual(result, 'brand_new_token');
  });

  it('getOrRefreshToken phải tái sử dụng token ngay lập tức nếu còn hạn trên 5 phút mà không gọi fetch', async () => {
    const resource = 'https://mcp.example.com/learner';
    store.saveToken(resource, {
      accessToken: 'good_token',
      expiresAt: Date.now() + 1800_000 // Còn tận 30 phút
    });

    let fetchCalled = false;
    const mockFetch: typeof fetch = async () => {
      fetchCalled = true;
      return new Response('{}');
    };

    const result = await store.getOrRefreshToken({
      resource,
      tokenEndpoint: 'https://any.com',
      clientId: 'any',
      fetchFn: mockFetch,
      log: () => {}
    });

    assert.strictEqual(result, 'good_token');
    assert.strictEqual(fetchCalled, false, 'Không được gọi fetch khi token còn hạn dài');
  });
});
