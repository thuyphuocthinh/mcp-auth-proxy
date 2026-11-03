import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Readable, Writable } from 'node:stream';
import { extractJsonRpcFromSse, forwardJsonRpc, startProxy } from '../src/proxy.js';

describe('Stdio to HTTP Proxy Bridge', () => {
  it('extractJsonRpcFromSse should parse multi-event SSE streams with comments and blank lines', () => {
    const rawStream = `
: keepalive comment
event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"test"}]}}

: another comment
event: message
data: {"jsonrpc":"2.0","method":"notifications/initialized"}

data: {"jsonrpc":"2.0","id":2,"result":{"status":"ok"}}
    `.trim();

    const results = extractJsonRpcFromSse(rawStream);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(JSON.parse(results[0]).id, 1);
    assert.strictEqual(JSON.parse(results[1]).method, 'notifications/initialized');
    assert.strictEqual(JSON.parse(results[2]).id, 2);
  });

  it('extractJsonRpcFromSse should support raw non-SSE JSON responses', () => {
    const plainJson = '{"jsonrpc":"2.0","id":100,"result":{"active":true}}';
    const results = extractJsonRpcFromSse(plainJson);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], plainJson);
  });

  it('extractJsonRpcFromSse should return empty array for empty or whitespace content', () => {
    assert.deepStrictEqual(extractJsonRpcFromSse(''), []);
    assert.deepStrictEqual(extractJsonRpcFromSse('   \n\n  '), []);
  });

  it('forwardJsonRpc should inject Bearer token, Accept headers, and forward JSON payload', async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: any;
    let capturedMethod: string | undefined;

    const mockFetch: typeof fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      capturedBody = init?.body;
      capturedMethod = init?.method;
      return new Response(
        'event: message\ndata: {"jsonrpc":"2.0","id":55,"result":{"version":"1.0"}}\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    };

    const requestLine = '{"jsonrpc":"2.0","id":55,"method":"initialize"}';
    const results = await forwardJsonRpc({
      line: requestLine,
      remoteUrl: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer test_token', 'X-Custom-App': 'Antigravity' },
      fetchFn: mockFetch
    });

    assert.strictEqual(results.length, 1);
    assert.strictEqual(JSON.parse(results[0]).id, 55);
    assert.strictEqual(capturedMethod, 'POST');
    assert.strictEqual(capturedBody, requestLine);

    const headersRecord = capturedHeaders as Record<string, string>;
    assert.strictEqual(headersRecord['Authorization'], 'Bearer test_token');
    assert.strictEqual(headersRecord['X-Custom-App'], 'Antigravity');
    assert.strictEqual(headersRecord['Accept'], 'application/json, text/event-stream');
    assert.strictEqual(headersRecord['Content-Type'], 'application/json');
  });

  it('forwardJsonRpc should wrap remote HTTP error status into standard JSON-RPC 2.0 error', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Unauthorized access token', { status: 401 });
    };

    const requestLine = '{"jsonrpc":"2.0","id":999,"method":"tools/call"}';
    const results = await forwardJsonRpc({
      line: requestLine,
      remoteUrl: 'https://mcp.example.com',
      headers: {},
      fetchFn: mockFetch
    });

    assert.strictEqual(results.length, 1);
    const parsed = JSON.parse(results[0]);
    assert.strictEqual(parsed.id, 999, 'Must preserve client request id in error response');
    assert.strictEqual(parsed.error.code, -32603);
    assert.ok(parsed.error.message.includes('HTTP 401'));
    assert.ok(parsed.error.message.includes('Unauthorized access token'));
  });

  it('forwardJsonRpc should wrap network connection failures into standard JSON-RPC error', async () => {
    const mockFailingFetch: typeof fetch = async () => {
      throw new Error('ECONNREFUSED connect 127.0.0.1:9999');
    };

    const requestLine = '{"jsonrpc":"2.0","id":"req_abc","method":"ping"}';
    const results = await forwardJsonRpc({
      line: requestLine,
      remoteUrl: 'https://mcp.example.com',
      headers: {},
      fetchFn: mockFailingFetch
    });

    assert.strictEqual(results.length, 1);
    const parsed = JSON.parse(results[0]);
    assert.strictEqual(parsed.id, 'req_abc');
    assert.strictEqual(parsed.error.code, -32603);
    assert.ok(parsed.error.message.includes('ECONNREFUSED'));
  });

  it('startProxy should continuously pipe stdin requests to stdout responses', async () => {
    const inputLines = [
      '',
      '   ',
      '{"jsonrpc":"2.0","id":1,"method":"ping"}',
      '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
    ];

    const inputStream = Readable.from(inputLines.join('\n') + '\n');
    const outputChunks: string[] = [];
    const outputStream = new Writable({
      write(chunk, _encoding, callback) {
        outputChunks.push(chunk.toString());
        callback();
      }
    });

    const mockFetch: typeof fetch = async (_input, init) => {
      const parsed = JSON.parse(init?.body as string);
      return new Response(
        `event: message\ndata: {"jsonrpc":"2.0","id":${parsed.id},"result":{"pong":true}}\n\n`,
        { status: 200 }
      );
    };

    await startProxy({
      remoteUrl: 'https://mcp.example.com',
      getToken: async () => 'active_session_token',
      input: inputStream,
      output: outputStream,
      fetchFn: mockFetch
    });

    const output = outputChunks.join('');
    assert.ok(output.includes('{"jsonrpc":"2.0","id":1,"result":{"pong":true}}'));
    assert.ok(output.includes('{"jsonrpc":"2.0","id":2,"result":{"pong":true}}'));
    assert.ok(output.endsWith('\n'), 'Each response line must terminate with newline');
  });

  it('startProxy should handle unexpected token retrieval error and emit JSON-RPC error', async () => {
    const inputStream = Readable.from('{"jsonrpc":"2.0","id":88,"method":"tools/call"}\n');
    const outputChunks: string[] = [];
    const errorLogs: string[] = [];

    const outputStream = new Writable({
      write(chunk, _encoding, callback) {
        outputChunks.push(chunk.toString());
        callback();
      }
    });

    await startProxy({
      remoteUrl: 'https://mcp.example.com',
      getToken: async () => {
        throw new Error('OAuth consent rejected by user');
      },
      input: inputStream,
      output: outputStream,
      logError: (msg) => errorLogs.push(msg)
    });

    const output = outputChunks.join('');
    const parsed = JSON.parse(output.trim());
    assert.strictEqual(parsed.id, 88);
    assert.strictEqual(parsed.error.code, -32603);
    assert.ok(parsed.error.message.includes('OAuth consent rejected by user'));
    assert.ok(errorLogs.some((l) => l.includes('OAuth consent rejected')));
  });
});
