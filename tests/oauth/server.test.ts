import { describe, it } from 'node:test';
import assert from 'node:assert';
import net from 'node:net';
import { getAvailablePort, startCallbackServer } from '../../src/oauth/server.js';

describe('OAuth Callback Server & Dynamic Port Selection', () => {
  it('should find next available port when the initial port is busy', async () => {
    const testPort = 19123;
    const blockerServer = net.createServer();
    await new Promise<void>((resolve) => blockerServer.listen(testPort, () => resolve()));

    const nextPort = await getAvailablePort(testPort);
    assert.strictEqual(nextPort, testPort + 1, 'Should increment to next available port');

    await new Promise<void>((resolve) => blockerServer.close(() => resolve()));
  });

  it('should receive authorization code and serve success HTML page on valid callback', async () => {
    const callbackServer = await startCallbackServer();
    const expectedCode = 'auth_code_secret_xyz_987';

    const codePromise = callbackServer.waitForCode();
    const res = await fetch(`${callbackServer.redirectUri}?code=${expectedCode}`);

    assert.strictEqual(res.status, 200);
    const htmlBody = await res.text();
    assert.ok(htmlBody.includes('Authentication Successful!'));

    const receivedCode = await codePromise;
    assert.strictEqual(receivedCode, expectedCode);

    await callbackServer.close();
  });

  it('should handle OAuth error redirect with 400 and reject promise with error description', async () => {
    const callbackServer = await startCallbackServer();
    const codePromise = callbackServer.waitForCode();

    const res = await fetch(
      `${callbackServer.redirectUri}?error=access_denied&error_description=User+declined+authorization`
    );

    assert.strictEqual(res.status, 400);
    const htmlBody = await res.text();
    assert.ok(htmlBody.includes('Authentication Failed'));
    assert.ok(htmlBody.includes('User declined authorization'));

    await assert.rejects(codePromise, /User declined authorization/);
    await callbackServer.close();
  });

  it('should reject when callback is invoked without authorization code or error parameters', async () => {
    const callbackServer = await startCallbackServer();
    const codePromise = callbackServer.waitForCode();

    const res = await fetch(`${callbackServer.redirectUri}`);
    assert.strictEqual(res.status, 400);

    const htmlBody = await res.text();
    assert.ok(htmlBody.includes('Authorization Code Missing'));

    await assert.rejects(codePromise, /Missing authorization code in callback/);
    await callbackServer.close();
  });

  it('should return 404 for unhandled routes', async () => {
    const callbackServer = await startCallbackServer();

    const res = await fetch(`http://localhost:${callbackServer.port}/non-existent-route`);
    assert.strictEqual(res.status, 404);

    await callbackServer.close();
  });
});
