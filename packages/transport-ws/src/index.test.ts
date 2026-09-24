import { describe, expect, it } from 'vitest'
import * as api from './index.js'

// Protege la API publica: renombrar o dejar de exportar algo rompe a los
// integradores aunque las pruebas internas sigan en verde.
describe('API publica de @agichat/transport-ws', () => {
  it('expone el adaptador y sus utilidades', () => {
    expect(Object.keys(api).sort()).toEqual([
      'WebSocketTransport',
      'backoffDelay',
      'parseAgentEvent',
    ])
  })
})
