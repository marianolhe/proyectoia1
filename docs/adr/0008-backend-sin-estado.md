# ADR 0008: backend sin estado, con el historial en cada mensaje

- **Estado:** aceptada
- **Código:** `packages/core/src/chat-client.ts` (`buildHistory`), `packages/agent-server/src/protocol.ts`, `packages/mcp-kit/src/http-server.ts`, `docker-compose.yml`

## Contexto

Maxine quiere una infraestructura escalable. Un agente conversacional necesita el contexto de los turnos anteriores, y el lugar donde vive ese contexto decide cómo escala el backend.

## Decisión

Ni el agente ni los MCP Servers guardan estado de conversación. El widget ya tiene la conversación en su máquina de estados, así que `ChatClient` envía los últimos 12 mensajes completos junto con cada mensaje nuevo. El agente los valida y recorta (`protocol.ts`) y los filtra (`sanitizeHistory`). Los MCP Servers usan Streamable HTTP en modo sin estado: un servidor MCP por petición.

## Alternativas consideradas

| Alternativa                                | Por qué se descartó                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Historial en memoria del agente por socket | Exige afinidad de sesión en el balanceador; una réplica que se reinicia o una reconexión pierden la conversación |
| Historial en Redis o una base de datos     | Agrega un servicio que operar para un dato que el cliente ya tiene                                               |
| Sesiones MCP con estado                    | Obliga a que cada agente vuelva siempre a la misma réplica del MCP                                               |

## Consecuencias

- Cualquier réplica atiende cualquier turno; escalar es agregar contenedores.
- El historial viene del cliente y no es de fiar: por eso se limita, se valida campo por campo y se vuelve a pasar por el filtro de entrada.
- Cada mensaje viaja con algo más de datos (acotado a 12 mensajes de 4,000 caracteres).
- Lo único en memoria es optimización: el caché de cada MCP. Perderlo solo cuesta peticiones a la API.

## Rol de la IA

- **Qué propuso el agente:** [COMPLETAR POR EL EQUIPO]
- **Qué decidió el equipo y por qué:** [COMPLETAR POR EL EQUIPO]
