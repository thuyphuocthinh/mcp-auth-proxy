import readline from 'node:readline';

export interface ProxyOptions {
  remoteUrl: string;
  getToken: () => Promise<string>;
  extraHeaders?: Record<string, string>;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  fetchFn?: typeof fetch;
  logError?: (msg: string) => void;
}

/**
 * Extracts JSON-RPC message payloads from SSE (text/event-stream) response chunks.
 * Conforms to standard Model Context Protocol (MCP) Streamable HTTP specification:
 * event: message
 * data: {"jsonrpc":"2.0", ...}
 */
export function extractJsonRpcFromSse(responseText: string): string[] {
  const results: string[] = [];
  const lines = responseText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('data:')) {
      const dataContent = trimmed.substring(5).trim();
      if (dataContent) {
        results.push(dataContent);
      }
    }
  }

  // Fallback if server returned raw non-SSE JSON
  if (results.length === 0 && responseText.trim().startsWith('{')) {
    results.push(responseText.trim());
  }

  return results;
}

/**
 * Forwards a single JSON-RPC line from Stdio to the Remote HTTP MCP Server.
 */
export async function forwardJsonRpc(options: {
  line: string;
  remoteUrl: string;
  headers: Record<string, string>;
  fetchFn?: typeof fetch;
}): Promise<string[]> {
  const { line, remoteUrl, headers, fetchFn = fetch } = options;

  let requestId: string | number | null = null;
  try {
    const parsed = JSON.parse(line);
    requestId = parsed.id ?? null;
  } catch {
    // Malformed JSON input from client
  }

  try {
    const response = await fetchFn(remoteUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...headers
      },
      body: line
    });

    if (!response.ok) {
      const errorText = await response.text();
      return [
        JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          error: {
            code: -32603,
            message: `Remote MCP server returned HTTP ${response.status}: ${errorText}`
          }
        })
      ];
    }

    const responseText = await response.text();
    return extractJsonRpcFromSse(responseText);
  } catch (err: any) {
    return [
      JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        error: {
          code: -32603,
          message: `Failed to connect to remote MCP server: ${err.message}`
        }
      })
    ];
  }
}

/**
 * Starts Stdio bidirectional proxy loop.
 * Reads newline-delimited JSON-RPC from stdin, attaches valid token, and writes to stdout.
 */
export async function startProxy(options: ProxyOptions): Promise<void> {
  const {
    remoteUrl,
    getToken,
    extraHeaders = {},
    input = process.stdin,
    output = process.stdout,
    fetchFn = fetch,
    logError = console.error
  } = options;

  const rl = readline.createInterface({
    input,
    output: undefined,
    terminal: false
  });

  for await (const rawLine of rl) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      const token = await getToken();
      const headers: Record<string, string> = {
        ...extraHeaders
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const results = await forwardJsonRpc({
        line,
        remoteUrl,
        headers,
        fetchFn
      });

      for (const res of results) {
        output.write(res + '\n');
      }
    } catch (err: any) {
      logError(`[-] Proxy error: ${err.message}`);
      let requestId: string | number | null = null;
      try {
        const parsed = JSON.parse(line);
        requestId = parsed.id ?? null;
      } catch {}

      const errorCode =
        err && typeof err.code === 'number' ? err.code : -32603;

      output.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          error: { code: errorCode, message: err.message }
        }) + '\n'
      );
    }
  }
}
