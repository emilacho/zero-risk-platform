/**
 * Type declarations for @anthropic-ai/claude-agent-sdk
 * The SDK is a CLI wrapper — these are minimal declarations for TypeScript.
 *
 * Copied verbatim from zero-risk-platform/src/types/claude-agent-sdk.d.ts.
 * Keep in sync until a shared package factors this out.
 */
declare module '@anthropic-ai/claude-agent-sdk' {
  export interface Options {
    model?: string
    systemPrompt?: string
    maxTurns?: number
    allowedTools?: string[]
    mcpServers?: Record<string, unknown>
    sessionId?: string
    [key: string]: unknown
  }

  export interface SDKMessage {
    type: string
    role?: string
    content?: string
    session_id?: string
    [key: string]: unknown
  }

  export function query(
    prompt: string,
    options?: Options
  ): AsyncIterable<SDKMessage>
}
