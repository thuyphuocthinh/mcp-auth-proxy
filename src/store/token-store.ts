import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in milliseconds
  tokenType?: string;
  scope?: string;
}

export class TokenStore {
  private storePath: string;

  constructor(customPath?: string) {
    this.storePath =
      customPath || path.join(os.homedir(), '.mcp-oauth-proxy', 'tokens.json');
  }

  saveToken(resource: string, token: StoredToken): void {
    const data = this.readAll();
    data[resource] = token;
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  getToken(resource: string): StoredToken | null {
    const data = this.readAll();
    return data[resource] || null;
  }

  isExpiringSoon(token: StoredToken, bufferMs = 300_000): boolean {
    // Mặc định buffer 5 phút (300,000ms)
    return Date.now() >= token.expiresAt - bufferMs;
  }

  async refreshToken(options: {
    resource: string;
    tokenEndpoint: string;
    clientId: string;
    fetchFn?: typeof fetch;
    log?: (msg: string) => void;
  }): Promise<string | null> {
    const { resource, tokenEndpoint, clientId, fetchFn = fetch, log = console.log } = options;
    const current = this.getToken(resource);

    if (!current?.refreshToken) {
      log(`[-] Không tìm thấy refresh_token cho resource: ${resource}`);
      return null;
    }

    try {
      log(`[*] Đang thực hiện Silent Refresh ngầm cho token...`);
      const response = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId,
          refresh_token: current.refreshToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`[-] Silent Refresh thất bại (HTTP ${response.status}): ${errorText}`);
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        token_type?: string;
        scope?: string;
      };

      const updatedToken: StoredToken = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || current.refreshToken, // Dùng token mới nếu server cấp xoay vòng
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: data.token_type || current.tokenType,
        scope: data.scope || current.scope
      };

      this.saveToken(resource, updatedToken);
      log(`[+] Silent Refresh thành công! Token mới có hiệu lực trong ${data.expires_in}s.`);
      return updatedToken.accessToken;
    } catch (err: any) {
      log(`[-] Lỗi kết nối khi Silent Refresh: ${err.message}`);
      return null;
    }
  }

  async getOrRefreshToken(options: {
    resource: string;
    tokenEndpoint: string;
    clientId: string;
    fetchFn?: typeof fetch;
    log?: (msg: string) => void;
  }): Promise<string | null> {
    const { resource } = options;
    const current = this.getToken(resource);

    if (!current) {
      return null;
    }

    // Nếu token vẫn còn hạn trên 5 phút, tái sử dụng luôn
    if (!this.isExpiringSoon(current)) {
      return current.accessToken;
    }

    // Nếu sắp hết hạn (< 5 phút), âm thầm refresh ngầm
    if (current.refreshToken) {
      const refreshed = await this.refreshToken(options);
      if (refreshed) {
        return refreshed;
      }
    }

    // Nếu không refresh được nhưng access_token thực tế chưa hết hạn (trong khoảng 5 phút đệm)
    if (Date.now() < current.expiresAt) {
      return current.accessToken;
    }

    return null;
  }

  private readAll(): Record<string, StoredToken> {
    if (!fs.existsSync(this.storePath)) {
      return {};
    }
    try {
      const content = fs.readFileSync(this.storePath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
}
