export type McpServerId = 'atlassian' | 'github';

export type McpToolErrorCategory = 'auth-expired' | 'rate-limited' | 'invalid-entry' | 'network';

export interface McpToolError {
  serverId: McpServerId;
  category: McpToolErrorCategory;
  detail: string;
  resetAt?: string;
}
