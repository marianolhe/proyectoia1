/**
 * Respuestas predefinidas y seleccion de escenario.
 *
 * Logica pura: dado el texto que escribio el usuario, decide que escenario
 * de agente corresponde. No conoce sockets ni temporizadores, por lo que se
 * prueba sin levantar nada.
 */

export interface ResponseScenario {
  readonly id: string
  readonly markdown: string
}

export interface FailureScenario {
  readonly id: string
  readonly code: string
  readonly message: string
  readonly recoverable: boolean
}

export type TurnOutcome =
  | { readonly kind: 'response'; readonly scenario: ResponseScenario }
  | { readonly kind: 'failure'; readonly scenario: FailureScenario }

const SHOWCASE_MARKDOWN = `# Resumen de flota

Esta es una respuesta de ejemplo que ejercita **negritas**, enlaces y mas.

## Proximos pasos

1. Revisar el manifiesto de carga
2. Confirmar la ruta con el operador
3. Notificar al cliente

- Puerto de origen: Puerto Quetzal
- Puerto de destino: Puerto Barrios
- Estado: en transito

\`\`\`ts
function eta(distanciaKm: number, velocidadKmH: number): number {
  return distanciaKm / velocidadKmH
}
\`\`\`

| Ruta | Distancia | ETA |
| --- | --- | --- |
| Puerto Quetzal a Puerto Barrios | 620 km | 9 h |
| Puerto Barrios a Ciudad de Guatemala | 300 km | 5 h |

> La ventana de atraque se confirma 24 horas antes de la llegada.

Mas detalles en [el panel de seguimiento](https://agichat.example.com/tracking).
`

const XSS_PROBE_MARKDOWN = `# Aviso de prueba

Este contenido incluye HTML potencialmente peligroso a proposito, para que
el cliente demuestre que su sanitizador lo neutraliza antes de renderizarlo:

<script>alert('inyectado')</script>

<img src="x" onerror="alert('inyectado')" />

[enlace sospechoso](javascript:alert('inyectado'))
`

export const SHOWCASE_SCENARIO: ResponseScenario = { id: 'showcase', markdown: SHOWCASE_MARKDOWN }
export const XSS_SCENARIO: ResponseScenario = { id: 'xss-probe', markdown: XSS_PROBE_MARKDOWN }

export const RESPONSE_SCENARIOS: readonly ResponseScenario[] = [SHOWCASE_SCENARIO, XSS_SCENARIO]

export const FAILURE_SCENARIO: FailureScenario = {
  id: 'agent-failure',
  code: 'agent_unavailable',
  message: 'El agente no pudo completar la respuesta.',
  recoverable: true,
}

// Palabras clave que un integrador puede escribir a proposito para ejercitar
// cada escenario de demostracion. No es deteccion de intencion real: es un
// servidor de pruebas, no un agente.
const FAILURE_TRIGGERS = ['fall', 'fail', 'error']
const XSS_TRIGGERS = ['xss', 'html', 'script']

export function selectScenario(text: string): TurnOutcome {
  const normalized = text.toLowerCase()

  if (FAILURE_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return { kind: 'failure', scenario: FAILURE_SCENARIO }
  }
  if (XSS_TRIGGERS.some((trigger) => normalized.includes(trigger))) {
    return { kind: 'response', scenario: XSS_SCENARIO }
  }
  return { kind: 'response', scenario: SHOWCASE_SCENARIO }
}
