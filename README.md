# mcp-oauth-proxy 🔐

> **Zero-config Stdio to Streamable HTTP MCP runtime proxy with automatic OAuth 2.0 PKCE discovery & silent token refresh.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.0.0-green.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)]()

`mcp-oauth-proxy` là một CLI runtime proxy trung gian giữa AI Client (Antigravity, Cursor, Windsurf, Claude Code, VS Code Copilot) và Remote MCP Server có bảo mật OAuth 2.0 (như 200Lab AI Tutor, Notion, Linear, GitHub).

---

## 🌟 Tính Năng Nổi Bật

- 🚀 **Zero Runtime Dependencies**: Viết hoàn toàn bằng Node.js chuẩn (`node:http`, `node:crypto`, `node:net`), dung lượng siêu nhẹ, chạy tức thì qua `npx`.
- 🔍 **Automated OAuth Discovery**: Tự động bắt mã `401 Unauthorized`, phân tích `WWW-Authenticate` và truy vết endpoints từ `.well-known`.
- 🔑 **Dynamic Client Registration (RFC 7591) & PKCE (RFC 7636)**: Tự tạo client và mã hóa SHA-256 S256 mà không cần cấu hình client secret.
- 🌐 **Cross-Platform Auto Browser Launch**: Tự động bật trình duyệt mặc định trên Windows, macOS và Linux để người dùng xác thực.
- 🔄 **Silent Refresh (Không bao giờ lo hết hạn token)**: Tự động dùng `refresh_token` ngầm khi `access_token` còn hạn dưới 5 phút. Bạn làm việc cả tháng mà không bị ngắt kết nối.
- 🛡️ **Static Header Bypass**: Hỗ trợ cờ `--header` cho các server dùng Static API Key / Personal Access Token.
- 🚦 **Dynamic Port Selection**: Tự động dò tìm cổng rảnh bắt đầu từ 8080 (8081, 8082...), chống lỗi trùng cổng (`EADDRINUSE`).

---

## 📦 Cài Đặt & Sử Dụng

### 1. Dùng trực tiếp với Antigravity / Cursor

Thêm cấu hình vào file `mcp_config.json` (hoặc `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "200lab-ai-tutor": {
      "command": "npx",
      "args": ["-y", "mcp-oauth-proxy", "https://mcp.200lab.io/mcp/learner"]
    }
  }
}
```

*Lần đầu tiên chạy, trình duyệt sẽ tự động bật lên để bạn đăng nhập và bấm "Cho phép". Sau đó mọi thứ sẽ hoàn toàn tự động và vĩnh viễn không bị hết hạn!*

---

### 2. Các Tùy Chọn CLI

```bash
mcp-oauth-proxy <remote-url> [tùy chọn]
```

| Tùy chọn | Mô tả |
| :--- | :--- |
| `--client-id <id>` | Client ID đăng ký trước (dành cho server không hỗ trợ RFC 7591) |
| `--header "Key: Value"` | Thêm header tùy chỉnh (ví dụ bypass OAuth bằng API Key tĩnh) |
| `--no-browser` | Không tự động mở trình duyệt, chỉ in URL đăng nhập ra terminal (dành cho VPS/Docker) |
| `--login-only` | Chỉ thực hiện đăng nhập OAuth và lưu token vào máy rồi thoát |
| `-h, --help` | Hiển thị trợ giúp |
| `-v, --version` | Hiển thị phiên bản |

---

## 🧪 Chạy Kiểm Thử (Unit Tests)

Dự án áp dụng quy chuẩn 1-1: Mỗi module logic đều có một file test tương ứng chạy bằng test runner gốc của Node.js:

```bash
npm run build
npm test
```

---

## 📄 License

MIT © Antigravity Dev
