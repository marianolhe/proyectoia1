import { runMcpServer } from '@agichat/mcp-kit'
import { createBooksServerFactory, loadBooksConfig } from './server.js'

runMcpServer({
  label: 'mcp-books',
  createServer: createBooksServerFactory(loadBooksConfig(process.env)),
  env: process.env,
  defaultPort: 8802,
}).catch((error: unknown) => {
  console.error('[mcp-books] no se pudo iniciar', error)
  process.exitCode = 1
})
