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
      `Dynamic Client Registration failed (HTTP ${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as ClientRegistrationResponse;
  if (!data.client_id) {
    throw new Error(`Registration response missing client_id`);
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

  if (explicitClientId) {
    log(`[*] Using configured Client ID: ${explicitClientId}`);
    return explicitClientId;
  }

  if (registrationEndpoint) {
    log(`[*] Registering dynamic Client ID with: ${registrationEndpoint}`);
    return await registerDynamicClient(registrationEndpoint, redirectUri, 'mcp-oauth-proxy', fetchFn);
  }

  throw new Error(
    `Server does not support Dynamic Client Registration (RFC 7591). Please provide an explicit --client-id <id>`
  );
}
