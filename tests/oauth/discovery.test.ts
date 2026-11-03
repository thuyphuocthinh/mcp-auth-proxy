import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractResourceMetadataUrl, discoverOAuth } from '../../src/oauth/discovery.js';

describe('OAuth Metadata Discovery', () => {
  it('should extract resource_metadata URL from valid WWW-Authenticate Bearer header', () => {
    const header = 'Bearer resource_metadata="https://mcp.200lab.io/.well-known/oauth-protected-resource/mcp/learner"';
    const extracted = extractResourceMetadataUrl(header);
    assert.strictEqual(extracted, 'https://mcp.200lab.io/.well-known/oauth-protected-resource/mcp/learner');
  });

  it('should be case-insensitive for Bearer and resource_metadata tokens', () => {
    const header = 'bearer RESOURCE_METADATA="https://mcp.example.com/meta"';
    const extracted = extractResourceMetadataUrl(header);
    assert.strictEqual(extracted, 'https://mcp.example.com/meta');
  });

  it('should return null for headers lacking resource_metadata', () => {
    assert.strictEqual(extractResourceMetadataUrl(null), null);
    assert.strictEqual(extractResourceMetadataUrl(''), null);
    assert.strictEqual(extractResourceMetadataUrl('Bearer realm="OAuth"'), null);
    assert.strictEqual(extractResourceMetadataUrl('Basic realm="Restricted"'), null);
  });

  it('should execute full discovery handshake and return all resolved endpoints', async () => {
    const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === 'https://mcp.company.com/service') {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.company.com/.well-known/resource"'
          }
        });
      }

      if (url === 'https://mcp.company.com/.well-known/resource') {
        return new Response(
          JSON.stringify({
            resource: 'https://mcp.company.com/service',
            authorization_servers: ['https://auth.company.com/'],
            scopes_supported: ['read', 'write']
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url === 'https://auth.company.com/.well-known/oauth-authorization-server') {
        return new Response(
          JSON.stringify({
            issuer: 'https://auth.company.com',
            authorization_endpoint: 'https://auth.company.com/oauth/authorize',
            token_endpoint: 'https://auth.company.com/oauth/token',
            registration_endpoint: 'https://auth.company.com/oauth/register'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      return new Response('Not Found', { status: 404 });
    };

    const metadata = await discoverOAuth('https://mcp.company.com/service', mockFetch);

    assert.strictEqual(metadata.resource, 'https://mcp.company.com/service');
    assert.strictEqual(metadata.authorizationEndpoint, 'https://auth.company.com/oauth/authorize');
    assert.strictEqual(metadata.tokenEndpoint, 'https://auth.company.com/oauth/token');
    assert.strictEqual(metadata.registrationEndpoint, 'https://auth.company.com/oauth/register');
    assert.deepStrictEqual(metadata.scopes, ['read', 'write']);
  });

  it('should throw an informative error when remote server does not provide 401 WWW-Authenticate header', async () => {
    const mockFetch: typeof fetch = async () => new Response('OK', { status: 200 });

    await assert.rejects(
      async () => {
        await discoverOAuth('https://mcp.example.com', mockFetch);
      },
      /Missing 'WWW-Authenticate: Bearer resource_metadata="\.\.\."' header/
    );
  });

  it('should throw an error when Resource Metadata returns HTTP error', async () => {
    const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('probe')) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/bad-meta"'
          }
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    await assert.rejects(
      async () => {
        await discoverOAuth('https://mcp.example.com/probe', mockFetch);
      },
      /Failed to fetch Resource Metadata/
    );
  });

  it('should throw an error when Resource Metadata lacks authorization_servers', async () => {
    const mockFetch: typeof fetch = async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.includes('probe')) {
        return new Response('Unauthorized', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Bearer resource_metadata="https://mcp.example.com/meta"' }
        });
      }
      return new Response(JSON.stringify({ resource: 'test' }), { status: 200 });
    };

    await assert.rejects(
      async () => {
        await discoverOAuth('https://mcp.example.com/probe', mockFetch);
      },
      /Resource Metadata does not contain valid authorization_servers/
    );
  });
});
