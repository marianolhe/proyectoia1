import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { startMcpHttpServer, type McpHttpHandle } from './http-server.js'
import { runMcpServer } from './run-cli.js'
import { createMcpServer, defineTool, fail } from './tool-definition.js'

const echo = defineTool({
  name: 'echo',
  title: 'Eco',
  description: 'Devuelve el texto',
  inputSchema: { text: z.string().min(1) },
  handler: async ({ text }) =>
    text === 'falla'
      ? fail('boom', 'fallo pedido')
      : {
          ok: true,
          data: { text },
          ui: [{ type: 'open_url', url: 'https://www.imdb.com/', title: 'IMDb' }],
        },
})

const factory = () => createMcpServer({ name: 'test', version: '0.0.1', tools: [echo] })

async function connectInMemory() {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await factory().connect(serverSide)
  const client = new Client({ name: 'c', version: '0' })
  await client.connect(clientSide)
  return client
}

describe('createMcpServer', () => {
  it('publica las herramientas con su esquema', async () => {
    const client = await connectInMemory()
    const { tools } = await client.listTools()

    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ name: 'echo', title: 'Eco', description: 'Devuelve el texto' })
    expect(tools[0]?.inputSchema.properties).toHaveProperty('text')
  })

  it('devuelve el resultado estructurado y como texto', async () => {
    const client = await connectInMemory()
    const result = await client.callTool({ name: 'echo', arguments: { text: 'hola' } })

    expect(result.isError).toBe(false)
    expect(result.structuredContent).toMatchObject({ ok: true, data: { text: 'hola' } })
    expect(JSON.parse((result.content as { text: string }[])[0]!.text)).toMatchObject({ ok: true })
  })

  it('marca como error un resultado fallido', async () => {
    const client = await connectInMemory()
    const result = await client.callTool({ name: 'echo', arguments: { text: 'falla' } })

    expect(result.isError).toBe(true)
    expect(result.structuredContent).toEqual({
      ok: false,
      error: { code: 'boom', message: 'fallo pedido' },
    })
  })

  it('el SDK rechaza argumentos que no cumplen el esquema', async () => {
    const client = await connectInMemory()
    const result = await client.callTool({ name: 'echo', arguments: { text: '' } })
    expect(result.isError).toBe(true)
  })
})

describe('startMcpHttpServer', () => {
  let handle: McpHttpHandle | null = null

  afterEach(async () => {
    await handle?.close()
    handle = null
  })

  it('atiende MCP por HTTP sin estado', async () => {
    handle = await startMcpHttpServer({ port: 0, createServer: factory })
    const client = new Client({ name: 'c', version: '0' })
    await client.connect(new StreamableHTTPClientTransport(new URL(handle.url)))

    const result = await client.callTool({ name: 'echo', arguments: { text: 'por http' } })
    expect(result.structuredContent).toMatchObject({ data: { text: 'por http' } })
    await client.close()
  })

  it('responde el chequeo de salud y 404 en otras rutas', async () => {
    handle = await startMcpHttpServer({ port: 0, createServer: factory })
    const base = `http://localhost:${handle.port}`

    await expect((await fetch(`${base}/healthz`)).json()).resolves.toEqual({ status: 'ok' })
    expect((await fetch(`${base}/otra`)).status).toBe(404)
  })

  it('rechaza GET y DELETE en modo sin estado', async () => {
    handle = await startMcpHttpServer({ port: 0, createServer: factory })
    const response = await fetch(handle.url)

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('POST')
  })

  it('responde 500 si el servidor MCP no se puede crear', async () => {
    handle = await startMcpHttpServer({
      port: 0,
      createServer: () => {
        const server = factory()
        vi.spyOn(server, 'connect').mockRejectedValue(new Error('roto'))
        return server
      },
    })
    const response = await fetch(handle.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(response.status).toBe(500)
  })

  it('rechaza si el puerto esta ocupado', async () => {
    handle = await startMcpHttpServer({ port: 0, createServer: factory })
    await expect(startMcpHttpServer({ port: handle.port, createServer: factory })).rejects.toThrow()
  })
})

describe('runMcpServer', () => {
  it('arranca por HTTP en el puerto de su variable', async () => {
    const log = vi.fn()
    const result = await runMcpServer({
      label: 'prueba',
      createServer: factory,
      env: { MCP_PRUEBA_PORT: '0', PORT: '1' },
      portVariable: 'MCP_PRUEBA_PORT',
      defaultPort: 1,
      log,
    })

    expect(result.transport).toBe('http')
    expect(log).toHaveBeenCalledWith(expect.stringContaining('[prueba] escuchando en http://'))
    if (result.transport === 'http') await result.handle.close()
  })

  it('arranca por stdio cuando MCP_TRANSPORT=stdio', async () => {
    const server = factory()
    const connect = vi.spyOn(server, 'connect').mockResolvedValue()
    const log = vi.fn()

    const result = await runMcpServer({
      label: 'prueba',
      createServer: () => server,
      env: { MCP_TRANSPORT: 'stdio' },
      portVariable: 'MCP_PRUEBA_PORT',
      defaultPort: 1,
      log,
    })

    expect(result).toEqual({ transport: 'stdio' })
    expect(connect).toHaveBeenCalled()
    expect(log).toHaveBeenCalledWith('[prueba] escuchando por stdio')
  })

  it('por defecto escribe en stderr', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await runMcpServer({
      label: 'x',
      createServer: factory,
      env: {},
      portVariable: 'MCP_PRUEBA_PORT',
      defaultPort: 0,
    })
    expect(spy).toHaveBeenCalled()
    if (result.transport === 'http') await result.handle.close()
    spy.mockRestore()
  })
})
