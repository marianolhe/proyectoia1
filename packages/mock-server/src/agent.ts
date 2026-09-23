import type { OutboundMessage } from '@agichat/core'
import { selectScenario } from './responses.js'
import { streamFailure, streamResponse, type TurnDeps, type TurnTiming } from './streaming.js'

/**
 * Orquesta un turno completo: elige el escenario y lo transmite.
 *
 * Es la pieza que `server.ts` invoca por cada mensaje entrante valido; el
 * servidor solo le pasa las dependencias reales (socket y temporizador).
 */
export async function runAgentTurn(
  message: OutboundMessage,
  deps: TurnDeps,
  timing: TurnTiming = {},
): Promise<void> {
  const outcome = selectScenario(message.text)

  if (outcome.kind === 'failure') {
    await streamFailure(deps, outcome.scenario, timing)
    return
  }

  await streamResponse(`${message.messageId}-reply`, outcome.scenario.markdown, deps, timing)
}
