import { runMcpServer } from '@agichat/mcp-kit'
import { createTmdbServerFactory, loadTmdbConfig } from './server.js'

const loaded = loadTmdbConfig(process.env)

if (!loaded.ok) {
  console.error(`[mcp-tmdb] ${loaded.reason}`)
  process.exitCode = 1
} else {
  runMcpServer({
    label: 'mcp-tmdb',
    createServer: createTmdbServerFactory(loaded.config),
    env: process.env,
    defaultPort: 8801,
  }).catch((error: unknown) => {
    console.error('[mcp-tmdb] no se pudo iniciar', error)
    process.exitCode = 1
  })
}
