/**
 * Configuracion del backend, leida una sola vez del entorno.
 *
 * Todo lo que cambia entre ambientes entra por variables de entorno y nada se
 * escribe en disco: el mismo contenedor sirve en local, en CI y en produccion.
 * Las claves de TMDB y Google Books no aparecen aqui: viven solo en sus MCP
 * Servers, de modo que el proceso que habla con el modelo ni siquiera las tiene.
 */

export interface McpServerEndpoint {
  readonly name: string
  readonly url: string
}

export type LlmConfig =
  | { readonly provider: 'anthropic'; readonly model?: string }
  | {
      readonly provider: 'openai-compatible'
      readonly baseUrl: string
      readonly apiKey: string
      readonly model: string
    }

export interface AgentServerConfig {
  readonly port: number
  readonly llm: LlmConfig
  readonly mcpServers: readonly McpServerEndpoint[]
  /** Origenes que pueden abrir el WebSocket. Vacio significa cualquiera. */
  readonly allowedOrigins: readonly string[]
  readonly rateLimitPerMinute: number
  /** Valores que nunca deben aparecer en una respuesta. */
  readonly secrets: readonly string[]
}

export type ConfigResult =
  | { readonly ok: true; readonly config: AgentServerConfig }
  | { readonly ok: false; readonly reason: string }

type Env = Record<string, string | undefined>

const DEFAULT_MCP_SERVERS = 'tmdb=http://localhost:8801/mcp,books=http://localhost:8802/mcp'

function value(env: Env, key: string): string | undefined {
  const raw = env[key]?.trim()
  return raw === undefined || raw === '' ? undefined : raw
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function parseMcpServers(raw: string): McpServerEndpoint[] | null {
  const endpoints: McpServerEndpoint[] = []
  for (const part of raw.split(',')) {
    const separator = part.indexOf('=')
    if (separator <= 0) return null
    const name = part.slice(0, separator).trim()
    const url = part.slice(separator + 1).trim()
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    } catch {
      return null
    }
    endpoints.push({ name, url })
  }
  return endpoints
}

function loadLlm(env: Env): { ok: true; llm: LlmConfig } | { ok: false; reason: string } {
  const provider = value(env, 'LLM_PROVIDER') ?? 'anthropic'

  if (provider === 'anthropic') {
    // Sin credencial el agente arrancaba y fallaba recien con el primer
    // mensaje, con un "no disponible" que no decia por que. Mejor no arrancar.
    if (
      value(env, 'ANTHROPIC_API_KEY') === undefined &&
      value(env, 'ANTHROPIC_AUTH_TOKEN') === undefined
    ) {
      return {
        ok: false,
        reason:
          'Falta la credencial del modelo. Con LLM_PROVIDER=anthropic defina ANTHROPIC_API_KEY; para usar Gemini gratis defina LLM_PROVIDER=openai-compatible con LLM_BASE_URL, LLM_API_KEY y LLM_MODEL (ver .env.example).',
      }
    }
    const model = value(env, 'ANTHROPIC_MODEL')
    return { ok: true, llm: { provider, ...(model === undefined ? {} : { model }) } }
  }

  if (provider === 'openai-compatible') {
    const baseUrl = value(env, 'LLM_BASE_URL')
    const apiKey = value(env, 'LLM_API_KEY')
    const model = value(env, 'LLM_MODEL')
    if (baseUrl === undefined || apiKey === undefined || model === undefined) {
      return {
        ok: false,
        reason:
          'Con LLM_PROVIDER=openai-compatible debe definir LLM_BASE_URL, LLM_API_KEY y LLM_MODEL.',
      }
    }
    return { ok: true, llm: { provider, baseUrl, apiKey, model } }
  }

  return {
    ok: false,
    reason: `LLM_PROVIDER="${provider}" no es valido. Use "anthropic" u "openai-compatible".`,
  }
}

export function loadConfig(env: Env): ConfigResult {
  const llm = loadLlm(env)
  if (!llm.ok) return llm

  const mcpServers = parseMcpServers(value(env, 'MCP_SERVERS') ?? DEFAULT_MCP_SERVERS)
  if (mcpServers === null) {
    return {
      ok: false,
      reason: 'MCP_SERVERS debe tener la forma "nombre=http://host:puerto/mcp,otro=...".',
    }
  }

  const secrets = [value(env, 'ANTHROPIC_API_KEY'), value(env, 'LLM_API_KEY')].filter(
    (secret): secret is string => secret !== undefined,
  )

  return {
    ok: true,
    config: {
      port: positiveInt(value(env, 'PORT'), 8787),
      llm: llm.llm,
      mcpServers,
      allowedOrigins: (value(env, 'ALLOWED_ORIGINS') ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
      rateLimitPerMinute: positiveInt(value(env, 'RATE_LIMIT_PER_MINUTE'), 20),
      secrets,
    },
  }
}
