import { runMcpServer } from '@agichat/mcp-kit'
import { createTmdbServerFactory, loadTmdbConfig } from './server.js'

// Carga el .env de la raiz del repositorio si existe (`pnpm agent`, `pnpm evals`).
// En Docker no hay archivo: las variables ya llegan por el entorno. Las que
// ya estan definidas no se sobrescriben.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url))
} catch {
  // Sin .env se usa solo el entorno del proceso.
}

const loaded = loadTmdbConfig(process.env)

if (!loaded.ok) {
  console.error(`[mcp-tmdb] ${loaded.reason}`)
  process.exitCode = 1
} else {
  runMcpServer({
    label: 'mcp-tmdb',
    createServer: createTmdbServerFactory(loaded.config),
    env: process.env,
    portVariable: 'MCP_TMDB_PORT',
    defaultPort: 8801,
  }).catch((error: unknown) => {
    console.error('[mcp-tmdb] no se pudo iniciar', error)
    process.exitCode = 1
  })
}
