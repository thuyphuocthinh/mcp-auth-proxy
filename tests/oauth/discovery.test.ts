import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractResourceMetadataUrl, discoverOAuth } from '../../src/oauth/discovery.js';

describe('OAuth Metadata Discovery', () => {
  it('phải trích xuất chính xác resource_metadata từ WWW-Authenticate header', () => {
    const header = 'Bearer resource_metadata="https://mcp.200lab.io/.well-known/oauth-protected-resource/mcp/learner"';
    const url = extractResourceMetadataUrl(header);
    assert.strictEqual(url, 'https://mcp.200lab.io/.well-known/oauth-protected-resource/mcp/learner');
  });

  it('phải trả về null nếu header không hợp lệ', () => {
    assert.strictEqual(extractResourceMetadataUrl(null), null);
    assert.strictEqual(extractResourceMetadataUrl('Basic realm="Access"'), null);
  });

  it('phải thực hiện toàn bộ luồng discovery và trả về đầy đủ endpoints', async () => {
    // Mock fetchFn để test toàn bộ luồng mà không cần gọi mạng
    const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = input.toString();

      if (urlStr === 'https://mcp.example.com/learner') {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/.well-known/resource"'
          }
        });
      }

      if (urlStr === 'https://mcp.example.com/.well-known/resource') {
        return new Response(
          JSON.stringify({
            resource: 'https://mcp.example.com/learner',
            authorization_servers: ['https://api.example.com'],
            scopes_supported: ['learner']
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (urlStr === 'https://api.example.com/.well-known/oauth-authorization-server') {
        return new Response(
          JSON.stringify({
            issuer: 'https://api.example.com',
            authorization_endpoint: 'https://api.example.com/oauth/authorize',
            token_endpoint: 'https://api.example.com/oauth/token',
            registration_endpoint: 'https://api.example.com/oauth/register'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    const metadata = await discoverOAuth('https://mcp.example.com/learner', mockFetch);

    assert.strictEqual(metadata.resource, 'https://mcp.example.com/learner');
    assert.strictEqual(metadata.authorizationEndpoint, 'https://api.example.com/oauth/authorize');
    assert.strictEqual(metadata.tokenEndpoint, 'https://api.example.com/oauth/token');
    assert.strictEqual(metadata.registrationEndpoint, 'https://api.example.com/oauth/register');
    assert.deepStrictEqual(metadata.scopes, ['learner']);
  });
});
