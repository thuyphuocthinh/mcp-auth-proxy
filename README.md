# @thuyphuocthinh/mcp-auth-proxy 🔐

> **Zero-config Stdio to Streamable HTTP MCP runtime proxy with automatic OAuth 2.0 PKCE discovery & silent token refresh.**

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
- 🌐 **Cross-Platform Auto Browser Launch**: Automatically opens default browser on Windows (`start`), macOS (`open`), and Linux (`xdg-open`).
- 🔄 **Silent Background Refresh**: Automatically renews expiring tokens in the background via `grant_type=refresh_token` before the 5-minute expiry threshold.
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

*On first launch, your browser will automatically pop up to approve authorization. Subsequent launches will run silently forever with automatic token refresh!*

---

### 2. CLI Options

```bash
npx @thuyphuocthinh/mcp-auth-proxy <remote-url> [options]
```

| Option | Description |
| :--- | :--- |
| `--client-id <id>` | Pre-configured Client ID (for servers without RFC 7591 dynamic registration) |
| `--header "Key: Value"` | Custom request header (e.g. bypass OAuth with static API key) |
| `--no-browser` | Disable automatic browser launch; prints login URL to stderr (for headless/VPS environments) |
| `--login-only` | Perform interactive OAuth authentication, save credentials, and exit |
| `-h, --help` | Display help instructions |
| `-v, --version` | Display version number |

---

## 🧪 Testing

```bash
npm run build
npm test
```

49 unit tests covering all core modules with 100% pass rate.

---

## 📄 License

MIT © [Thuy Phuoc Thinh](https://github.com/thuyphuocthinh)
