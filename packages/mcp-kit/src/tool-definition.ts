import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { z } from 'zod'

/**
 * Forma comun de una herramienta, independiente del SDK de MCP.
 *
 * Cada servidor describe sus herramientas como datos (`ToolDefinition`) y un
 * unico punto (`createMcpServer`) las registra. Asi la logica de una
 * herramienta se prueba llamando a `handler` directamente, sin protocolo.
 */

/**
 * Indicacion para la interfaz que acompania al resultado.
 *
 * El servidor arma la URL a partir de un identificador validado; el agente
 * solo la retransmite. El modelo nunca escribe la URL que se abre o se pinta.
 */
export type UiDirective =
  | { readonly type: 'image'; readonly url: string; readonly alt: string }
  | { readonly type: 'open_url'; readonly url: string; readonly title: string }

export type ToolOutcome =
  | {
      readonly ok: true
      readonly data: Record<string, unknown>
      readonly ui?: readonly UiDirective[]
    }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

export interface ToolDefinition {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: z.ZodRawShape
  /** Recibe argumentos ya validados contra `inputSchema` por el SDK. */
  handler(args: Record<string, unknown>): Promise<ToolOutcome>
}

/** Conserva el tipado de los argumentos al escribir la herramienta. */
export function defineTool<Shape extends z.ZodRawShape>(definition: {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: Shape
  handler(args: z.infer<z.ZodObject<Shape>>): Promise<ToolOutcome>
}): ToolDefinition {
  return definition as unknown as ToolDefinition
}

export function fail(code: string, message: string): ToolOutcome {
  return { ok: false, error: { code, message } }
}

export interface McpServerInfo {
  readonly name: string
  readonly version: string
  readonly tools: readonly ToolDefinition[]
}

export function createMcpServer(info: McpServerInfo): McpServer {
  const server = new McpServer({ name: info.name, version: info.version })

  for (const tool of info.tools) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.inputSchema },
      async (args: Record<string, unknown>) => {
        const outcome = await tool.handler(args)
        return {
          // El texto es para clientes MCP que no leen structuredContent.
          content: [{ type: 'text' as const, text: JSON.stringify(outcome) }],
          structuredContent: outcome as unknown as Record<string, unknown>,
          isError: !outcome.ok,
        }
      },
    )
  }

  return server
}
