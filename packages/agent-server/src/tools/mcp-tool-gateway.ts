import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { LlmToolSpec } from '../ports/llm.js'
import type { ToolCallOutcome, ToolGateway, UiDirective } from '../ports/tool-gateway.js'

/**
 * Adaptador del puerto de herramientas sobre MCP.
 *
 * El backend es un cliente MCP comun: descubre las herramientas con
 * `tools/list` y no tiene ninguna escrita a mano. Agregar una herramienta, o
 * un MCP Server entero, no requiere tocar ni redesplegar el orquestador.
 */

/** Lo que el adaptador usa de un cliente MCP. */
export interface McpClientLike {
  listTools(): Promise<{
    tools: { name: string; description?: string; inputSchema: Record<string, unknown> }[]
  }>
  callTool(
    params: { name: string; arguments: Record<string, unknown> },
    resultSchema?: undefined,
    options?: { timeout?: number },
  ): Promise<unknown>
  close(): Promise<void>
}

export interface McpConnector {
  readonly name: string
  connect(): Promise<McpClientLike>
}

export interface McpToolGatewayOptions {
  readonly connectors: readonly McpConnector[]
  readonly callTimeoutMs?: number
  /** Cada cuanto se vuelve a pedir la lista de herramientas. */
  readonly catalogTtlMs?: number
  readonly now?: () => number
}

interface Catalog {
  readonly specs: readonly LlmToolSpec[]
  readonly owners: ReadonlyMap<string, string>
  readonly loadedAt: number
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Conector real: Streamable HTTP contra un MCP Server desplegado aparte. */
export function httpConnector(name: string, url: string): McpConnector {
  return {
    name,
    connect: async () => {
      const client = new Client({ name: 'agichat-agent', version: '0.1.0' })
      await client.connect(new StreamableHTTPClientTransport(new URL(url)))
      return client as unknown as McpClientLike
    },
  }
}

function parseUi(raw: unknown): UiDirective[] {
  if (!Array.isArray(raw)) return []
  const directives: UiDirective[] = []
  for (const item of raw) {
    if (!isObject(item) || typeof item.url !== 'string') continue
    if (item.type === 'image') {
      directives.push({ type: 'image', url: item.url, alt: String(item.alt ?? '') })
    } else if (item.type === 'open_url') {
      directives.push({ type: 'open_url', url: item.url, title: String(item.title ?? '') })
    }
  }
  return directives
}

/** Lee el resultado estructurado; si el servidor solo mando texto, lo interpreta. */
export function parseToolResult(raw: unknown): ToolCallOutcome {
  const result = isObject(raw) ? raw : {}
  let structured: unknown = result.structuredContent

  if (!isObject(structured) && Array.isArray(result.content)) {
    const first: unknown = result.content[0]
    if (isObject(first) && typeof first.text === 'string') {
      try {
        structured = JSON.parse(first.text)
      } catch {
        structured = { ok: result.isError !== true, data: { text: first.text } }
      }
    }
  }
  if (!isObject(structured)) {
    return { ok: false, payload: { message: 'La herramienta no devolvio datos.' }, ui: [] }
  }

  const ok = structured.ok === true && result.isError !== true
  return {
    ok,
    payload: ok ? (structured.data ?? {}) : (structured.error ?? structured),
    // Una herramienta que fallo no puede pedir que se abra o se pinte nada.
    ui: ok ? parseUi(structured.ui) : [],
  }
}

export class McpToolGateway implements ToolGateway {
  readonly #connectors: ReadonlyMap<string, McpConnector>
  readonly #clients = new Map<string, Promise<McpClientLike>>()
  readonly #callTimeoutMs: number
  readonly #catalogTtlMs: number
  readonly #now: () => number
  #catalog: Catalog | null = null

  constructor(options: McpToolGatewayOptions) {
    this.#connectors = new Map(options.connectors.map((connector) => [connector.name, connector]))
    this.#callTimeoutMs = options.callTimeoutMs ?? 15_000
    this.#catalogTtlMs = options.catalogTtlMs ?? 5 * 60_000
    this.#now = options.now ?? (() => Date.now())
  }

  async listTools(): Promise<readonly LlmToolSpec[]> {
    return (await this.#loadCatalog()).specs
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<ToolCallOutcome> {
    const owner = (await this.#loadCatalog()).owners.get(name)
    if (owner === undefined) {
      return { ok: false, payload: { message: `La herramienta "${name}" no existe.` }, ui: [] }
    }

    try {
      const client = await this.#client(owner)
      const raw = await client.callTool({ name, arguments: args }, undefined, {
        timeout: this.#callTimeoutMs,
      })
      return parseToolResult(raw)
    } catch {
      // Se descarta la conexion para que la siguiente llamada reconecte: el
      // MCP Server pudo reiniciarse o escalar a otra replica.
      this.#clients.delete(owner)
      return {
        ok: false,
        payload: { message: `El servicio "${owner}" no esta disponible en este momento.` },
        ui: [],
      }
    }
  }

  async close(): Promise<void> {
    const clients = [...this.#clients.values()]
    this.#clients.clear()
    this.#catalog = null
    await Promise.all(
      clients.map(async (pending) => {
        try {
          await (await pending).close()
        } catch {
          // Cerrar una conexion que ya estaba rota no es un error que reportar.
        }
      }),
    )
  }

  #client(name: string): Promise<McpClientLike> {
    const existing = this.#clients.get(name)
    if (existing !== undefined) return existing

    const connector = this.#connectors.get(name)
    if (connector === undefined) return Promise.reject(new Error(`Conector desconocido: ${name}`))

    const pending = connector.connect()
    this.#clients.set(name, pending)
    pending.catch(() => this.#clients.delete(name))
    return pending
  }

  async #loadCatalog(): Promise<Catalog> {
    const current = this.#catalog
    if (current !== null && this.#now() - current.loadedAt < this.#catalogTtlMs) return current

    const specs: LlmToolSpec[] = []
    const owners = new Map<string, string>()
    let failures = 0

    for (const name of this.#connectors.keys()) {
      try {
        const client = await this.#client(name)
        const { tools } = await client.listTools()
        for (const tool of tools) {
          // Si dos servidores publican el mismo nombre gana el primero: el
          // orden de MCP_SERVERS es la prioridad.
          if (owners.has(tool.name)) continue
          owners.set(tool.name, name)
          specs.push({
            name: tool.name,
            description: tool.description ?? '',
            inputSchema: tool.inputSchema,
          })
        }
      } catch {
        failures += 1
        this.#clients.delete(name)
      }
    }

    const catalog: Catalog = { specs, owners, loadedAt: this.#now() }
    // Un catalogo incompleto no se guarda: el servidor caido puede volver en
    // segundos y sus herramientas deben reaparecer sin esperar el vencimiento.
    if (failures === 0) this.#catalog = catalog
    return catalog
  }
}
