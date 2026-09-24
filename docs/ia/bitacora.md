# Bitácora de uso de IA

Registro de cómo el equipo usó herramientas agénticas como guía. Cada entrada debe ser verificable en el código o en el historial de Git. Lo que propuso el agente y lo que decidió el equipo lo llena el equipo con la verdad: no se reconstruye a posteriori.

## Cómo registrar una entrada

| Campo               | Contenido                                              |
| ------------------- | ------------------------------------------------------ |
| Fecha y autor       | Quién usó la herramienta y cuándo                      |
| Herramienta         | Por ejemplo, Claude Code, Copilot o ChatGPT            |
| Prompt              | El pedido, resumido o textual                          |
| Salida del agente   | Qué propuso o generó                                   |
| Decisión del equipo | Qué se aceptó, qué se cambió, qué se rechazó y por qué |
| Evidencia           | Commit, PR o archivo afectado                          |

## Entradas

### 1. Diseño del puerto de transporte

- **Fecha y autor:** [COMPLETAR POR EL EQUIPO]
- **Herramienta:** [COMPLETAR POR EL EQUIPO]
- **Prompt:** [COMPLETAR POR EL EQUIPO]
- **Salida del agente:** [COMPLETAR POR EL EQUIPO]
- **Decisión del equipo:** [COMPLETAR POR EL EQUIPO]
- **Evidencia:** commit `abc5982`, PR #2, [ADR 0001](../adr/0001-puerto-como-flujo-de-eventos.md)

### 2. Servidor mock con lógica pura separada del socket

- **Fecha y autor:** [COMPLETAR POR EL EQUIPO]
- **Herramienta:** [COMPLETAR POR EL EQUIPO]
- **Prompt:** [COMPLETAR POR EL EQUIPO]
- **Salida del agente:** [COMPLETAR POR EL EQUIPO]
- **Decisión del equipo:** [COMPLETAR POR EL EQUIPO]
- **Evidencia:** commit `865b981`, PR #3

### 3. Interfaz React y sanitización de Markdown

- **Fecha y autor:** [COMPLETAR POR EL EQUIPO]
- **Herramienta:** [COMPLETAR POR EL EQUIPO]
- **Prompt:** [COMPLETAR POR EL EQUIPO]
- **Salida del agente:** [COMPLETAR POR EL EQUIPO]
- **Decisión del equipo:** [COMPLETAR POR EL EQUIPO]
- **Evidencia:** commit `bfad900`, [ADR 0005](../adr/0005-sanitizacion-de-markdown.md)

### 4. Auditoría contra la rúbrica y plan de cierre

- **Fecha y autor:** 2026-10-05, [COMPLETAR POR EL EQUIPO]
- **Herramienta:** Claude Code
- **Prompt:** auditar el repositorio contra la rúbrica del Proyecto 1 y proponer un plan de cierre por tareas pequeñas.
- **Salida del agente:** detectó la falta de CI/CD, AGENTS.md y documentación, la dependencia de las pruebas en `dist/`, el arranque roto de `pnpm mock` y los paquetes vacíos. Propuso las tareas T1 a T14.
- **Decisión del equipo:** [COMPLETAR POR EL EQUIPO]
- **Evidencia:** commits de T1 a T14 en `feature/ui-react`

### 5. Reconexión del adaptador WebSocket

- **Fecha y autor:** 2026-10-05, [COMPLETAR POR EL EQUIPO]
- **Herramienta:** Claude Code
- **Prompt:** implementar `WebSocketTransport` con reconexión exponencial y probarlo contra el servidor mock real.
- **Salida del agente:** el adaptador y sus pruebas. Al probar la demo, el agente encontró y corrigió tres defectos: el reductor no liberaba la fase al pasar a `reconnecting`; el doble montaje de React en modo estricto reutilizaba una conexión cancelada; y `ChatClient` ignoraba el estado de un transporte ya abierto.
- **Decisión del equipo:** [COMPLETAR POR EL EQUIPO]
- **Evidencia:** `packages/transport-ws/src/websocket-transport.ts`, `packages/core/src/state/conversation.ts`, [ADR 0002](../adr/0002-dos-maquinas-de-estado.md)
