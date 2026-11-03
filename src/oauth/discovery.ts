export interface OAuthMetadata {
  resource: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint?: string;
  scopes: string[];
}

export function extractResourceMetadataUrl(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/resource_metadata="([^"]+)"/i);
  return match ? match[1] : null;
}

export async function discoverOAuth(
  remoteUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<OAuthMetadata> {
  // Bước 1: Thăm dò 401 để lấy WWW-Authenticate header
  const probeResponse = await fetchFn(remoteUrl, { method: 'GET' });
  const authHeader = probeResponse.headers.get('www-authenticate');

  const metadataUrl = extractResourceMetadataUrl(authHeader);
  if (!metadataUrl) {
    throw new Error(
      `Không tìm thấy header 'WWW-Authenticate: Bearer resource_metadata="..."' từ ${remoteUrl}`
    );
  }

  // Bước 2: Đọc thông tin Protected Resource Metadata (RFC 8707)
  const resourceRes = await fetchFn(metadataUrl);
  if (!resourceRes.ok) {
    throw new Error(`Lỗi đọc Resource Metadata từ ${metadataUrl}: HTTP ${resourceRes.status}`);
  }
  const resourceData = (await resourceRes.json()) as {
    resource?: string;
    authorization_servers?: string[];
    scopes_supported?: string[];
  };

  const authServer = resourceData.authorization_servers?.[0];
  if (!authServer) {
    throw new Error(`Resource Metadata không chứa authorization_servers hợp lệ`);
  }

  // Bước 3: Đọc Authorization Server Metadata (RFC 8414)
  const serverMetaUrl = `${authServer.replace(/\/$/, '')}/.well-known/oauth-authorization-server`;
  const serverRes = await fetchFn(serverMetaUrl);
  if (!serverRes.ok) {
    throw new Error(`Lỗi đọc Auth Server Metadata từ ${serverMetaUrl}: HTTP ${serverRes.status}`);
  }

  const serverData = (await serverRes.json()) as {
    authorization_endpoint?: string;
    token_endpoint?: string;
    registration_endpoint?: string;
  };

  if (!serverData.authorization_endpoint || !serverData.token_endpoint) {
    throw new Error(`Auth Server Metadata thiếu authorization_endpoint hoặc token_endpoint`);
  }

  return {
    resource: resourceData.resource || remoteUrl,
    authorizationEndpoint: serverData.authorization_endpoint,
    tokenEndpoint: serverData.token_endpoint,
    registrationEndpoint: serverData.registration_endpoint,
    scopes: resourceData.scopes_supported || ['learner']
  };
}
