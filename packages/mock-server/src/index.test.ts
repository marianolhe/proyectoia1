import { describe, expect, it } from 'vitest'
import * as api from './index.js'

// Protege la API publica del paquete frente a renombres accidentales.
describe('API publica de @agichat/mock-server', () => {
  it('expone el servidor, el agente y sus piezas puras', () => {
    expect(Object.keys(api).sort()).toEqual([
      'FAILURE_SCENARIO',
      'RESPONSE_SCENARIOS',
      'SHOWCASE_SCENARIO',
      'XSS_SCENARIO',
      'parseInboundFrame',
      'parseInboundJson',
      'runAgentTurn',
      'selectScenario',
      'startMockServer',
      'streamFailure',
      'streamResponse',
      'tokenize',
    ])
  })
})
