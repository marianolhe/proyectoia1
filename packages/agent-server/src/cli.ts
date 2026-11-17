import { createCanary } from '@agichat/guardrails'
import { loadConfig } from './config.js'
import { createLlm } from './llm/create-llm.js'
import { startAgentServer } from './server.js'
import { buildSystemPrompt } from './system-prompt.js'
import { McpToolGateway, httpConnector } from './tools/mcp-tool-gateway.js'

const loaded = loadConfig(process.env)

if (!loaded.ok) {
  console.error(`[agent-server] ${loaded.reason}`)
  process.exitCode = 1
} else {
  const { config } = loaded
  // Un canario nuevo por proceso: si se filtra, deja de servir al reiniciar.
  const canary = createCanary()

  startAgentServer({
    port: config.port,
    allowedOrigins: config.allowedOrigins,
    rateLimitPerMinute: config.rateLimitPerMinute,
    // Una linea JSON por evento: cualquier recolector de logs la puede indexar.
    log: (event) => console.warn(JSON.stringify({ scope: 'security', ...event })),
    deps: {
      llm: createLlm(config.llm),
      tools: new McpToolGateway({
        connectors: config.mcpServers.map((server) => httpConnector(server.name, server.url)),
      }),
      systemPrompt: buildSystemPrompt(canary),
      canary,
      secrets: config.secrets,
    },
  })
    .then((handle) => {
      console.log(`[agent-server] escuchando en ws://localhost:${handle.port}`)
    })
    .catch((error: unknown) => {
      console.error('[agent-server] no se pudo iniciar', error)
      process.exitCode = 1
    })
}
