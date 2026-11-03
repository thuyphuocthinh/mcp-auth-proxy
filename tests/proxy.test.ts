import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Readable, Writable } from 'node:stream';
import { extractJsonRpcFromSse, forwardJsonRpc, startProxy } from '../src/proxy.js';

describe('Stdio to HTTP Proxy Bridge', () => {
  it('extractJsonRpcFromSse phải bóc tách chính xác data JSON từ stream SSE', () => {
    const sseResponse = `
event: message
data: {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}

event: message
data: {"jsonrpc":"2.0","method":"notifications/tools/list_changed"}
    `.trim();

    const results = extractJsonRpcFromSse(sseResponse);
    assert.strictEqual(results.length, 2);
    assert.deepStrictEqual(JSON.parse(results[0]), {
      jsonrpc: '2.0',
      id: 1,
      result: { tools: [] }
    });
    assert.deepStrictEqual(JSON.parse(results[1]), {
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed'
    });
  });

  it('extractJsonRpcFromSse phải hỗ trợ cả response JSON thuần', () => {
    const rawJson = '{"jsonrpc":"2.0","id":1,"result":{"status":"ok"}}';
    const results = extractJsonRpcFromSse(rawJson);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0], rawJson);
  });

  it('forwardJsonRpc phải đính kèm headers đầy đủ và trả về kết quả thành công', async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: any;

    const mockFetch: typeof fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      capturedBody = init?.body;
      return new Response(
        'event: message\ndata: {"jsonrpc":"2.0","id":42,"result":{"serverInfo":{"name":"test"}}}\n\n',
        { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
      );
    };

    const requestLine = '{"jsonrpc":"2.0","id":42,"method":"initialize"}';
    const results = await forwardJsonRpc({
      line: requestLine,
      remoteUrl: 'https://mcp.example.com',
      headers: { Authorization: 'Bearer token_abc' },
      fetchFn: mockFetch
    });

    assert.strictEqual(results.length, 1);
    const parsed = JSON.parse(results[0]);
    assert.strictEqual(parsed.id, 42);
    assert.strictEqual(parsed.result.serverInfo.name, 'test');

    const headersRecord = capturedHeaders as Record<string, string>;
    assert.strictEqual(headersRecord['Authorization'], 'Bearer token_abc');
    assert.strictEqual(headersRecord['Accept'], 'application/json, text/event-stream');
    assert.strictEqual(capturedBody, requestLine);
  });

  it('forwardJsonRpc phải trả về JSON-RPC Error nếu remote server trả lỗi HTTP', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Internal Server Error', { status: 500 });
    };

    const requestLine = '{"jsonrpc":"2.0","id":99,"method":"tools/call"}';
    const results = await forwardJsonRpc({
      line: requestLine,
      remoteUrl: 'https://mcp.example.com',
      headers: {},
      fetchFn: mockFetch
    });

    assert.strictEqual(results.length, 1);
    const parsed = JSON.parse(results[0]);
    assert.strictEqual(parsed.id, 99);
    assert.strictEqual(parsed.error.code, -32603);
    assert.ok(parsed.error.message.includes('HTTP 500'));
  });

  it('startProxy phải đọc từ input stream và ghi kết quả trả về output stream', async () => {
    const inputLines = [
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
        `event: message\ndata: {"jsonrpc":"2.0","id":${parsed.id},"result":"pong"}\n\n`,
        { status: 200 }
      );
    };

    await startProxy({
      remoteUrl: 'https://mcp.example.com',
      getToken: async () => 'mock_token',
      input: inputStream,
      output: outputStream,
      fetchFn: mockFetch
    });

    const fullOutput = outputChunks.join('');
    assert.ok(fullOutput.includes('"id":1'));
    assert.ok(fullOutput.includes('"id":2'));
  });
});
