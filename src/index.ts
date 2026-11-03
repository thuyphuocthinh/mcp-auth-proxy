import { discoverOAuth } from './oauth/discovery.js';
import { generatePKCE } from './oauth/pkce.js';
import { resolveClientId } from './oauth/client-registration.js';
import { openBrowser } from './oauth/browser.js';
import { startCallbackServer } from './oauth/server.js';
import { TokenStore } from './store/token-store.js';
import { startProxy } from './proxy.js';

export const VERSION = '1.0.1';

export interface CliOptions {
  command: 'proxy' | 'login';
  remoteUrl?: string;
  clientId?: string;
  headers: Record<string, string>;
  noBrowser: boolean;
  autoBrowser: boolean;
  loginOnly: boolean;
  help: boolean;
  version: boolean;
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: 'proxy',
    headers: {},
    noBrowser: false,
    autoBrowser: false,
    loginOnly: false,
    help: false,
    version: false
  };

  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--version' || arg === '-v') {
      options.version = true;
    } else if (arg === '--no-browser') {
      options.noBrowser = true;
    } else if (arg === '--auto-browser') {
      options.autoBrowser = true;
    } else if (arg === '--login-only') {
      options.loginOnly = true;
      options.command = 'login';
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
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  if (positional.length > 0) {
    if (positional[0] === 'login') {
      options.command = 'login';
      if (positional.length > 1) {
        options.remoteUrl = positional[1];
      }
    } else {
      options.remoteUrl = positional[0];
    }
  }

  return options;
}

export function printHelp(): void {
  // All operational logging and help text MUST be printed to stderr
  // so it does not interfere with the Stdio JSON-RPC stream on stdout!
  console.error(`
mcp-oauth-proxy v${VERSION}
Zero-config Stdio to Streamable HTTP MCP runtime proxy with automatic OAuth PKCE & silent refresh.

Usage:
  mcp-oauth-proxy <remote-url> [options]
  mcp-oauth-proxy login <remote-url> [options]

Commands:
  login <remote-url>     Perform interactive OAuth authentication, save credentials, and exit

Options:
  --client-id <id>       Pre-configured Client ID (for servers without RFC 7591 dynamic registration)
  --header "K: V"        Custom request header (e.g. bypass OAuth using static API key)
  --auto-browser         Automatically launch browser when re-authentication is required in proxy mode
  --no-browser           Do not automatically open default browser; print authorization URL to stderr
  --login-only           Alias for the login command
  -h, --help             Display this help message
  -v, --version          Display version number

Examples:
  mcp-oauth-proxy login https://mcp.200lab.io/mcp/learner
  mcp-oauth-proxy https://mcp.200lab.io/mcp/learner
  mcp-oauth-proxy https://api.example.com/mcp --header "Authorization: Bearer my_api_key"
`);
}

export async function performLogin(options: {
  remoteUrl: string;
  clientId?: string;
  noBrowser?: boolean;
  store: TokenStore;
  fetchFn?: typeof fetch;
  log?: (msg: string) => void;
}): Promise<string> {
  const {
    remoteUrl,
    clientId,
    noBrowser = false,
    store,
    fetchFn = fetch,
    log = console.error
  } = options;

  log(`[*] Discovering OAuth metadata for: ${remoteUrl}`);
  const metadata = await discoverOAuth(remoteUrl, fetchFn);

  log(`[*] Starting local callback server...`);
  const callbackServer = await startCallbackServer();
  const pkce = generatePKCE();

  const effectiveClientId = await resolveClientId({
    registrationEndpoint: metadata.registrationEndpoint,
    redirectUri: callbackServer.redirectUri,
    explicitClientId: clientId,
    fetchFn,
    log
  });

  const authUrl = new URL(metadata.authorizationEndpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', effectiveClientId);
  authUrl.searchParams.set('redirect_uri', callbackServer.redirectUri);
  authUrl.searchParams.set('scope', metadata.scopes.join(' '));
  authUrl.searchParams.set('code_challenge', pkce.challenge);
  authUrl.searchParams.set('code_challenge_method', pkce.method);
  authUrl.searchParams.set('resource', metadata.resource);

  if (!noBrowser) {
    await openBrowser(authUrl.toString(), log);
  } else {
    log(`[*] Open this URL in your browser to complete authorization:\n${authUrl.toString()}\n`);
  }

  const code = await callbackServer.waitForCode();
  log(`[*] Authorization code received. Exchanging for token...`);

  const tokenRes = await fetchFn(metadata.tokenEndpoint, {
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
    throw new Error(`Token exchange failed (HTTP ${tokenRes.status}): ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  };

  store.saveToken(metadata.resource, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
    clientId: effectiveClientId
  });

  log(`[+] Authentication successful! Credentials securely stored.`);
  await callbackServer.close();

  return tokenData.access_token;
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
    console.error(`[-] Missing required <remote-url> parameter. Run with --help for instructions.`);
    process.exit(1);
  }

  const remoteUrl = options.remoteUrl;
  const store = new TokenStore();

  if (options.command === 'login') {
    await performLogin({
      remoteUrl,
      clientId: options.clientId,
      noBrowser: options.noBrowser,
      store
    });
    console.error(`[+] Authentication complete.`);
    process.exit(0);
  }

  const getToken = async (): Promise<string> => {
    // If user provided a manual Authorization header via --header
    if (options.headers['Authorization']) {
      return '';
    }

    // 1. Discover OAuth Metadata from remote server
    const metadata = await discoverOAuth(remoteUrl);
    const storedToken = store.getToken(metadata.resource);
    const existingClientId = storedToken?.clientId || options.clientId;

    // 2. Try to get existing token or execute silent background refresh
    const existingToken = await store.getOrRefreshToken({
      resource: metadata.resource,
      tokenEndpoint: metadata.tokenEndpoint,
      clientId: existingClientId,
      log: console.error
    });

    if (existingToken) {
      return existingToken;
    }

    // 3. No valid token found or refresh failed:
    if (options.autoBrowser) {
      return await performLogin({
        remoteUrl,
        clientId: options.clientId,
        noBrowser: options.noBrowser,
        store
      });
    }

    // Default Non-Intrusive mode: do not launch browser unsolicitedly
    const loginCommand = `npx @thuyphuocthinh/mcp-auth-proxy login ${remoteUrl}`;
    const message = `Authentication required for ${remoteUrl}. Please run: ${loginCommand}`;
    console.error(`[-] ${message}`);

    const authError: any = new Error(message);
    authError.code = -32000;
    throw authError;
  };

  // Launch Stdio runtime proxy loop
  await startProxy({
    remoteUrl,
    getToken,
    extraHeaders: options.headers,
    logError: console.error
  });
}

// When executed directly as a script
if (process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('index.js')) {
  main().catch((err) => {
    console.error(`[-] Fatal error: ${err.message}`);
    process.exit(1);
  });
}
