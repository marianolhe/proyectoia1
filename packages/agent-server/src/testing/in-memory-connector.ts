import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpClientLike, McpConnector } from '../tools/mcp-tool-gateway.js'

/**
 * Conecta un MCP Server dentro del mismo proceso, sin red.
 *
 * Lo usan las pruebas y los evals: el agente habla el protocolo MCP real
 * (descubrimiento, validacion de argumentos, resultados estructurados) contra
 * los servidores reales, y lo unico simulado es la API externa que hay detras.
 */
export function inMemoryConnector(name: string, createServer: () => McpServer): McpConnector {
  return {
    name,
    connect: async () => {
      const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
      await createServer().connect(serverSide)
      const client = new Client({ name: 'agichat-agent-test', version: '0.1.0' })
      await client.connect(clientSide)
      return client as unknown as McpClientLike
    },
  }
}
