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
 * Trích xuất các message JSON-RPC từ response dạng SSE (text/event-stream)
 * Format chuẩn của MCP Streamable HTTP:
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

  // Nếu server trả về JSON thuần không qua bọc SSE
  if (results.length === 0 && responseText.trim().startsWith('{')) {
    results.push(responseText.trim());
  }

  return results;
}

/**
 * Chuyển tiếp 1 dòng JSON-RPC từ Stdio sang Remote HTTP MCP Server
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
    // Không phải JSON hợp lệ
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
            message: `Remote MCP server trả về HTTP ${response.status}: ${errorText}`
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
          message: `Lỗi kết nối tới Remote MCP: ${err.message}`
        }
      })
    ];
  }
}

/**
 * Khởi chạy vòng lặp Stdio Proxy:
 * Đọc từng dòng từ stdin, lấy token hợp lệ, chuyển tiếp HTTP và trả về stdout
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
      logError(`[-] Lỗi proxy: ${err.message}`);
      let requestId: string | number | null = null;
      try {
        const parsed = JSON.parse(line);
        requestId = parsed.id ?? null;
      } catch {}

      output.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          error: { code: -32603, message: err.message }
        }) + '\n'
      );
    }
  }
}
