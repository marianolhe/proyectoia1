import { startMockServer } from './server.js'

/**
 * Punto de entrada del proceso. Separado de `server.ts` para que la logica
 * de arranque se pueda probar (`startMockServer`) sin ejecutar un binario.
 */

const port = Number(process.env.AGICHAT_MOCK_PORT ?? 8787)

startMockServer({ port })
  .then((handle) => {
    console.log(`[mock-server] escuchando en ws://localhost:${handle.port}`)
  })
  .catch((error: unknown) => {
    console.error('[mock-server] no se pudo iniciar', error)
    process.exitCode = 1
  })
