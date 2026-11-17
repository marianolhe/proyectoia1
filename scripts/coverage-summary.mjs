// Convierte coverage/coverage-summary.json (reporter json-summary de Vitest)
// en una tabla Markdown para el resumen del job de GitHub Actions.
import { readFileSync } from 'node:fs'

const { total } = JSON.parse(readFileSync('coverage/coverage-summary.json', 'utf8'))
const metrics = {
  lines: 'Líneas',
  branches: 'Ramas',
  functions: 'Funciones',
  statements: 'Sentencias',
}

const rows = Object.entries(metrics).map(
  ([key, label]) =>
    `| ${label} | ${total[key].pct} % | ${total[key].covered} / ${total[key].total} |`,
)

console.log(
  ['## Cobertura', '', '| Métrica | % | Cubiertas |', '| --- | --- | --- |', ...rows].join('\n'),
)
