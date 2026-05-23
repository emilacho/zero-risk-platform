/**
 * Type declarations for @anthropic-ai/claude-agent-sdk
 * The SDK is a CLI wrapper — these are minimal declarations for TypeScript.
 *
 * Canonical location · root `src/types/`. Service-side copy at
 * `services/agent-runner/src/types/claude-agent-sdk.d.ts` mirrors this file
 * verbatim · keep in sync until a shared package factors this out.
 *
 * Why this exists · the SDK ships a 219.9MB linux-x64 native binary that
 * Vercel NFT cannot bundle · so it's installed only in
 * `services/agent-runner/node_modules/` on Railway. Root tsc (CI typecheck)
 * compiles `services/agent-runner/src/lib/agent-sdk-runner.ts` (the
 * `tsconfig.json` exclude doesn't prevent module-resolution-pulled files) ·
 * and that file does `import { query, Options, SDKMessage } from
 * '@anthropic-ai/claude-agent-sdk'`. Without this ambient declaration, root
 * tsc fails TS2307 because the SDK package isn't in root node_modules.
 *
 * Per cleanup/sdk-types PR · unblocks CI for PR #69 + queue #70-80.
 */
declare module '@anthropic-ai/claude-agent-sdk' {
  /**
   * MCP server configuration (subset · upstream supports stdio · http · ws ·
   * etc.). Stub covers the modes `agent-sdk-runner.ts` references at the
   * call site. Per upstream sdk.d.ts v0.2.138 canonical shape.
   */
  export interface McpStdioServerConfig {
    type: 'stdio'
    command: string
    args?: string[]
    env?: Record<string, string>
  }

  export type McpServerConfig =
    | McpStdioServerConfig
    | { type: 'http'; url: string; headers?: Record<string, string> }
    | { type: 'ws'; url: string }

  /**
   * Options bag accepted by `query()`. The SDK accepts ~40 optional config
   * keys upstream · this stub declares the fields `agent-sdk-runner.ts`
   * actually references at the call site. Loose `[key: string]: unknown`
   * preserves forward-compat for fields not yet referenced.
   */
  export interface Options {
    model?: string
    systemPrompt?: string
    system_prompt?: string
    tools?: unknown[]
    settingSources?: string[]
    mcpServers?: Record<string, McpServerConfig>
    cwd?: string
    permissionMode?: 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
    abortController?: AbortController
    maxThinkingTokens?: number
    maxTurns?: number
    allowedTools?: string[]
    sessionId?: string
    [key: string]: unknown
  }

  /**
   * Discriminated union over all message events streamed by `query()`. The
   * upstream union has ~12 variants · runner code narrows via local
   * re-declared message shapes (SDKSystemInitMessage · etc).
   */
  export interface SDKMessage {
    type: string
    subtype?: string
    role?: string
    content?: string
    session_id?: string
    message?: unknown
    usage?: unknown
    [key: string]: unknown
  }

  /**
   * Main entry point · streams agent execution as an async iterable.
   * Signature from upstream sdk.d.ts v0.2.138.
   */
  export function query(
    promptOrParams: string | { prompt: string; options?: Options },
    options?: Options,
  ): AsyncIterable<SDKMessage>
}
