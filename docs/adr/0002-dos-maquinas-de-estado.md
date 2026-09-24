# ADR 0002: conexión y conversación son dos máquinas de estado

- **Estado:** aceptada
- **Código:** `packages/core/src/state/conversation.ts`, `packages/core/src/domain/types.ts`

## Contexto

En un widget de chat, «el canal está abierto» y «el agente está respondiendo» son hechos independientes. Un corte de red no debe borrar el hilo, y una respuesta a medias no debe quedarse girando para siempre.

## Decisión

`ConversationState` guarda dos campos separados:

- `connection`: `idle`, `connecting`, `open`, `reconnecting`, `closed` o `error`.
- `phase`: `idle`, `sending` o `streaming`.

Un reductor puro (`conversationReducer`) aplica las acciones. Cuando el canal pasa a `closed`, `error` o `reconnecting`, la respuesta en curso conserva el texto recibido, queda marcada como `error` y la fase vuelve a `idle`. Solo se puede enviar con la fase en `idle` y la conexión en `open` (`canSubmit`).

## Alternativas consideradas

| Alternativa                        | Por qué se descartó                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Un solo `status` combinado         | Mezcla estados que ocurren a la vez (canal abierto con agente fallido, o al revés)                            |
| Estado dentro de componentes React | La lógica quedaría atada a la interfaz y sería difícil de probar sin renderizar                               |
| Redux o Zustand                    | Dependencia de runtime en el núcleo; el store propio cabe en pocas líneas y encaja con `useSyncExternalStore` |

## Consecuencias

- La interfaz muestra dos avisos distintos (`ConnectionNotice`): el estado del canal y el error del agente.
- Al implementar la reconexión apareció un caso no cubierto: `reconnecting` no liberaba la fase y bloqueaba el envío para siempre. Se corrigió en el reductor y quedó cubierto por pruebas.
- `ChatClient` toma el estado inicial del transporte al construirse, por si recibe un canal ya abierto.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
