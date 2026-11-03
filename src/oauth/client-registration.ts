export interface ClientRegistrationResponse {
  client_id: string;
  client_name?: string;
  redirect_uris?: string[];
}

export async function registerDynamicClient(
  registrationEndpoint: string,
  redirectUri: string,
  clientName = 'mcp-oauth-proxy',
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const response = await fetchFn(registrationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_name: clientName,
      redirect_uris: [redirectUri]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Đăng ký Client động thất bại (HTTP ${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as ClientRegistrationResponse;
  if (!data.client_id) {
    throw new Error(`Phản hồi đăng ký không chứa client_id`);
  }

  return data.client_id;
}

export async function resolveClientId(options: {
  registrationEndpoint?: string;
  redirectUri: string;
  explicitClientId?: string;
  fetchFn?: typeof fetch;
  log?: (msg: string) => void;
}): Promise<string> {
  const { registrationEndpoint, redirectUri, explicitClientId, fetchFn = fetch, log = console.log } = options;

  // Nếu người dùng đã truyền --client-id, ưu tiên sử dụng luôn
  if (explicitClientId) {
    log(`[*] Sử dụng Client ID được cấu hình: ${explicitClientId}`);
    return explicitClientId;
  }

  // Nếu server hỗ trợ Dynamic Client Registration (RFC 7591)
  if (registrationEndpoint) {
    log(`[*] Đang tự động đăng ký Dynamic Client ID với: ${registrationEndpoint}`);
    return await registerDynamicClient(registrationEndpoint, redirectUri, 'mcp-oauth-proxy', fetchFn);
  }

  throw new Error(
    `Server không hỗ trợ Dynamic Client Registration (RFC 7591). Vui lòng cung cấp tham số --client-id <id>`
  );
}
