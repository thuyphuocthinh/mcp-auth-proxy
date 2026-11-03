import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in milliseconds
  tokenType?: string;
  scope?: string;
  clientId?: string;
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
    // Default buffer: 5 minutes (300,000ms)
    return Date.now() >= token.expiresAt - bufferMs;
  }

  async refreshToken(options: {
    resource: string;
    tokenEndpoint: string;
    clientId?: string;
    fetchFn?: typeof fetch;
    log?: (msg: string) => void;
  }): Promise<string | null> {
    const { resource, tokenEndpoint, fetchFn = fetch, log = console.log } = options;
    const current = this.getToken(resource);

    if (!current?.refreshToken) {
      log(`[-] No refresh_token available for resource: ${resource}`);
      return null;
    }

    const effectiveClientId = current.clientId || options.clientId;
    if (!effectiveClientId) {
      log(`[-] No client_id available for silent token refresh for resource: ${resource}`);
      return null;
    }

    try {
      log(`[*] Performing silent background token refresh...`);
      const response = await fetchFn(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: effectiveClientId,
          refresh_token: current.refreshToken
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        log(`[-] Silent token refresh failed (HTTP ${response.status}): ${errorText}`);
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
        refreshToken: data.refresh_token || current.refreshToken,
        expiresAt: Date.now() + data.expires_in * 1000,
        tokenType: data.token_type || current.tokenType,
        scope: data.scope || current.scope,
        clientId: effectiveClientId
      };

      this.saveToken(resource, updatedToken);
      log(`[+] Token refreshed successfully! Valid for ${data.expires_in}s.`);
      return updatedToken.accessToken;
    } catch (err: any) {
      log(`[-] Network error during silent token refresh: ${err.message}`);
      return null;
    }
  }

  async getOrRefreshToken(options: {
    resource: string;
    tokenEndpoint: string;
    clientId?: string;
    fetchFn?: typeof fetch;
    log?: (msg: string) => void;
  }): Promise<string | null> {
    const { resource } = options;
    const current = this.getToken(resource);

    if (!current) {
      return null;
    }

    // Still valid for more than buffer duration
    if (!this.isExpiringSoon(current)) {
      return current.accessToken;
    }

    // Expiring soon: silently refresh if refresh_token exists
    if (current.refreshToken) {
      const refreshed = await this.refreshToken({
        ...options,
        clientId: current.clientId || options.clientId
      });
      if (refreshed) {
        return refreshed;
      }
    }

    // If refresh failed but token is technically not past absolute expiration timestamp
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
