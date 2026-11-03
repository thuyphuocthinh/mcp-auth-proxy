import { describe, it } from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import { getAvailablePort, startCallbackServer } from '../../src/oauth/server.js';

describe('OAuth Callback Server', () => {
  it('phải tự động tìm cổng rảnh khi cổng chỉ định bị chiếm', async () => {
    const testPort = 19876;
    const blocker = net.createServer();
    await new Promise<void>((r) => blocker.listen(testPort, () => r()));

    const available = await getAvailablePort(testPort);
    assert.strictEqual(available, testPort + 1);

    await new Promise<void>((r) => blocker.close(() => r()));
  });

  it('phải nhận và parse chính xác Authorization Code từ URL callback', async () => {
    const callbackServer = await startCallbackServer();
    const testCode = 'auth_code_xyz123';

    // Giả lập browser redirect về callback
    const res = await fetch(`${callbackServer.redirectUri}?code=${testCode}`);
    assert.strictEqual(res.status, 200);

    const receivedCode = await callbackServer.waitForCode();
    assert.strictEqual(receivedCode, testCode);

    await callbackServer.close();
  });

  it('phải trả về lỗi 400 nếu callback chứa tham số error', async () => {
    const callbackServer = await startCallbackServer();
    const codePromise = callbackServer.waitForCode();

    // Giả lập OAuth error redirect
    const res = await fetch(`${callbackServer.redirectUri}?error=access_denied&error_description=User+cancelled`);
    assert.strictEqual(res.status, 400);

    await assert.rejects(codePromise, /User cancelled/);

    await callbackServer.close();
  });
});
