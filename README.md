# @thuyphuocthinh/mcp-auth-proxy 🔐

> **Zero-config Stdio to Streamable HTTP MCP runtime proxy with automatic OAuth 2.0 PKCE discovery & non-intrusive silent token refresh.**

[![CI](https://github.com/thuyphuocthinh/mcp-auth-proxy/actions/workflows/ci.yml/badge.svg)](https://github.com/thuyphuocthinh/mcp-auth-proxy/actions/workflows/ci.yml)
[![NPM Version](https://img.shields.io/npm/v/@thuyphuocthinh/mcp-auth-proxy.svg)](https://www.npmjs.com/package/@thuyphuocthinh/mcp-auth-proxy)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)]()

`mcp-auth-proxy` acts as a zero-config bridge between your AI Client (Google Antigravity, Cursor, Windsurf, Claude Code, VS Code Copilot) and any remote Model Context Protocol (MCP) server protected by OAuth 2.0 (e.g., 200Lab AI Tutor, Notion, Linear, GitHub).

---

## 🌟 Highlights

- 🚀 **Zero Runtime Dependencies**: Pure Node.js (`node:http`, `node:crypto`, `node:net`), lightweight, launches immediately via `npx`.
- 🔍 **Automated OAuth Discovery**: Intercepts `401 Unauthorized`, parses `WWW-Authenticate: Bearer resource_metadata="..."` and resolves `.well-known` endpoints automatically.
- 🔑 **Dynamic Client Registration (RFC 7591) & PKCE (RFC 7636)**: Automatically registers client IDs on the fly with S256 challenge, eliminating the need for hardcoded client secrets.
- 🧘 **Non-Intrusive Stdio Mode**: Never interrupts your workflow by popping up a browser unexpectedly when running as a background proxy for AI IDEs.
- 🔄 **Bound Silent Background Refresh**: Persists the registered `clientId` alongside your tokens and silently refreshes via `grant_type=refresh_token`, preventing `invalid_grant` client-mismatch errors.
- 🚪 **Explicit `login` Command**: Authenticate upfront whenever you want using `mcp-auth-proxy login <url>`.
- 🛡️ **Static Header Bypass**: Support for `--header` flag to pass static API keys or personal access tokens directly.
- 🚦 **Dynamic Port Selection**: Automatically scans for free local ports starting from `8080` (8081, 8082...), eliminating `EADDRINUSE` port collision errors.

---

## 📦 Usage

### 1. Antigravity / Cursor Configuration

Add this entry to your `mcp_config.json` or `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "200lab-ai-tutor": {
      "command": "npx",
      "args": [
        "-y",
        "@thuyphuocthinh/mcp-auth-proxy",
        "https://mcp.200lab.io/mcp/learner"
      ]
    }
  }
}
```

### 2. Explicit Login (Recommended Before First Use)

Authenticate in advance so background sessions run smoothly:

```bash
npx @thuyphuocthinh/mcp-auth-proxy login https://mcp.200lab.io/mcp/learner
```

This opens your browser, receives the authorization code, securely stores the credentials in `~/.mcp-oauth-proxy/tokens.json`, and exits cleanly. All subsequent background proxy launches will run silently forever with automatic token refresh!

---

## 🛠️ CLI Reference

```bash
# Run as Stdio proxy
npx @thuyphuocthinh/mcp-auth-proxy <remote-url> [options]

# Explicit login command
npx @thuyphuocthinh/mcp-auth-proxy login <remote-url> [options]
```

| Option | Description |
| :--- | :--- |
| `login <remote-url>` | Perform interactive OAuth authentication, save credentials, and exit |
| `--client-id <id>` | Pre-configured Client ID (for servers without RFC 7591 dynamic registration) |
| `--header "Key: Value"` | Custom request header (e.g. bypass OAuth with static API key) |
| `--auto-browser` | Allow proxy to automatically launch browser when authentication is required |
| `--no-browser` | Disable automatic browser launch; prints login URL to stderr (for headless/VPS environments) |
| `--login-only` | Alias for the `login` command |
| `-h, --help` | Display help instructions |
| `-v, --version` | Display version number |

---

## 🧪 Testing

```bash
npm run build
npm test
```

54 unit tests covering all core modules with 100% pass rate.

---

## 📄 License

MIT © [Thuy Phuoc Thinh](https://github.com/thuyphuocthinh)
