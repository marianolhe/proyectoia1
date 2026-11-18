import { describe, expect, it } from 'vitest'
import { loadConfig, parseMcpServers } from './config.js'
import { AnthropicLlm } from './llm/anthropic-llm.js'
import { createLlm } from './llm/create-llm.js'
import { OpenAiCompatibleLlm } from './llm/openai-compatible-llm.js'

describe('loadConfig', () => {
  it('tiene valores por defecto para desarrollo local', () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-1' })).toEqual({
      ok: true,
      config: {
        port: 8787,
        llm: { provider: 'anthropic' },
        mcpServers: [
          { name: 'tmdb', url: 'http://localhost:8801/mcp' },
          { name: 'books', url: 'http://localhost:8802/mcp' },
        ],
        allowedOrigins: [],
        rateLimitPerMinute: 20,
        secrets: ['sk-ant-1'],
      },
    })
  })

  it('no arranca con Claude si falta su credencial y explica como usar Gemini', () => {
    const result = loadConfig({})
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/ANTHROPIC_API_KEY/)
    expect(!result.ok && result.reason).toMatch(/LLM_PROVIDER=openai-compatible/)
  })

  it('acepta un token de autenticacion en lugar de la clave', () => {
    expect(loadConfig({ ANTHROPIC_AUTH_TOKEN: 't' })).toMatchObject({ ok: true })
  })

  it('lee todo del entorno', () => {
    const result = loadConfig({
      PORT: '9000',
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
      ANTHROPIC_API_KEY: 'sk-ant-1',
      MCP_SERVERS: 'tmdb=http://mcp-tmdb:8801/mcp',
      ALLOWED_ORIGINS: 'https://a.com, https://b.com ,',
      RATE_LIMIT_PER_MINUTE: '5',
    })
    expect(result).toMatchObject({
      ok: true,
      config: {
        port: 9000,
        llm: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
        mcpServers: [{ name: 'tmdb', url: 'http://mcp-tmdb:8801/mcp' }],
        allowedOrigins: ['https://a.com', 'https://b.com'],
        rateLimitPerMinute: 5,
        secrets: ['sk-ant-1'],
      },
    })
  })

  it('ignora numeros invalidos', () => {
    expect(
      loadConfig({ ANTHROPIC_API_KEY: 'k', PORT: 'abc', RATE_LIMIT_PER_MINUTE: '-1' }),
    ).toMatchObject({
      config: { port: 8787, rateLimitPerMinute: 20 },
    })
  })

  it('configura un proveedor compatible con chat completions', () => {
    expect(
      loadConfig({
        LLM_PROVIDER: 'openai-compatible',
        LLM_BASE_URL: 'https://api.test/v1',
        LLM_API_KEY: 'k',
        LLM_MODEL: 'm',
      }),
    ).toMatchObject({
      ok: true,
      config: {
        llm: {
          provider: 'openai-compatible',
          baseUrl: 'https://api.test/v1',
          apiKey: 'k',
          model: 'm',
        },
        secrets: ['k'],
      },
    })
  })

  it('explica que falta para el proveedor compatible', () => {
    expect(loadConfig({ LLM_PROVIDER: 'openai-compatible', LLM_MODEL: 'm' })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('LLM_BASE_URL'),
    })
  })

  it('rechaza un proveedor desconocido o MCP_SERVERS mal escrito', () => {
    expect(loadConfig({ LLM_PROVIDER: 'otro' })).toMatchObject({ ok: false })
    expect(loadConfig({ ANTHROPIC_API_KEY: 'k', MCP_SERVERS: 'sin-igual' })).toMatchObject({
      ok: false,
    })
  })
})

describe('parseMcpServers', () => {
  it.each(['=http://a/mcp', 'a=no es url', 'a=ftp://a/mcp', 'a=http://a/mcp,b'])(
    'rechaza %s',
    (raw) => {
      expect(parseMcpServers(raw)).toBeNull()
    },
  )

  it('acepta varios servidores en orden', () => {
    expect(parseMcpServers('a=https://x/mcp, b=http://y:1/mcp')).toEqual([
      { name: 'a', url: 'https://x/mcp' },
      { name: 'b', url: 'http://y:1/mcp' },
    ])
  })
})

describe('createLlm', () => {
  it('elige el adaptador segun el proveedor', () => {
    expect(
      createLlm({
        provider: 'openai-compatible',
        baseUrl: 'https://a/v1',
        apiKey: 'k',
        model: 'm',
      }),
    ).toBeInstanceOf(OpenAiCompatibleLlm)
    process.env.ANTHROPIC_API_KEY ??= 'sk-ant-prueba'
    expect(createLlm({ provider: 'anthropic' })).toBeInstanceOf(AnthropicLlm)
    expect(createLlm({ provider: 'anthropic', model: 'claude-opus-5-5' })).toBeInstanceOf(
      AnthropicLlm,
    )
  })
})
