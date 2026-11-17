import { createMcpServer, defineTool, startMcpHttpServer } from '@agichat/mcp-kit'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { inMemoryConnector } from '../testing/in-memory-connector.js'
import {
  McpToolGateway,
  httpConnector,
  parseToolResult,
  type McpClientLike,
  type McpConnector,
} from './mcp-tool-gateway.js'

const poster = defineTool({
  name: 'tmdb_show_poster',
  title: 'Poster',
  description: 'Muestra el poster',
  inputSchema: { movie_id: z.number() },
  handler: async ({ movie_id }) => ({
    ok: true,
    data: { movie_id },
    ui: [{ type: 'image', url: 'https://image.tmdb.org/a.jpg', alt: 'A' }],
  }),
})

const tmdb = () => createMcpServer({ name: 'tmdb', version: '0', tools: [poster] })

describe('McpToolGateway con MCP Servers reales en memoria', () => {
  it('descubre las herramientas y las ejecuta por nombre', async () => {
    const gateway = new McpToolGateway({ connectors: [inMemoryConnector('tmdb', tmdb)] })

    const tools = await gateway.listTools()
    expect(tools).toEqual([
      expect.objectContaining({ name: 'tmdb_show_poster', description: 'Muestra el poster' }),
    ])
    expect(tools[0]?.inputSchema).toMatchObject({ type: 'object' })

    expect(await gateway.callTool('tmdb_show_poster', { movie_id: 7 })).toEqual({
      ok: true,
      payload: { movie_id: 7 },
      ui: [{ type: 'image', url: 'https://image.tmdb.org/a.jpg', alt: 'A' }],
    })
    await gateway.close()
  })

  it('responde con error ante una herramienta desconocida', async () => {
    const gateway = new McpToolGateway({ connectors: [inMemoryConnector('tmdb', tmdb)] })
    expect(await gateway.callTool('no_existe', {})).toMatchObject({ ok: false, ui: [] })
  })

  it('funciona contra un servidor HTTP real', async () => {
    const handle = await startMcpHttpServer({ port: 0, createServer: tmdb })
    const gateway = new McpToolGateway({ connectors: [httpConnector('tmdb', handle.url)] })

    expect(await gateway.callTool('tmdb_show_poster', { movie_id: 1 })).toMatchObject({ ok: true })
    await gateway.close()
    await handle.close()
  })
})

function fakeClient(overrides: Partial<McpClientLike> = {}): McpClientLike {
  return {
    listTools: () => Promise.resolve({ tools: [{ name: 'uno', inputSchema: { type: 'object' } }] }),
    callTool: () => Promise.resolve({ structuredContent: { ok: true, data: { a: 1 } } }),
    close: () => Promise.resolve(),
    ...overrides,
  }
}

describe('McpToolGateway: resiliencia', () => {
  it('cachea el catalogo y lo renueva al vencer', async () => {
    let now = 0
    const listTools = vi.fn(fakeClient().listTools)
    const gateway = new McpToolGateway({
      connectors: [{ name: 'a', connect: () => Promise.resolve(fakeClient({ listTools })) }],
      catalogTtlMs: 100,
      now: () => now,
    })

    await gateway.listTools()
    await gateway.listTools()
    expect(listTools).toHaveBeenCalledTimes(1)
    now = 100
    await gateway.listTools()
    expect(listTools).toHaveBeenCalledTimes(2)
  })

  it('si un servidor esta caido sirve los demas y reintenta despues', async () => {
    let up = false
    const flaky: McpConnector = {
      name: 'books',
      connect: () =>
        up
          ? Promise.resolve(
              fakeClient({
                listTools: () => Promise.resolve({ tools: [{ name: 'dos', inputSchema: {} }] }),
              }),
            )
          : Promise.reject(new Error('caido')),
    }
    const gateway = new McpToolGateway({
      connectors: [{ name: 'tmdb', connect: () => Promise.resolve(fakeClient()) }, flaky],
    })

    expect((await gateway.listTools()).map((tool) => tool.name)).toEqual(['uno'])
    up = true
    expect((await gateway.listTools()).map((tool) => tool.name)).toEqual(['uno', 'dos'])
  })

  it('ante nombres repetidos gana el primer servidor', async () => {
    const gateway = new McpToolGateway({
      connectors: [
        {
          name: 'a',
          connect: () =>
            Promise.resolve(
              fakeClient({
                listTools: () =>
                  Promise.resolve({ tools: [{ name: 'x', description: 'de a', inputSchema: {} }] }),
              }),
            ),
        },
        {
          name: 'b',
          connect: () =>
            Promise.resolve(
              fakeClient({
                listTools: () =>
                  Promise.resolve({ tools: [{ name: 'x', description: 'de b', inputSchema: {} }] }),
              }),
            ),
        },
      ],
    })
    expect(await gateway.listTools()).toEqual([{ name: 'x', description: 'de a', inputSchema: {} }])
  })

  it('si la llamada falla reconecta en la siguiente', async () => {
    const connect = vi
      .fn<McpConnector['connect']>()
      .mockResolvedValueOnce(fakeClient({ callTool: () => Promise.reject(new Error('cortado')) }))
      .mockResolvedValue(fakeClient())
    const gateway = new McpToolGateway({ connectors: [{ name: 'a', connect }], catalogTtlMs: 0 })

    expect(await gateway.callTool('uno', {})).toMatchObject({
      ok: false,
      payload: { message: 'El servicio "a" no esta disponible en este momento.' },
    })
    expect(await gateway.callTool('uno', {})).toMatchObject({ ok: true })
  })

  it('close tolera conexiones rotas', async () => {
    const gateway = new McpToolGateway({
      connectors: [
        {
          name: 'a',
          connect: () =>
            Promise.resolve(fakeClient({ close: () => Promise.reject(new Error('x')) })),
        },
      ],
    })
    await gateway.listTools()
    await expect(gateway.close()).resolves.toBeUndefined()
  })
})

describe('parseToolResult', () => {
  it('lee el resultado estructurado', () => {
    expect(parseToolResult({ structuredContent: { ok: true, data: { a: 1 }, ui: [] } })).toEqual({
      ok: true,
      payload: { a: 1 },
      ui: [],
    })
  })

  it('cae al texto si no hay resultado estructurado', () => {
    expect(
      parseToolResult({ content: [{ type: 'text', text: '{"ok":true,"data":{"b":2}}' }] }),
    ).toMatchObject({ ok: true, payload: { b: 2 } })
    expect(parseToolResult({ content: [{ type: 'text', text: 'texto libre' }] })).toMatchObject({
      ok: true,
      payload: { text: 'texto libre' },
    })
  })

  it('un error no puede traer directivas de interfaz', () => {
    expect(
      parseToolResult({
        isError: true,
        structuredContent: {
          ok: true,
          ui: [{ type: 'open_url', url: 'https://www.imdb.com/', title: '' }],
        },
      }),
    ).toMatchObject({ ok: false, ui: [] })
    expect(
      parseToolResult({ structuredContent: { ok: false, error: { code: 'x', message: 'y' } } }),
    ).toEqual({ ok: false, payload: { code: 'x', message: 'y' }, ui: [] })
  })

  it('filtra directivas mal formadas', () => {
    expect(
      parseToolResult({
        structuredContent: {
          ok: true,
          ui: [
            { type: 'image', url: 'https://a/b.png' },
            { type: 'otra', url: 'u' },
            { url: 3 },
            'x',
          ],
        },
      }).ui,
    ).toEqual([{ type: 'image', url: 'https://a/b.png', alt: '' }])
    expect(
      parseToolResult({
        structuredContent: { ok: true, ui: [{ type: 'open_url', url: 'https://a' }] },
      }).ui,
    ).toEqual([{ type: 'open_url', url: 'https://a', title: '' }])
    expect(parseToolResult({ structuredContent: { ok: true, ui: 'x' } }).ui).toEqual([])
  })

  it('un resultado vacio es un fallo', () => {
    expect(parseToolResult(null)).toMatchObject({ ok: false })
    expect(parseToolResult({ content: [] })).toMatchObject({ ok: false })
  })
})
