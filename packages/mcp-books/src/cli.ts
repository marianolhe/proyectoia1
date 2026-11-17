import { runMcpServer } from '@agichat/mcp-kit'
import { createBooksServerFactory, loadBooksConfig } from './server.js'

// Carga el .env de la raiz del repositorio si existe (`pnpm agent`, `pnpm evals`).
// En Docker no hay archivo: las variables ya llegan por el entorno. Las que
// ya estan definidas no se sobrescriben.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url))
} catch {
  // Sin .env se usa solo el entorno del proceso.
}

runMcpServer({
  label: 'mcp-books',
  createServer: createBooksServerFactory(loadBooksConfig(process.env)),
  env: process.env,
  portVariable: 'MCP_BOOKS_PORT',
  defaultPort: 8802,
}).catch((error: unknown) => {
  console.error('[mcp-books] no se pudo iniciar', error)
  process.exitCode = 1
})
