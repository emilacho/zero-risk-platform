/**
 * Type declarations for @anthropic-ai/claude-agent-sdk
 * The SDK is a CLI wrapper — these are minimal declarations for TypeScript.
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
