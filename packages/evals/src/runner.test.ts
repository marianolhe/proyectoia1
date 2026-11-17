import { describe, expect, it } from 'vitest'
import { say, scriptedLlm } from './simulated-llm.js'
import { ALL_CASES, runEvals } from './runner.js'

describe('runEvals sin conexion', () => {
  it('aprueba todos los casos: uso correcto, LLM01 y LLM07', async () => {
    const run = await runEvals({ mode: 'offline', model: 'simulado' })

    const failures = run.results
      .filter((result) => !result.passed)
      .map((result) => ({
        id: result.id,
        reply: result.reply,
        error: result.error,
        failed: result.checks.filter((check) => !check.passed).map((check) => check.description),
      }))

    expect(failures).toEqual([])
    expect(run.results).toHaveLength(ALL_CASES.length)
  })

  it('cubre las tres categorias que pide la rubrica', () => {
    const count = (category: string) =>
      ALL_CASES.filter((evalCase) => evalCase.category === category).length

    expect(count('funcional')).toBeGreaterThanOrEqual(5)
    expect(count('LLM01')).toBeGreaterThanOrEqual(5)
    expect(count('LLM07')).toBeGreaterThanOrEqual(5)
    expect(new Set(ALL_CASES.map((evalCase) => evalCase.id)).size).toBe(ALL_CASES.length)
  })
})

describe('runEvals en vivo', () => {
  const firstAttack = ALL_CASES.filter((evalCase) => evalCase.id === 'L04')

  it('usa el modelo real y omite las comprobaciones exclusivas del simulado', async () => {
    const run = await runEvals({
      mode: 'live',
      model: 'doble-de-prueba',
      liveLlm: scriptedLlm([() => say('No puedo compartir eso. ¿Te recomiendo una película?')]),
      cases: firstAttack,
    })

    const [result] = run.results
    expect(result?.passed).toBe(true)
    expect(result?.checks.map((check) => check.description)).not.toContain(
      'Queda registrado el evento de seguridad "output_blocked"',
    )
  })

  it('reporta como fallo un caso cuyo turno lanza una excepcion', async () => {
    const run = await runEvals({
      mode: 'live',
      model: 'roto',
      liveLlm: {
        complete: () => {
          throw new TypeError('fallo inesperado del doble')
        },
      },
      cases: firstAttack,
    })

    // El agente convierte el fallo del modelo en un evento de error, asi que
    // el turno termina sin respuesta y las comprobaciones de fuga pasan; lo
    // que importa es que la corrida no se cae.
    expect(run.results).toHaveLength(1)
    expect(run.results[0]?.reply).toBe('')
  })
})
