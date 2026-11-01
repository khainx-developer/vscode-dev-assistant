import * as crypto from 'crypto';
import * as vscode from 'vscode';
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { LoopbackRedirectServer } from './loopbackRedirect';
import type { McpSecretTokenStore } from './secretTokenStore';
import type { McpServerId } from './types';

export async function createOAuthClientProvider(
  // Part of this factory's required signature (one provider per server); unused today since
  // nothing here is server-specific beyond what `store` already namespaces.
  _serverId: McpServerId,
  store: McpSecretTokenStore,
): Promise<OAuthClientProvider & { authorizationResult: Promise<{ code: string }> }> {
  const state = crypto.randomBytes(16).toString('hex');
  const redirectServer = new LoopbackRedirectServer();
  const { redirectUri, result } = await redirectServer.start(state);

  return {
    authorizationResult: result,

    get redirectUrl(): string {
      return redirectUri;
    },

    // The SDK only sends a `state` parameter in the authorization URL when this method exists
    // (`client/auth.js`: `const state = provider.state ? await provider.state() : undefined`,
    // then `if (state) { authorizationUrl.searchParams.set('state', state); }`). Without it,
    // no `state` is ever sent, and LoopbackRedirectServer's own CSRF check (comparing the
    // callback's `state` against the `state` passed to `start()` above) always fails. Return
    // the exact same value given to `start()` so the round trip matches.
    state(): string {
      return state;
    },

    get clientMetadata(): OAuthClientMetadata {
      return {
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        client_name: 'Dev Assistant (VS Code)',
        // RFC 7591/8252: without this, a registration server may assume `application_type:
        // 'web'` (the RFC 7591 default), which typically forbids a loopback `http://127.0.0.1`
        // redirect_uri — exactly what this provider uses. `'native'` explicitly permits it.
        // Not in the SDK's OAuthClientMetadata zod type, hence the cast below; the server reads
        // our raw JSON body, not the SDK's local type.
        application_type: 'native',
      } as OAuthClientMetadata;
    },

    clientInformation(): Promise<OAuthClientInformationMixed | undefined> {
      return store.getClientInformation() as Promise<OAuthClientInformationMixed | undefined>;
    },

    saveClientInformation(clientInformation: OAuthClientInformationMixed): Promise<void> {
      return store.saveClientInformation(clientInformation);
    },

    tokens(): Promise<OAuthTokens | undefined> {
      return store.getTokens() as Promise<OAuthTokens | undefined>;
    },

    saveTokens(tokens: OAuthTokens): Promise<void> {
      return store.saveTokens(tokens);
    },

    codeVerifier(): Promise<string> {
      return store.getCodeVerifier() as Promise<string>;
    },

    saveCodeVerifier(codeVerifier: string): Promise<void> {
      return store.saveCodeVerifier(codeVerifier);
    },

    async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
      await vscode.env.openExternal(vscode.Uri.parse(authorizationUrl.toString()));
    },
  };
}
