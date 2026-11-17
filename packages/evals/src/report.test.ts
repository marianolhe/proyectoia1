import { describe, expect, it } from 'vitest'
import * as api from './index.js'
import { renderReport, summarize } from './report.js'
import type { CaseResult, EvalRun } from './runner.js'
import { unwrapToolContent } from './simulated-llm.js'

const result = (overrides: Partial<CaseResult>): CaseResult => ({
  id: 'F01',
  category: 'funcional',
  title: 'Recomienda | una pelicula',
  rationale: 'Habilidad base.',
  input: 'Recomiéndame algo con `código`',
  reply: 'Te recomiendo **Duna**.',
  passed: true,
  checks: [{ description: 'Llama a la herramienta', passed: true }],
  ...overrides,
})

const RUN: EvalRun = {
  mode: 'offline',
  model: 'simulado',
  results: [
    result({}),
    result({
      id: 'I01',
      category: 'LLM01',
      passed: false,
      reply: '',
      error: 'explotó',
      checks: [{ description: 'No abre pestañas', passed: false }],
    }),
    result({ id: 'L01', category: 'LLM07', reply: 'x'.repeat(400) }),
  ],
}

describe('summarize', () => {
  it('cuenta aprobados por categoria', () => {
    expect(summarize(RUN.results)).toEqual({
      total: 3,
      passed: 2,
      byCategory: {
        funcional: { total: 1, passed: 1 },
        LLM01: { total: 1, passed: 0 },
        LLM07: { total: 1, passed: 1 },
      },
    })
  })
})

describe('renderReport', () => {
  const report = renderReport(RUN, new Date('2026-11-16T12:00:00Z'))

  it('incluye fecha, modelo, resultado global y nota del modo', () => {
    expect(report).toContain('- **Fecha:** 2026-11-16')
    expect(report).toContain('- **Modelo:** simulado')
    expect(report).toContain('2 de 3 casos aprobados')
    expect(report).toContain('Modo **sin conexión**')
  })

  it('tiene una seccion por categoria con el detalle de cada caso', () => {
    expect(report).toContain('## LLM01: Prompt Injection')
    expect(report).toContain('## LLM07: System Prompt Leakage')
    expect(report).toContain('### ❌ I01')
    expect(report).toContain('- **Error:** explotó')
    expect(report).toContain('_(ninguna)_')
    expect(report).toContain('  - ❌ No abre pestañas')
  })

  it('escapa barras de tablas, comillas invertidas y recorta respuestas largas', () => {
    expect(report).toContain('Recomienda \\| una pelicula')
    expect(report).toContain("`Recomiéndame algo con 'código'`")
    expect(report).toContain(`${'x'.repeat(160)}…`)
  })

  it('omite categorias sin casos y describe el modo en vivo', () => {
    const live = renderReport({ ...RUN, mode: 'live', results: [result({})] }, new Date())
    expect(live).toContain('Modo **en vivo**')
    expect(live).not.toContain('## LLM01: Prompt Injection')
  })
})

describe('unwrapToolContent', () => {
  it('extrae el JSON del delimitador y tolera basura', () => {
    expect(
      unwrapToolContent('<datos_externos herramienta="x">\n{"a":1}\n</datos_externos>'),
    ).toEqual({
      a: 1,
    })
    expect(unwrapToolContent('sin delimitador')).toEqual({})
    expect(unwrapToolContent('<datos_externos>\nno json\n</datos_externos>')).toEqual({})
    expect(unwrapToolContent('<datos_externos>\n3\n</datos_externos>')).toEqual({})
  })
})

describe('API publica de @agichat/evals', () => {
  it('expone casos, banco de pruebas, runner y reporte', () => {
    expect(Object.keys(api)).toEqual(
      expect.arrayContaining([
        'ALL_CASES',
        'runEvals',
        'renderReport',
        'runTurn',
        'createFakeApis',
      ]),
    )
  })
})
