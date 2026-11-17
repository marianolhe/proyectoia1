import type { EvalCategory } from './cases/types.js'
import type { CaseResult, EvalRun } from './runner.js'

/**
 * Reporte de resultados en Markdown. Se genera, no se escribe a mano: lo que
 * dice el documento es exactamente lo que paso en la corrida.
 */

const CATEGORY_TITLES: Record<EvalCategory, string> = {
  funcional: 'Uso correcto del agente',
  LLM01: 'LLM01: Prompt Injection',
  LLM07: 'LLM07: System Prompt Leakage',
}

const CATEGORIES: readonly EvalCategory[] = ['funcional', 'LLM01', 'LLM07']

const MODE_NOTES: Record<EvalRun['mode'], string> = {
  offline:
    'Modo **sin conexión**: el modelo es simulado. En los casos funcionales sigue un guion de llamadas a herramientas; en los ataques es un modelo **ya comprometido** que hace lo que el atacante quiere. Lo que se mide es si el backend (filtros, saneo de datos externos, lista blanca de URL y revisión de salida) contiene el daño aun cuando el modelo falla. No mide el criterio de un modelo real.',
  live: 'Modo **en vivo**: las respuestas son de un modelo real. Las APIs de TMDB y Google Books siguen simuladas para que los datos sean reproducibles. Las comprobaciones que exigen que el modelo haya sido comprometido se omiten.',
}

function mark(passed: boolean): string {
  return passed ? '✅' : '❌'
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
}

function excerpt(text: string, max = 160): string {
  const flat = cell(text)
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

export interface Summary {
  readonly total: number
  readonly passed: number
  readonly byCategory: Record<EvalCategory, { total: number; passed: number }>
}

export function summarize(results: readonly CaseResult[]): Summary {
  const byCategory: Summary['byCategory'] = {
    funcional: { total: 0, passed: 0 },
    LLM01: { total: 0, passed: 0 },
    LLM07: { total: 0, passed: 0 },
  }
  for (const result of results) {
    byCategory[result.category].total += 1
    if (result.passed) byCategory[result.category].passed += 1
  }
  return {
    total: results.length,
    passed: results.filter((result) => result.passed).length,
    byCategory,
  }
}

function caseSection(result: CaseResult): string {
  const lines = [
    `### ${mark(result.passed)} ${result.id} · ${result.title}`,
    '',
    `- **Qué demuestra:** ${result.rationale}`,
    `- **Entrada:** \`${excerpt(result.input, 200).replace(/`/g, "'")}\``,
    `- **Respuesta que vio el usuario:** ${result.reply === '' ? '_(ninguna)_' : excerpt(result.reply)}`,
  ]
  if (result.error !== undefined) lines.push(`- **Error:** ${cell(result.error)}`)
  lines.push('', ...result.checks.map((check) => `  - ${mark(check.passed)} ${check.description}`))
  return lines.join('\n')
}

export function renderReport(run: EvalRun, generatedAt: Date): string {
  const summary = summarize(run.results)
  const lines: string[] = [
    '# Reporte de evals del agente',
    '',
    '> Archivo generado por `pnpm evals`. No lo edite a mano: vuelva a generarlo.',
    '',
    `- **Fecha:** ${generatedAt.toISOString().slice(0, 10)}`,
    `- **Modelo:** ${run.model}`,
    `- **Resultado:** ${summary.passed} de ${summary.total} casos aprobados`,
    '',
    MODE_NOTES[run.mode],
    '',
    '## Resumen',
    '',
    '| Categoría | Aprobados | Total |',
    '| --- | --- | --- |',
    ...CATEGORIES.map(
      (category) =>
        `| ${CATEGORY_TITLES[category]} | ${summary.byCategory[category].passed} | ${summary.byCategory[category].total} |`,
    ),
    '',
    '| Caso | Categoría | Título | Resultado |',
    '| --- | --- | --- | --- |',
    ...run.results.map(
      (result) =>
        `| ${result.id} | ${result.category} | ${cell(result.title)} | ${mark(result.passed)} |`,
    ),
  ]

  for (const category of CATEGORIES) {
    const results = run.results.filter((result) => result.category === category)
    if (results.length === 0) continue
    lines.push('', `## ${CATEGORY_TITLES[category]}`, '')
    lines.push(results.map(caseSection).join('\n\n'))
  }

  return `${lines.join('\n')}\n`
}
