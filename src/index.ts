import { discoverOAuth } from './oauth/discovery.js';
import { generatePKCE } from './oauth/pkce.js';
import { resolveClientId } from './oauth/client-registration.js';
import { openBrowser } from './oauth/browser.js';
import { startCallbackServer } from './oauth/server.js';
import { TokenStore } from './store/token-store.js';
import { startProxy } from './proxy.js';

export const VERSION = '1.0.0';

export interface CliOptions {
  remoteUrl?: string;
  clientId?: string;
  headers: Record<string, string>;
  noBrowser: boolean;
  loginOnly: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    headers: {},
    noBrowser: false,
    loginOnly: false,
    help: false,
    version: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--no-browser') {
      options.noBrowser = true;
    } else if (arg === '--login-only') {
      options.loginOnly = true;
    } else if (arg === '--client-id' && i + 1 < args.length) {
      options.clientId = args[++i];
    } else if (arg === '--header' && i + 1 < args.length) {
      const headerStr = args[++i];
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx > 0) {
        const key = headerStr.substring(0, colonIdx).trim();
        const value = headerStr.substring(colonIdx + 1).trim();
        options.headers[key] = value;
      }
    } else if (!arg.startsWith('-') && !options.remoteUrl) {
      options.remoteUrl = arg;
    }
  }

  return options;
}

export function printHelp(): void {
  // Toàn bộ hướng dẫn in ra stderr để không làm hỏng stream JSON-RPC của stdout
  console.error(`
mcp-oauth-proxy v${VERSION}
Zero-config Stdio to Streamable HTTP MCP runtime proxy with automatic OAuth PKCE & silent refresh.

Cú pháp:
  mcp-oauth-proxy <remote-url> [tùy chọn]

Tùy chọn:
  --client-id <id>       Client ID đăng ký trước (dành cho server không hỗ trợ RFC 7591)
  --header "K: V"        Thêm header tùy chỉnh (ví dụ bypass OAuth bằng API Key tĩnh)
  --no-browser           Không tự động mở trình duyệt, chỉ in URL đăng nhập ra terminal
  --login-only           Chỉ thực hiện đăng nhập OAuth và lưu token vào máy rồi thoát
  -h, --help             Hiển thị trợ giúp
  -v, --version          Hiển thị phiên bản

Ví dụ:
  mcp-oauth-proxy https://mcp.200lab.io/mcp/learner
  mcp-oauth-proxy https://api.example.com/mcp --header "Authorization: Bearer my_api_key"
`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (options.version) {
    console.error(`mcp-oauth-proxy v${VERSION}`);
    process.exit(0);
  }

  if (!options.remoteUrl) {
    console.error(`[-] Thiếu tham số <remote-url>. Gõ --help để xem hướng dẫn.`);
    process.exit(1);
  }

  const remoteUrl = options.remoteUrl;
  const store = new TokenStore();

  // Hàm lấy token hợp lệ (hoặc refresh ngầm)
  const getToken = async (): Promise<string> => {
    // Nếu người dùng đã truyền header Authorization thủ công qua --header
    if (options.headers['Authorization']) {
      return '';
    }

    // 1. Thăm dò và phân tích OAuth Metadata
    const metadata = await discoverOAuth(remoteUrl);
    const clientId = await resolveClientId({
      registrationEndpoint: metadata.registrationEndpoint,
      redirectUri: 'http://localhost:8080/callback',
      explicitClientId: options.clientId,
      log: console.error
    });

    // 2. Thử lấy token có sẵn hoặc thực hiện Silent Refresh ngầm
    const existingToken = await store.getOrRefreshToken({
      resource: metadata.resource,
      tokenEndpoint: metadata.tokenEndpoint,
      clientId,
      log: console.error
    });

    if (existingToken) {
      return existingToken;
    }

    // 3. Nếu chưa có token hoặc refresh thất bại -> Bắt đầu luồng đăng nhập OAuth PKCE
    console.error(`[*] Bắt đầu luồng xác thực OAuth cho: ${metadata.resource}`);
    const callbackServer = await startCallbackServer();
    const pkce = generatePKCE();

    // Cập nhật lại client với redirectUri chính xác của cổng vừa mở
    const effectiveClientId = await resolveClientId({
      registrationEndpoint: metadata.registrationEndpoint,
      redirectUri: callbackServer.redirectUri,
      explicitClientId: options.clientId,
      log: console.error
    });

    const authUrl = new URL(metadata.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', effectiveClientId);
    authUrl.searchParams.set('redirect_uri', callbackServer.redirectUri);
    authUrl.searchParams.set('scope', metadata.scopes.join(' '));
    authUrl.searchParams.set('code_challenge', pkce.challenge);
    authUrl.searchParams.set('code_challenge_method', pkce.method);
    authUrl.searchParams.set('resource', metadata.resource);

    if (!options.noBrowser) {
      await openBrowser(authUrl.toString(), console.error);
    } else {
      console.error(`[*] Hãy mở liên kết sau trong trình duyệt để đăng nhập:\n${authUrl.toString()}\n`);
    }

    const code = await callbackServer.waitForCode();
    console.error(`[*] Đã nhận Authorization Code. Đang đổi token...`);

    const tokenRes = await fetch(metadata.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: effectiveClientId,
        code,
        redirect_uri: callbackServer.redirectUri,
        code_verifier: pkce.verifier
      })
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      await callbackServer.close();
      throw new Error(`Đổi token thất bại (HTTP ${tokenRes.status}): ${errText}`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    store.saveToken(metadata.resource, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000
    });

    console.error(`[+] Đăng nhập thành công! Token đã được lưu an toàn.`);
    await callbackServer.close();

    return tokenData.access_token;
  };

  if (options.loginOnly) {
    await getToken();
    console.error(`[+] Quá trình đăng nhập hoàn tất (--login-only).`);
    process.exit(0);
  }

  // Khởi chạy runtime proxy kết nối Stdio <-> Remote HTTP
  await startProxy({
    remoteUrl,
    getToken,
    extraHeaders: options.headers,
    logError: console.error
  });
}

// Nếu file được thực thi trực tiếp qua node/bin
if (process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('index.js')) {
  main().catch((err) => {
    console.error(`[-] Lỗi nghiêm trọng: ${err.message}`);
    process.exit(1);
  });
}
