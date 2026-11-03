import { describe, it } from 'node:test';
import assert from 'node:assert';
import { registerDynamicClient, resolveClientId } from '../../src/oauth/client-registration.js';

describe('OAuth Client Registration (RFC 7591)', () => {
  const redirectUri = 'http://localhost:8080/callback';
  const registrationEndpoint = 'https://api.example.com/oauth/register';

  it('should post client metadata and return issued client_id', async () => {
    let capturedBody: any;
    let capturedHeaders: HeadersInit | undefined;

    const mockFetch: typeof fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          client_id: 'client_registered_777',
          client_name: capturedBody.client_name,
          redirect_uris: capturedBody.redirect_uris
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const clientId = await registerDynamicClient(registrationEndpoint, redirectUri, 'custom-proxy', mockFetch);

    assert.strictEqual(clientId, 'client_registered_777');
    assert.strictEqual(capturedBody.client_name, 'custom-proxy');
    assert.deepStrictEqual(capturedBody.redirect_uris, [redirectUri]);
    assert.strictEqual((capturedHeaders as Record<string, string>)['Content-Type'], 'application/json');
  });

  it('should throw an informative error when registration server returns non-200', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Invalid client metadata', { status: 400 });
    };

    await assert.rejects(
      async () => {
        await registerDynamicClient(registrationEndpoint, redirectUri, 'proxy', mockFetch);
      },
      /Dynamic Client Registration failed \(HTTP 400\): Invalid client metadata/
    );
  });

  it('should throw an error when server response is missing client_id', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    };

    await assert.rejects(
      async () => {
        await registerDynamicClient(registrationEndpoint, redirectUri, 'proxy', mockFetch);
      },
      /Registration response missing client_id/
    );
  });

  it('resolveClientId should prioritize explicitClientId when provided by user', async () => {
    const logs: string[] = [];
    const clientId = await resolveClientId({
      registrationEndpoint,
      redirectUri,
      explicitClientId: 'user_provided_fixed_id',
      log: (msg) => logs.push(msg)
    });

    assert.strictEqual(clientId, 'user_provided_fixed_id');
    assert.ok(logs.some((l) => l.includes('Using configured Client ID: user_provided_fixed_id')));
  });

  it('resolveClientId should dynamically register when no explicit ID provided', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ client_id: 'auto_gen_123' }), { status: 200 });
    };

    const clientId = await resolveClientId({
      registrationEndpoint,
      redirectUri,
      fetchFn: mockFetch,
      log: () => {}
    });

    assert.strictEqual(clientId, 'auto_gen_123');
  });

  it('resolveClientId should throw an error if registration endpoint is unavailable and no explicit ID given', async () => {
    await assert.rejects(
      async () => {
        await resolveClientId({
          redirectUri,
          log: () => {}
        });
      },
      /Server does not support Dynamic Client Registration \(RFC 7591\)\. Please provide an explicit --client-id <id>/
    );
  });
});
