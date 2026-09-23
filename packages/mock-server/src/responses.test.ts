import { describe, expect, it } from 'vitest'
import { FAILURE_SCENARIO, SHOWCASE_SCENARIO, XSS_SCENARIO, selectScenario } from './responses.js'

describe('selectScenario', () => {
  it('devuelve el escenario de muestra por defecto', () => {
    expect(selectScenario('cual es el estado de mi carga')).toEqual({
      kind: 'response',
      scenario: SHOWCASE_SCENARIO,
    })
  })

  it('devuelve el escenario de XSS cuando el texto lo pide', () => {
    expect(selectScenario('mandame un ejemplo de xss')).toEqual({
      kind: 'response',
      scenario: XSS_SCENARIO,
    })
    expect(selectScenario('quiero ver HTML crudo')).toEqual({
      kind: 'response',
      scenario: XSS_SCENARIO,
    })
  })

  it('devuelve el escenario de fallo cuando el texto lo pide', () => {
    expect(selectScenario('simula un error')).toEqual({
      kind: 'failure',
      scenario: FAILURE_SCENARIO,
    })
    expect(selectScenario('quiero que falles')).toEqual({
      kind: 'failure',
      scenario: FAILURE_SCENARIO,
    })
  })

  it('el disparador de fallo tiene prioridad sobre el de xss', () => {
    expect(selectScenario('haz fail con html')).toEqual({
      kind: 'failure',
      scenario: FAILURE_SCENARIO,
    })
  })

  it('no distingue mayusculas de minusculas', () => {
    expect(selectScenario('MUESTRAME XSS')).toEqual({
      kind: 'response',
      scenario: XSS_SCENARIO,
    })
  })
})
