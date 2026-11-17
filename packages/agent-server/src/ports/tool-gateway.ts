import type { LlmToolSpec } from './llm.js'

/**
 * Puerto de herramientas.
 *
 * El orquestador no sabe que las herramientas viven en MCP Servers: solo pide
 * la lista y ejecuta por nombre. El adaptador real habla MCP por HTTP; las
 * pruebas conectan los mismos servidores en memoria.
 */

/** Indicacion para la interfaz que un MCP Server adjunta a su resultado. */
export type UiDirective =
  | { readonly type: 'image'; readonly url: string; readonly alt: string }
  | { readonly type: 'open_url'; readonly url: string; readonly title: string }

export interface ToolCallOutcome {
  readonly ok: boolean
  /** Datos para el modelo. Son de un tercero: se sanean antes de usarlos. */
  readonly payload: unknown
  readonly ui: readonly UiDirective[]
}

export interface ToolGateway {
  listTools(): Promise<readonly LlmToolSpec[]>
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome>
  close(): Promise<void>
}
