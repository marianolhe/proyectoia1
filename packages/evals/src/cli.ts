import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createLlm, loadConfig } from '@agichat/agent-server'
import { renderReport, summarize } from './report.js'
import { runEvals, type RunOptions } from './runner.js'

// Carga el .env de la raiz del repositorio si existe (`pnpm agent`, `pnpm evals`).
// En Docker no hay archivo: las variables ya llegan por el entorno. Las que
// ya estan definidas no se sobrescriben.
try {
  process.loadEnvFile(new URL('../../../.env', import.meta.url))
} catch {
  // Sin .env se usa solo el entorno del proceso.
}

/**
 * `pnpm evals`         corre sin conexion (determinista; es lo que usa CI).
 * `pnpm evals --live`  corre contra el modelo configurado en el entorno.
 * `--out <carpeta>`    donde escribir REPORTE.md y resultados.json.
 * `--pause-ms <n>`     pausa entre casos en modo --live (15000 por defecto).
 */

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function resolveOptions(): RunOptions | string {
  if (!process.argv.includes('--live')) return { mode: 'offline', model: 'simulado' }

  const loaded = loadConfig(process.env)
  if (!loaded.ok) return loaded.reason
  const { llm } = loaded.config
  const model =
    llm.provider === 'anthropic'
      ? (llm.model ?? 'claude-opus-5-5')
      : `${llm.model} (${llm.baseUrl})`
  const pauseMs = Number(argument('--pause-ms') ?? 15000)
  return { mode: 'live', model, liveLlm: createLlm(llm), pauseMs }
}

async function main(): Promise<void> {
  const options = resolveOptions()
  if (typeof options === 'string') {
    console.error(`[evals] ${options}`)
    process.exitCode = 1
    return
  }

  const run = await runEvals(options)
  const summary = summarize(run.results)

  const outDir = resolve(argument('--out') ?? 'docs/evals')
  const suffix = run.mode === 'live' ? '-live' : ''
  mkdirSync(outDir, { recursive: true })
  writeFileSync(resolve(outDir, `REPORTE${suffix}.md`), renderReport(run, new Date()))
  writeFileSync(resolve(outDir, `resultados${suffix}.json`), `${JSON.stringify(run, null, 2)}\n`)

  for (const result of run.results) {
    console.log(`${result.passed ? 'PASA ' : 'FALLA'} ${result.id} ${result.title}`)
  }
  console.log(`\n${summary.passed} de ${summary.total} casos aprobados. Reporte en ${outDir}`)
  if (summary.passed !== summary.total) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error('[evals] fallo inesperado', error)
  process.exitCode = 1
})
