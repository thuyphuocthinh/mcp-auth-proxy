import { describe, it } from 'node:test';
import assert from 'node:assert';
import { registerDynamicClient, resolveClientId } from '../../src/oauth/client-registration.js';

describe('OAuth Client Registration (RFC 7591)', () => {
  const redirectUri = 'http://localhost:8080/callback';
  const registrationEndpoint = 'https://api.example.com/oauth/register';

  it('phải gửi request JSON đăng ký client và nhận client_id thành công', async () => {
    let capturedBody: any;

    const mockFetch: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          client_id: 'client_gen_9999',
          client_name: capturedBody.client_name,
          redirect_uris: capturedBody.redirect_uris
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const clientId = await registerDynamicClient(registrationEndpoint, redirectUri, 'test-proxy', mockFetch);

    assert.strictEqual(clientId, 'client_gen_9999');
    assert.strictEqual(capturedBody.client_name, 'test-proxy');
    assert.deepStrictEqual(capturedBody.redirect_uris, [redirectUri]);
  });

  it('phải ưu tiên explicitClientId khi người dùng truyền tham số', async () => {
    const logs: string[] = [];
    const clientId = await resolveClientId({
      registrationEndpoint,
      redirectUri,
      explicitClientId: 'custom_fixed_client_id',
      log: (msg) => logs.push(msg)
    });

    assert.strictEqual(clientId, 'custom_fixed_client_id');
    assert.ok(logs.some((l) => l.includes('Sử dụng Client ID được cấu hình')));
  });

  it('phải báo lỗi rõ ràng nếu không có registration_endpoint và không có client_id', async () => {
    await assert.rejects(
      async () => {
        await resolveClientId({
          redirectUri,
          log: () => {}
        });
      },
      /Server không hỗ trợ Dynamic Client Registration/
    );
  });
});
